import { createHash } from "node:crypto";
import {
  CoordinatorErrorCode, CoordinatorInspectionClassification, CoordinatorStep, CoordinatorStepStatus,
  EXPANDED_AP_STEPS, coordinatorError, freeze, nextCoordinatorStep, requireRunId,
} from "./combinedCutoverCoordinatorContract.js";
import { coordinatorStateDigest, validateCoordinatorAuthorization } from "./combinedCutoverCoordinatorAuthorization.js";
import { createCoordinatorBSnapshot, validateCoordinatorBSnapshot } from "./combinedCutoverBSnapshot.js";

const A_CATEGORIES = Object.freeze([
  "authorization", "windowsSource", "providerBuild", "targetIsolation", "backups", "costCeiling",
  "routingZone", "routingLeaf", "windowsTarget", "providerTarget", "customDomains", "tlsSni",
  "deploymentBuild", "routingReadback", "workerControl",
]);
const P_CATEGORIES = Object.freeze(["health", "readiness", "worker", "authority", "routing", "backups", "domainMediaOutbox", "crossClient"]);

/** External, one-step-at-a-time coordinator. Domain services and their durable receipts stay authoritative. */
export function createExternalCombinedCutoverCoordinator({ store, authorityStore, services, now = () => new Date() } = {}) {
  assertDependencies({ store, authorityStore, services });
  return freeze({ createRun, inspect, advance, recover });

  async function createRun({ identity } = {}) {
    const normalized = normalizeIdentity(identity);
    return store.createRun(normalized);
  }

  async function inspect({ runId, input } = {}) {
    const run = await readBoundRun(runId, input);
    const authority = (await authorityStore.read()).state;
    assertOperationAuthority(run, authority);
    const posture = await services.statusService.inspect({ run, input, authority });
    const m = inspectM(authority, input);
    const completedSteps = expandCompleted(run.completedSteps);
    return freeze({
      runId: run.runId,
      coordinatorOperationId: run.coordinatorOperationId,
      migrationOperationId: run.migrationOperationId,
      providerDeploymentId: String(input?.providerDeploymentId ?? ""),
      providerBuildId: String(input?.providerBuildId ?? ""),
      durablePhase: run.currentStep,
      stepStatus: run.stepStatus,
      completedSteps,
      nextLegalStep: nextCoordinatorStep(run.completedSteps),
      blockingPreconditions: safeStrings(posture?.blockingPreconditions),
      mOccurred: m.classification === CoordinatorInspectionClassification.COMPLETED,
      rollbackToWindowsLegal: ![CoordinatorInspectionClassification.COMPLETED, CoordinatorInspectionClassification.AMBIGUOUS].includes(m.classification) && posture?.rollbackToWindowsLegal === true,
      providerForwardRecoveryRequired: [CoordinatorInspectionClassification.COMPLETED, CoordinatorInspectionClassification.AMBIGUOUS].includes(m.classification) || posture?.providerForwardRecoveryRequired === true,
      routingRole: safeRole(posture?.routingRole),
      workerRole: safeRole(posture?.workerRole),
      authorityClassification: safeRole(authority.authority),
      bSnapshotRef: run.bSnapshotDigest ? freeze({ digest: run.bSnapshotDigest, runId: run.runId }) : null,
      version: run.version,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    });
  }

  async function advance({ runId, input, authorization = null } = {}) {
    let run = await readBoundRun(runId, input);
    const authority = (await authorityStore.read()).state;
    assertOperationAuthority(run, authority);
    if (run.currentStep === CoordinatorStep.COMPLETE) return freeze({ classification: "COMPLETED", run, inspection: await inspect({ runId, input }) });
    const step = run.currentStep;

    // An interrupted or ambiguous step is reconciliation-only. This invocation can never dispatch
    // another mutation; a conclusive NOT_APPLIED result is recorded and requires a fresh invocation.
    if ([CoordinatorStepStatus.IN_PROGRESS_OR_UNRESOLVED, CoordinatorStepStatus.FAILED_AMBIGUOUS].includes(run.stepStatus)) {
      return reconcileOnly({ run, input, step });
    }

    const digest = coordinatorStateDigest(run, authority);
    const approval = validateCoordinatorAuthorization(authorization, { run, step, priorStateDigest: digest, now: now() });
    run = (await store.beginStep({ runId: run.runId, expectedVersion: run.version, step, approvalFingerprint: approval?.fingerprint ?? null })).run;
    if (step === CoordinatorStep.B) return executeB({ run, input });
    if (step === CoordinatorStep.M) return executeM({ run, input });
    return executeOrdinary({ run, input, step });
  }

  async function recover({ runId, input, authorization, error = null } = {}) {
    let run = await readBoundRun(runId, input);
    const authority = (await authorityStore.read()).state;
    const m = inspectM(authority, input);
    if (m.classification === CoordinatorInspectionClassification.AMBIGUOUS) {
      throw coordinatorError(CoordinatorErrorCode.FIRST_WRITE_AMBIGUOUS, "Recovery direction is blocked until the first-provider-write transaction is conclusively reconciled.");
    }
    const recoveryStep = m.classification === CoordinatorInspectionClassification.COMPLETED || authority.authority === "recovery-required" ? "PROVIDER_FORWARD_RECOVERY" : "RECOVER_TO_WINDOWS";
    const recoveryService = recoveryStep === "PROVIDER_FORWARD_RECOVERY" ? services.providerRecoveryService : services.windowsRecoveryService;
    if (run.failureCode === "COORDINATOR_RECOVERY_AMBIGUOUS") {
      const reconciled = normalizeInspection(await safeInspect(recoveryService, { input, run, authority }));
      if (reconciled.classification !== CoordinatorInspectionClassification.COMPLETED) {
        return freeze({ classification: CoordinatorStepStatus.FAILED_AMBIGUOUS, run, reconciliationOnly: true });
      }
      const recoveredStatus = recoveryStep === "PROVIDER_FORWARD_RECOVERY" ? CoordinatorStepStatus.PROVIDER_FORWARD_RECOVERY : CoordinatorStepStatus.ABORTED_TO_WINDOWS;
      run = (await store.recordStepOutcome({ runId: run.runId, expectedVersion: run.version, step: run.currentStep, status: recoveredStatus, evidenceRef: evidence(reconciled.evidence), failureCode: null })).run;
      return freeze({ classification: recoveredStatus, run, reconciliationOnly: true });
    }
    const approval = validateCoordinatorAuthorization(authorization, { run, step: recoveryStep, priorStateDigest: coordinatorStateDigest(run, authority), now: now() });
    if (!approval) throw coordinatorError(CoordinatorErrorCode.AUTHORIZATION_REQUIRED, "Recovery authorization is required.");
    if (recoveryStep === "PROVIDER_FORWARD_RECOVERY") {
      const result = await executeRecovery(recoveryService, "enterProviderRecovery", { input, run, authority, error });
      if (result.ambiguous) return recordAmbiguousRecovery(run, result.evidence, approval);
      if (result?.ready !== true) return recordAmbiguousRecovery(run, result, approval);
      run = (await store.recordStepOutcome({ runId: run.runId, expectedVersion: run.version, step: run.currentStep, status: CoordinatorStepStatus.PROVIDER_FORWARD_RECOVERY, evidenceRef: evidence(result), failureCode: null, approvalFingerprint: approval.fingerprint })).run;
      return freeze({ classification: CoordinatorStepStatus.PROVIDER_FORWARD_RECOVERY, run });
    }
    if (!run.bSnapshot) throw coordinatorError(CoordinatorErrorCode.SNAPSHOT_CONFLICT, "Pre-M recovery requires the exact durable B snapshot.");
    const envelope = validateCoordinatorBSnapshot(run.bSnapshot, { runId: run.runId, migrationOperationId: run.migrationOperationId });
    const result = await executeRecovery(recoveryService, "restorePreBoundaryWindows", { input, run, snapshot: envelope.snapshot, error });
    if (result.ambiguous) return recordAmbiguousRecovery(run, result.evidence, approval);
    if (result?.ready !== true || result?.classification !== "RESTORED") return recordAmbiguousRecovery(run, result, approval);
    run = (await store.recordStepOutcome({ runId: run.runId, expectedVersion: run.version, step: run.currentStep, status: CoordinatorStepStatus.ABORTED_TO_WINDOWS, evidenceRef: evidence(result), failureCode: null, approvalFingerprint: approval.fingerprint })).run;
    return freeze({ classification: CoordinatorStepStatus.ABORTED_TO_WINDOWS, run });
  }

  async function executeRecovery(service, method, args) {
    const before = normalizeInspection(await safeInspect(service, args));
    if (before.classification === CoordinatorInspectionClassification.COMPLETED) return { ...before.evidence, ready: true, classification: method === "restorePreBoundaryWindows" ? "RESTORED" : "RECOVERED" };
    if (before.classification !== CoordinatorInspectionClassification.NOT_APPLIED) return { ambiguous: true, evidence: before.evidence };
    try { return await service[method](args); } catch {
      const after = normalizeInspection(await safeInspect(service, args));
      if (after.classification === CoordinatorInspectionClassification.COMPLETED) return { ...after.evidence, ready: true, classification: method === "restorePreBoundaryWindows" ? "RESTORED" : "RECOVERED" };
      return { ambiguous: true, evidence: after.evidence };
    }
  }

  async function recordAmbiguousRecovery(run, evidenceRef, approval) {
    const updated = (await store.recordStepOutcome({ runId: run.runId, expectedVersion: run.version, step: run.currentStep, status: CoordinatorStepStatus.FAILED_AMBIGUOUS, evidenceRef: evidence(evidenceRef), failureCode: "COORDINATOR_RECOVERY_AMBIGUOUS", approvalFingerprint: approval.fingerprint })).run;
    return freeze({ classification: CoordinatorStepStatus.FAILED_AMBIGUOUS, run: updated });
  }

  async function executeOrdinary({ run, input, step }) {
    const service = serviceFor(step);
    const before = inspectIdentity(normalizeInspection(await service.inspect({ run, input })), run, input, step);
    if (before.classification === CoordinatorInspectionClassification.COMPLETED) return complete(run, step, before.evidence);
    if (before.classification === CoordinatorInspectionClassification.BLOCKED) return fail(run, step, CoordinatorStepStatus.BLOCKED_PRECONDITION, before);
    if (before.classification === CoordinatorInspectionClassification.AMBIGUOUS) return fail(run, step, CoordinatorStepStatus.FAILED_AMBIGUOUS, before);
    if (before.classification !== CoordinatorInspectionClassification.NOT_APPLIED) return fail(run, step, CoordinatorStepStatus.FAILED_CONCLUSIVE, before);
    try {
      await service.execute({ run, input });
    } catch (error) {
      if (error?.simulatedCrash === true) throw error;
      const afterError = inspectIdentity(normalizeInspection(await safeInspect(service, { run, input })), run, input, step);
      if (afterError.classification === CoordinatorInspectionClassification.COMPLETED) return complete(run, step, afterError.evidence);
      return fail(run, step, afterError.classification === CoordinatorInspectionClassification.NOT_APPLIED ? CoordinatorStepStatus.FAILED_CONCLUSIVE : CoordinatorStepStatus.FAILED_AMBIGUOUS, afterError, error.code);
    }
    const after = inspectIdentity(normalizeInspection(await safeInspect(service, { run, input })), run, input, step);
    if (after.classification !== CoordinatorInspectionClassification.COMPLETED) return fail(run, step, statusFor(after.classification), after);
    return complete(run, step, after.evidence);
  }

  async function executeB({ run, input }) {
    let current = run;
    const fenceBefore = normalizeInspection(await services.windowsFenceService.inspect({ run: current, input }));
    let fenceEvidence = fenceBefore.evidence;
    if (fenceBefore.classification !== CoordinatorInspectionClassification.COMPLETED) {
      if (fenceBefore.classification !== CoordinatorInspectionClassification.NOT_APPLIED) return fail(current, CoordinatorStep.B, statusFor(fenceBefore.classification), fenceBefore);
      try { await services.windowsFenceService.activate({ run: current, input }); } catch (error) {
        if (error?.simulatedCrash === true) throw error;
      }
      const fenceAfter = normalizeInspection(await safeInspect(services.windowsFenceService, { run: current, input }));
      if (fenceAfter.classification !== CoordinatorInspectionClassification.COMPLETED) return fail(current, CoordinatorStep.B, statusFor(fenceAfter.classification), fenceAfter);
      fenceEvidence = fenceAfter.evidence;
    }
    if (!current.bSnapshot) {
      const captured = await services.windowsCadenceService.captureAfterWriteFence({ run: current, input, fenceEvidence });
      const authority = (await authorityStore.read()).state;
      const envelope = createCoordinatorBSnapshot({ run: current, authority, snapshot: captured?.snapshot, capturedAt: now().toISOString() });
      current = (await store.saveBSnapshot({ runId: current.runId, expectedVersion: current.version, snapshot: envelope })).run;
    }
    const cadenceBefore = normalizeInspection(await services.windowsCadenceService.inspect({ run: current, input }));
    if (cadenceBefore.classification !== CoordinatorInspectionClassification.COMPLETED) {
      if (cadenceBefore.classification !== CoordinatorInspectionClassification.NOT_APPLIED) return fail(current, CoordinatorStep.B, statusFor(cadenceBefore.classification), cadenceBefore);
      try { await services.windowsCadenceService.quiesceAfterWriteFence({ run: current, input, fenceEvidence, snapshot: current.bSnapshot.snapshot }); } catch (error) {
        if (error?.simulatedCrash === true) throw error;
      }
    }
    const cadenceAfter = normalizeInspection(await safeInspect(services.windowsCadenceService, { run: current, input }));
    if (cadenceAfter.classification !== CoordinatorInspectionClassification.COMPLETED) return fail(current, CoordinatorStep.B, statusFor(cadenceAfter.classification), cadenceAfter);
    return complete(current, CoordinatorStep.B, { fenceId: fenceEvidence?.fenceId, snapshotDigest: current.bSnapshotDigest, status: "fenced-and-quiesced" });
  }

  async function executeM({ run, input }) {
    const authorityBefore = (await authorityStore.read()).state;
    const before = inspectM(authorityBefore, input);
    if (before.classification === CoordinatorInspectionClassification.COMPLETED) return complete(run, CoordinatorStep.M, before.evidence, true);
    if (before.classification !== CoordinatorInspectionClassification.NOT_APPLIED) return fail(run, CoordinatorStep.M, statusFor(before.classification), before);
    try {
      await services.firstProviderCommandService.executeFirstProviderCommand({ run, input, commandId: required(input?.firstProviderCommandId, "firstProviderCommandId") });
    } catch (error) {
      if (error?.simulatedCrash === true) throw error;
    }
    const after = inspectM((await authorityStore.read()).state, input);
    if (after.classification === CoordinatorInspectionClassification.COMPLETED) return complete(run, CoordinatorStep.M, after.evidence, true);
    return fail(run, CoordinatorStep.M, after.classification === CoordinatorInspectionClassification.NOT_APPLIED ? CoordinatorStepStatus.FAILED_CONCLUSIVE : CoordinatorStepStatus.FAILED_AMBIGUOUS, after, CoordinatorErrorCode.FIRST_WRITE_AMBIGUOUS);
  }

  async function reconcileOnly({ run, input, step }) {
    if (step === CoordinatorStep.B) {
      const fence = normalizeInspection(await safeInspect(services.windowsFenceService, { run, input }));
      const cadence = normalizeInspection(await safeInspect(services.windowsCadenceService, { run, input }));
      if (run.bSnapshot && fence.classification === CoordinatorInspectionClassification.COMPLETED && cadence.classification === CoordinatorInspectionClassification.COMPLETED) {
        return complete(run, step, { fenceId: fence.evidence?.fenceId, snapshotDigest: run.bSnapshotDigest, status: "reconciled" });
      }
      return fail(run, step, reconcileStatus(fence, cadence), { evidence: { status: "B-reconciliation-only" } });
    }
    if (step === CoordinatorStep.M) {
      const result = inspectM((await authorityStore.read()).state, input);
      if (result.classification === CoordinatorInspectionClassification.COMPLETED) return complete(run, step, result.evidence, true);
      return fail(run, step, result.classification === CoordinatorInspectionClassification.NOT_APPLIED ? CoordinatorStepStatus.FAILED_CONCLUSIVE : CoordinatorStepStatus.FAILED_AMBIGUOUS, result);
    }
    const result = inspectIdentity(normalizeInspection(await safeInspect(serviceFor(step), { run, input })), run, input, step);
    if (result.classification === CoordinatorInspectionClassification.COMPLETED) return complete(run, step, result.evidence);
    return fail(run, step, result.classification === CoordinatorInspectionClassification.NOT_APPLIED ? CoordinatorStepStatus.FAILED_CONCLUSIVE : statusFor(result.classification), result);
  }

  async function complete(run, step, evidenceRef, mBoundaryCrossed = false) {
    const result = await store.recordStepOutcome({ runId: run.runId, expectedVersion: run.version, step, status: CoordinatorStepStatus.COMPLETED, evidenceRef: evidence(evidenceRef), completed: true, mBoundaryCrossed });
    return freeze({ classification: step === CoordinatorStep.M ? CoordinatorStepStatus.IRREVERSIBLE_BOUNDARY_CROSSED : CoordinatorStepStatus.COMPLETED, step, run: result.run });
  }
  async function fail(run, step, status, inspectionValue, failureCode = null) {
    const result = await store.recordStepOutcome({ runId: run.runId, expectedVersion: run.version, step, status, evidenceRef: evidence(inspectionValue?.evidence ?? inspectionValue), failureCode: failureCode ?? inspectionValue?.failureCode ?? null });
    return freeze({ classification: status, step, run: result.run });
  }

  function serviceFor(step) {
    return ({ A: services.preflightService, C_D: services.finalPackageService, E: services.transferService,
      F_G: services.importService, H_I_J: services.providerValidationService, K: services.preparationService,
      L: services.authorityHandoffService, N_O: services.workerHandoffService, P: services.stabilizationService })[step];
  }

  function inspectM(authority, input) {
    const expectedCommandId = String(input?.firstProviderCommandId ?? "");
    const timestamp = authority?.firstProviderCanonicalWriteAt;
    const commandId = authority?.firstProviderCommandId;
    if (typeof timestamp === "string" && exactIso(timestamp) && commandId === expectedCommandId && expectedCommandId) return { classification: CoordinatorInspectionClassification.COMPLETED, evidence: { status: "durable-first-write", operationId: authority.migrationOperationId } };
    if (timestamp == null && commandId == null) return authority?.authority === "provider-authoritative" ? { classification: CoordinatorInspectionClassification.NOT_APPLIED, evidence: { status: "provider-authoritative-before-M" } } : { classification: CoordinatorInspectionClassification.BLOCKED, evidence: { status: "provider-authority-required" } };
    return { classification: CoordinatorInspectionClassification.AMBIGUOUS, evidence: { status: "first-write-identity-mismatch" } };
  }

  async function readBoundRun(runId, input) {
    const run = (await store.readRun(requireRunId(runId))).run;
    if (run.inputDigest !== coordinatorInputDigest(input) || run.migrationOperationId !== String(input?.migrationOperationId ?? "") || run.authorizationFingerprint !== String(input?.authorizationFingerprint ?? "").toLowerCase()) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, "Coordinator input does not match the durable run identity.");
    return run;
  }
}

export function coordinatorInputDigest(input) {
  const safe = {
    migrationOperationId: requireRunId(input?.migrationOperationId, "migrationOperationId"), commandPrefix: required(input?.commandPrefix, "commandPrefix"),
    authorizationFingerprint: digest(input?.authorizationFingerprint, "authorizationFingerprint"), expectedRuntimeSha256: digest(input?.expectedRuntimeSha256, "expectedRuntimeSha256"),
    expectedRuntimeRevision: nonnegativeInteger(input?.expectedRuntimeRevision, "expectedRuntimeRevision"), providerDeploymentId: required(input?.providerDeploymentId, "providerDeploymentId"),
    providerBuildId: required(input?.providerBuildId, "providerBuildId"), routingTarget: required(input?.routingTarget, "routingTarget"),
    firstProviderCommandId: required(input?.firstProviderCommandId, "firstProviderCommandId"),
  };
  return createHash("sha256").update(stable(safe)).digest("hex");
}

function normalizeIdentity(value) { return freeze({ runId: requireRunId(value?.runId), coordinatorOperationId: requireRunId(value?.coordinatorOperationId, "coordinatorOperationId"), migrationOperationId: requireRunId(value?.migrationOperationId, "migrationOperationId"), environment: required(value?.environment, "environment"), authorizationFingerprint: digest(value?.authorizationFingerprint, "authorizationFingerprint"), inputDigest: digest(value?.inputDigest, "inputDigest") }); }
function assertOperationAuthority(run, authority) { if (authority?.migrationOperationId != null && authority.migrationOperationId !== run.migrationOperationId) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, "Runtime authority belongs to another migration operation."); }
function normalizeInspection(value) { const classification = value?.classification; if (!Object.values(CoordinatorInspectionClassification).includes(classification)) return { classification: CoordinatorInspectionClassification.AMBIGUOUS, evidence: { status: "unclassifiable-inspection" } }; if (classification === CoordinatorInspectionClassification.COMPLETED && value.categories) { const requiredCategories = value.phase === "P" ? P_CATEGORIES : value.phase === "A" ? A_CATEGORIES : []; if (requiredCategories.some((name) => value.categories[name] !== true)) return { classification: CoordinatorInspectionClassification.BLOCKED, evidence: { status: "incomplete-categories" } }; } return value; }
async function safeInspect(service, context) { try { return await service.inspect(context); } catch { return { classification: CoordinatorInspectionClassification.AMBIGUOUS, evidence: { status: "inspection-unavailable" } }; } }
function statusFor(classification) { if (classification === CoordinatorInspectionClassification.BLOCKED) return CoordinatorStepStatus.BLOCKED_PRECONDITION; if (classification === CoordinatorInspectionClassification.NOT_APPLIED || classification === CoordinatorInspectionClassification.FAILED) return CoordinatorStepStatus.FAILED_CONCLUSIVE; return CoordinatorStepStatus.FAILED_AMBIGUOUS; }
function reconcileStatus(...values) { return values.some((value) => value.classification === CoordinatorInspectionClassification.AMBIGUOUS) ? CoordinatorStepStatus.FAILED_AMBIGUOUS : CoordinatorStepStatus.FAILED_CONCLUSIVE; }
function evidence(value) { if (!value || typeof value !== "object") return null; const allowed = ["runId","receiptId","transferReceiptId","preparationReceiptId","packageDigest","deploymentId","providerDeploymentId","buildId","fenceId","snapshotDigest","routingRole","workerRole","authority","status","classification","operationId","checkedAt"]; return freeze(Object.fromEntries(allowed.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]))); }
function inspectIdentity(value, run, input, step) {
  const ref = value?.evidence ?? {};
  const categories = step === CoordinatorStep.A ? A_CATEGORIES : step === CoordinatorStep.P ? P_CATEGORIES : [];
  const categoryMismatch = value.classification === CoordinatorInspectionClassification.COMPLETED && categories.some((name) => value.categories?.[name] !== true);
  const lMismatch = step === CoordinatorStep.L && value.classification === CoordinatorInspectionClassification.COMPLETED && (ref.routingRole !== "provider" || ref.workerRole !== "provider-inert");
  if (categoryMismatch || lMismatch || (ref.runId != null && ref.runId !== run.runId) || (ref.operationId != null && ref.operationId !== run.migrationOperationId) || (step === CoordinatorStep.N_O && ref.providerDeploymentId !== input?.providerDeploymentId)) return { classification: CoordinatorInspectionClassification.BLOCKED, evidence: { status: "evidence-identity-mismatch" }, failureCode: CoordinatorErrorCode.IDENTITY_MISMATCH };
  return value;
}
function expandCompleted(groups) { return freeze(groups.flatMap((step) => EXPANDED_AP_STEPS[step] ?? [])); }
function safeStrings(values) { return freeze((Array.isArray(values) ? values : []).map((value) => String(value).slice(0, 120)).slice(0, 20)); }
function safeRole(value) { return String(value ?? "unknown").slice(0, 80); }
function assertDependencies({ store, authorityStore, services }) {
  for (const method of ["createRun","readRun","beginStep","recordStepOutcome","saveBSnapshot"]) if (typeof store?.[method] !== "function") throw new Error(`Coordinator store requires ${method}.`);
  if (typeof authorityStore?.read !== "function") throw new Error("Coordinator requires the durable runtime-authority store.");
  for (const name of ["preflightService","finalPackageService","transferService","importService","providerValidationService","preparationService","authorityHandoffService","workerHandoffService","stabilizationService"]) for (const method of ["inspect","execute"]) if (typeof services?.[name]?.[method] !== "function") throw new Error(`Coordinator requires ${name}.${method}.`);
  for (const [name, methods] of Object.entries({ windowsFenceService: ["inspect","activate"], windowsCadenceService: ["inspect","captureAfterWriteFence","quiesceAfterWriteFence"], firstProviderCommandService: ["executeFirstProviderCommand"], windowsRecoveryService: ["inspect","restorePreBoundaryWindows"], providerRecoveryService: ["inspect","enterProviderRecovery"], statusService: ["inspect"] })) for (const method of methods) if (typeof services?.[name]?.[method] !== "function") throw new Error(`Coordinator requires ${name}.${method}.`);
}
function exactIso(value) { try { return new Date(value).toISOString() === value; } catch { return false; } }
function digest(value, field) { const result = String(value ?? "").toLowerCase(); if (!/^[0-9a-f]{64}$/.test(result)) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} is invalid.`); return result; }
function required(value, field) { const result = String(value ?? "").trim(); if (!result) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} is required.`); return result; }
function nonnegativeInteger(value, field) { const number = Number(value); if (!Number.isInteger(number) || number < 0) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} is invalid.`); return number; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
