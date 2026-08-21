import { RuntimeAuthority, RuntimeAuthorityAction } from "../CombinedRuntimeAuthorityState.js";
import {
  CoordinatorInspectionClassification,
  freeze,
} from "../coordinator/combinedCutoverCoordinatorContract.js";
import { MigrationFenceState } from "../migrationControlState.js";
import { TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import { assessCombinedCutoverPreflightReadiness } from "./combinedCutoverPreflightReadiness.js";

const A_INFRASTRUCTURE_CATEGORIES = Object.freeze([
  "routingZone", "routingLeaf", "windowsTarget", "providerTarget", "customDomains",
  "tlsSni", "deploymentBuild", "routingReadback", "workerControl",
]);

/**
 * Adapts the existing production cutover services to the external coordinator's inspect/execute
 * contract. Durable authority and receipt stores remain the source of truth; no in-process success
 * flag is used for replay decisions.
 */
export function createProductionCombinedCutoverCoordinatorServices({
  authorityStore,
  controlStore,
  preflightAdapters,
  infrastructurePreflightInspector,
  windowsFenceAdapter,
  windowsCadenceService,
  finalSnapshotService,
  finalPackageExportService,
  transferSnapshot,
  manifestReceiptStore,
  canonicalImportService,
  providerParityService,
  preparationAcknowledgementService,
  preparationStore,
  providerPreBoundaryInspector,
  authorityHandoffService,
  postHandoffVerificationService,
  handoffReceiptStore,
  workerHandoffService,
  firstProviderCommandService,
  stabilizationService,
  windowsRecoveryService,
  providerRecoveryService,
} = {}) {
  assertDependencies(arguments[0]);

  const services = {
    preflightService: phaseA(),
    windowsFenceService: phaseBWriteFence(),
    windowsCadenceService,
    finalPackageService: phaseCD(),
    transferService: phaseE(),
    importService: phaseFG(),
    providerValidationService: phaseHIJ(),
    preparationService: phaseK(),
    authorityHandoffService: phaseL(),
    firstProviderCommandService,
    workerHandoffService: phaseNO(),
    stabilizationService,
    windowsRecoveryService: recoveryToWindows(),
    providerRecoveryService: recoveryToProvider(),
    statusService: status(),
  };
  return freeze(services);

  function phaseA() {
    return freeze({ inspect, execute: inspect });
    async function inspect({ run, input } = {}) {
      const preflight = await assessCombinedCutoverPreflightReadiness({ preflightAdapters, input });
      let infrastructure;
      try {
        infrastructure = await infrastructurePreflightInspector.inspect({ run, input });
      } catch {
        infrastructure = null;
      }
      const infrastructureCategories = infrastructure?.categories ?? {};
      const categories = freeze({
        authorization: preflight.results.verifyAuthorization?.ready === true,
        windowsSource: preflight.results.verifyWindowsSource?.ready === true,
        providerBuild: preflight.results.verifyProviderBuild?.ready === true,
        targetIsolation: preflight.results.verifyTargetIsolation?.ready === true,
        backups: preflight.results.verifyBackups?.ready === true && infrastructureCategories.backups === true,
        costCeiling: preflight.results.verifyCostCeiling?.ready === true,
        ...Object.fromEntries(A_INFRASTRUCTURE_CATEGORIES.map((name) => [name, infrastructureCategories[name] === true])),
      });
      const complete = Object.values(categories).every(Boolean);
      return freeze({
        phase: "A",
        classification: complete ? CoordinatorInspectionClassification.COMPLETED : CoordinatorInspectionClassification.BLOCKED,
        categories,
        evidence: { runId: run.runId, operationId: run.migrationOperationId, status: complete ? "preflight-complete" : "preflight-blocked" },
        blockingPreconditions: [
          ...preflight.blocked.map((entry) => `${entry.preflight}:${entry.code ?? "blocked"}`),
          ...(infrastructureCategories.backups === true ? [] : ["backups:restore-proof-blocked"]),
          ...A_INFRASTRUCTURE_CATEGORIES.filter((name) => infrastructureCategories[name] !== true).map((name) => `${name}:blocked`),
        ],
      });
    }
  }

  function phaseBWriteFence() {
    return freeze({ inspect, activate });
    async function inspect({ input } = {}) {
      const operationId = required(input?.migrationOperationId, "migrationOperationId");
      let state;
      try { state = (await controlStore.read()).state; } catch { return ambiguous(operationId, "windows-fence-inspection-unavailable"); }
      if (state.fenceState === MigrationFenceState.ACTIVE && state.migrationOperationId === operationId && state.writesEnabled === false && state.firstPostgresWriteAt == null) {
        return completed(operationId, "windows-write-fence-active", { fenceId: state.fenceId, ready: true, controlState: state });
      }
      if (state.migrationOperationId && state.migrationOperationId !== operationId) return blocked(operationId, "windows-fence-operation-mismatch");
      return notApplied(operationId, "windows-write-fence-not-active");
    }
    async function activate({ input } = {}) {
      return windowsFenceAdapter.activateWindowsWriteFence({ input });
    }
  }

  function phaseCD() {
    return freeze({ inspect, execute });
    async function inspect({ run, input } = {}) {
      const state = (await authorityStore.read()).state;
      if (state.authority === RuntimeAuthority.WINDOWS_LEGACY && state.migrationOperationId == null) {
        return notApplied(run.migrationOperationId, "final-package-not-authority-bound");
      }
      if (!sameAuthorityOperation(state, run, input) || !state.finalSnapshot?.packageDigest) {
        return blocked(run.migrationOperationId, "final-package-authority-mismatch");
      }
      try {
        const exported = await finalPackageExportService.exportFinalPackage({ input, state, snapshot: state.finalSnapshot });
        return exported.packageDigest === state.finalSnapshot.packageDigest
          ? completed(run.migrationOperationId, "final-package-verified", { packageDigest: exported.packageDigest })
          : blocked(run.migrationOperationId, "final-package-digest-mismatch");
      } catch {
        return ambiguous(run.migrationOperationId, "final-package-inspection-unavailable");
      }
    }
    async function execute({ run, input } = {}) {
      let state = (await authorityStore.read()).state;
      let snapshot = state.finalSnapshot;
      if (state.authority === RuntimeAuthority.WINDOWS_LEGACY) {
        const controlState = (await controlStore.read()).state;
        const fence = { ready: true, fenceId: controlState.fenceId, controlState };
        snapshot = await finalSnapshotService.inspectFinalSnapshot({ input, fence });
        if (!snapshot) snapshot = await finalSnapshotService.captureFinalSnapshot({ input, fence });
        assertAuthorizedSnapshot(snapshot, input);
        state = (await authorityStore.transition(authorityCommand(state, input, RuntimeAuthorityAction.BEGIN_CUTOVER, {
          fenceId: controlState.fenceId,
          finalSnapshot: snapshot,
          providerSource: requiredObject(input?.providerSource, "providerSource"),
          target: requiredObject(input?.target, "target"),
          routingTarget: required(input?.routingTarget, "routingTarget"),
          reason: "External coordinator bound the final Windows package captured under the durable write fence.",
        }))).state;
      }
      return finalPackageExportService.exportFinalPackage({ input, state, snapshot: state.finalSnapshot ?? snapshot });
    }
  }

  function phaseE() {
    return freeze({ inspect, execute });
    async function inspect({ run } = {}) {
      const state = (await authorityStore.read()).state;
      const receipt = await readReceiptOrNull(manifestReceiptStore, run.migrationOperationId);
      if (!receipt) return notApplied(run.migrationOperationId, "transfer-receipt-absent");
      if (!receiptMatches(receipt, state, run)) return blocked(run.migrationOperationId, "transfer-receipt-identity-mismatch");
      if (receipt.status === "verified") return completed(run.migrationOperationId, "transfer-verified", { transferReceiptId: receipt.receiptId ?? `transfer:${run.migrationOperationId}`, packageDigest: receipt.packageDigest });
      if (receipt.status === "failed") return notApplied(run.migrationOperationId, "transfer-failed-conclusive");
      return ambiguous(run.migrationOperationId, "transfer-incomplete-or-unresolved");
    }
    async function execute({ input } = {}) {
      const state = (await authorityStore.read()).state;
      const exported = await finalPackageExportService.exportFinalPackage({ input, state, snapshot: state.finalSnapshot });
      return transferSnapshot({ input, state, snapshot: state.finalSnapshot, exported });
    }
  }

  function phaseFG() {
    return freeze({ inspect, execute });
    async function inspect({ run } = {}) {
      const state = (await authorityStore.read()).state;
      const receipt = await readReceiptOrNull(preparationStore, run.migrationOperationId);
      if (!receipt) return notApplied(run.migrationOperationId, "preparation-receipt-absent");
      if (!receiptMatches(receipt, state, run)) return blocked(run.migrationOperationId, "preparation-receipt-identity-mismatch");
      if (receipt.importStatus === "succeeded" && receipt.mediaStatus === "succeeded") return completed(run.migrationOperationId, "import-and-media-succeeded", { receiptId: receipt.receiptId, packageDigest: receipt.packageDigest });
      if ([receipt.importStatus, receipt.mediaStatus].includes("failed")) return notApplied(run.migrationOperationId, "import-or-media-failed-conclusive");
      return ambiguous(run.migrationOperationId, "import-or-media-incomplete");
    }
    async function execute({ run, input } = {}) {
      const state = requireCutoverState(await authorityStore.read(), run, input);
      return canonicalImportService.import(receiptTuple(state));
    }
  }

  function phaseHIJ() {
    return freeze({ inspect, execute });
    async function inspect({ run, input } = {}) {
      const state = (await authorityStore.read()).state;
      const receipt = await readReceiptOrNull(preparationStore, run.migrationOperationId);
      if (!receipt) return blocked(run.migrationOperationId, "provider-validation-preparation-absent");
      if (!receiptMatches(receipt, state, run)) return blocked(run.migrationOperationId, "provider-validation-identity-mismatch");
      if (receipt.parityStatus !== "passed") return receipt.parityStatus === "failed"
        ? notApplied(run.migrationOperationId, "provider-parity-failed-conclusive")
        : blocked(run.migrationOperationId, "provider-parity-not-ready");
      let boundary;
      try { boundary = await providerPreBoundaryInspector.inspect({ run, input }); } catch { return ambiguous(run.migrationOperationId, "provider-preboundary-inspection-unavailable"); }
      if (boundary?.ready !== true || boundary.workerStatus !== "paused_authority" || boundary.outboxReady !== true ||
          boundary.providerDeploymentId !== input.providerDeploymentId || boundary.providerBuildId !== input.providerBuildId) {
        return blocked(run.migrationOperationId, "provider-preboundary-contract-failed");
      }
      return completed(run.migrationOperationId, "provider-validation-complete", { receiptId: receipt.receiptId, providerDeploymentId: input.providerDeploymentId, buildId: input.providerBuildId });
    }
    async function execute({ run, input } = {}) {
      const state = requireCutoverState(await authorityStore.read(), run, input);
      await providerParityService.verifyParity(receiptTuple(state));
      return providerPreBoundaryInspector.inspect({ run, input });
    }
  }

  function phaseK() {
    return freeze({ inspect, execute });
    async function inspect({ run, input } = {}) {
      const state = (await authorityStore.read()).state;
      const receipt = await readReceiptOrNull(preparationStore, run.migrationOperationId);
      if (state.authority === RuntimeAuthority.PROVIDER_PREPARED && sameAuthorityOperation(state, run, input) &&
          receipt?.preparedStatus === "acknowledged" && receipt.providerDeploymentId === input.providerDeploymentId && receiptMatches(receipt, state, run)) {
        return completed(run.migrationOperationId, "provider-prepared-acknowledged", { receiptId: receipt.receiptId, providerDeploymentId: input.providerDeploymentId });
      }
      if (state.authority !== RuntimeAuthority.CUTOVER_IN_PROGRESS) return blocked(run.migrationOperationId, "provider-preparation-authority-mismatch");
      return notApplied(run.migrationOperationId, "provider-preparation-not-acknowledged");
    }
    async function execute({ run, input } = {}) {
      const state = requireCutoverState(await authorityStore.read(), run, input);
      const acknowledgement = await preparationAcknowledgementService.acknowledge(receiptTuple(state));
      return authorityStore.transition(authorityCommand(state, input, RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, {
        providerAcknowledgement: acknowledgement,
        reason: "External coordinator recorded the exact provider preparation acknowledgement.",
      }));
    }
  }

  function phaseL() {
    return freeze({ inspect, execute });
    async function inspect({ run, input } = {}) {
      const state = (await authorityStore.read()).state;
      const receipt = await readReceiptOrNull(handoffReceiptStore, run.migrationOperationId);
      if (state.authority === RuntimeAuthority.PROVIDER && sameAuthorityOperation(state, run, input) &&
          receipt?.authorityStatus === "committed" && receipt.routingStatus === "verified" && receiptMatches(receipt, state, run)) {
        const verified = await postHandoffVerificationService.verifyPostHandoff({ input });
        if (verified?.ready === true) return freeze({ classification: CoordinatorInspectionClassification.COMPLETED, evidence: { runId: run.runId, operationId: run.migrationOperationId, receiptId: receipt.receiptId, routingRole: "provider", workerRole: "provider-inert", authority: state.authority, status: "authority-and-routing-verified" } });
      }
      if (receipt && ["activated", "verified"].includes(receipt.routingStatus)) return ambiguous(run.migrationOperationId, "routing-handoff-unresolved");
      if (state.authority !== RuntimeAuthority.PROVIDER_PREPARED) return blocked(run.migrationOperationId, "handoff-authority-not-prepared");
      return notApplied(run.migrationOperationId, "authority-routing-handoff-not-applied");
    }
    async function execute({ run, input } = {}) {
      let state = (await authorityStore.read()).state;
      const acknowledgement = state.providerAcknowledgement;
      return authorityHandoffService.transferAuthorityAndRoute({
        input, state, acknowledgement,
        async commitAuthority() {
          state = (await authorityStore.transition(authorityCommand(state, input, RuntimeAuthorityAction.TRANSFER_TO_PROVIDER, {
            routingTarget: input.routingTarget,
            reason: "External coordinator transferred provider runtime and public routing authority.",
          }))).state;
          return state;
        },
      });
    }
  }

  function phaseNO() {
    return freeze({ inspect, execute });
    async function inspect({ run, input } = {}) {
      const receipt = await readReceiptOrNull(handoffReceiptStore, run.migrationOperationId);
      if (!receipt) return blocked(run.migrationOperationId, "worker-handoff-receipt-absent");
      if (receipt.providerDeploymentId !== input.providerDeploymentId) return blocked(run.migrationOperationId, "worker-deployment-mismatch");
      if (receipt.workerActivationStatus === "verified" && receipt.windowsWorkerRetirementStatus === "retired") {
        return completed(run.migrationOperationId, "provider-worker-verified-windows-retired", { receiptId: receipt.receiptId, providerDeploymentId: input.providerDeploymentId });
      }
      if ([receipt.workerActivationStatus, receipt.windowsWorkerRetirementStatus].includes("failed")) return notApplied(run.migrationOperationId, "worker-handoff-failed-conclusive");
      return ambiguous(run.migrationOperationId, "worker-handoff-incomplete");
    }
    async function execute({ input } = {}) {
      return workerHandoffService.activateProviderWorkersAndRetireWindows({ input });
    }
  }

  function recoveryToWindows() {
    return freeze({ inspect, restorePreBoundaryWindows: (context) => windowsRecoveryService.restorePreBoundaryWindows(context) });
    async function inspect({ run } = {}) {
      const authority = (await authorityStore.read()).state;
      const control = (await controlStore.read()).state;
      if (authority.authority === RuntimeAuthority.WINDOWS_LEGACY && authority.firstProviderCanonicalWriteAt == null &&
          control.writesEnabled === true && ![MigrationFenceState.ACTIVE, MigrationFenceState.CUTOVER_IN_PROGRESS].includes(control.fenceState)) {
        return completed(run.migrationOperationId, "windows-recovery-complete");
      }
      if (authority.firstProviderCanonicalWriteAt != null) return blocked(run.migrationOperationId, "windows-recovery-illegal-after-M");
      return notApplied(run.migrationOperationId, "windows-recovery-not-applied");
    }
  }

  function recoveryToProvider() {
    return freeze({ inspect, enterProviderRecovery: (context) => providerRecoveryService.enterProviderRecovery(context) });
    async function inspect({ run } = {}) {
      const authority = (await authorityStore.read()).state;
      if (authority.migrationOperationId !== run.migrationOperationId) return blocked(run.migrationOperationId, "provider-recovery-operation-mismatch");
      if (authority.authority === RuntimeAuthority.RECOVERY_REQUIRED) return completed(run.migrationOperationId, "provider-forward-recovery-entered");
      if (authority.firstProviderCanonicalWriteAt != null) return notApplied(run.migrationOperationId, "provider-forward-recovery-not-entered");
      return blocked(run.migrationOperationId, "provider-forward-recovery-not-legal");
    }
  }

  function status() {
    return freeze({ async inspect({ run } = {}) {
      const authority = (await authorityStore.read()).state;
      const handoff = await readReceiptOrNull(handoffReceiptStore, run.migrationOperationId);
      const routingRole = handoff?.routingStatus === "verified" ? "provider" : authority.publicRuntimeAuthority === "windows" ? "windows" : "unknown";
      const workerRole = handoff?.windowsWorkerRetirementStatus === "retired" && handoff?.workerActivationStatus === "verified"
        ? "provider" : handoff?.routingStatus === "verified" ? "provider-inert" : "windows";
      return freeze({
        blockingPreconditions: [], routingRole, workerRole,
        rollbackToWindowsLegal: authority.firstProviderCanonicalWriteAt == null,
        providerForwardRecoveryRequired: authority.firstProviderCanonicalWriteAt != null || authority.authority === RuntimeAuthority.RECOVERY_REQUIRED,
      });
    } });
  }
}

function authorityCommand(state, input, action, extra) {
  return { action, expectedVersion: state.version, migrationOperationId: input.migrationOperationId,
    authorizationFingerprint: input.authorizationFingerprint, commandId: `${input.commandPrefix}:${action}`, ...extra };
}
function receiptTuple(state) { return { migrationOperationId: state.migrationOperationId, authorizationFingerprint: state.authorizationFingerprint, fenceId: state.fenceId, expectedPackageDigest: state.finalSnapshot.packageDigest }; }
function requireCutoverState(result, run, input) { const state = result.state; if (!sameAuthorityOperation(state, run, input) || !state.finalSnapshot) throw Object.assign(new Error("Durable authority does not match the coordinator operation."), { code: "COORDINATOR_IDENTITY_MISMATCH" }); return state; }
function sameAuthorityOperation(state, run, input) { return state?.migrationOperationId === run?.migrationOperationId && run?.migrationOperationId === input?.migrationOperationId && state?.authorizationFingerprint === input?.authorizationFingerprint; }
function receiptMatches(receipt, state, run) { return (receipt?.operationId ?? receipt?.migrationOperationId) === run?.migrationOperationId && (!receipt.authorizationFingerprint || receipt.authorizationFingerprint === state?.authorizationFingerprint) && (!receipt.fenceId || receipt.fenceId === state?.fenceId) && (!receipt.packageDigest || receipt.packageDigest === state?.finalSnapshot?.packageDigest); }
async function readReceiptOrNull(store, operationId) { try { return (await store.read(operationId)).receipt; } catch (error) { if ([TransferErrorCode.RECEIPT_UNAVAILABLE, "TRANSFER_RECEIPT_UNAVAILABLE"].includes(error?.code)) return null; throw error; } }
function assertAuthorizedSnapshot(snapshot, input) { if (String(snapshot?.runtimeSha256 ?? "").toLowerCase() !== String(input?.expectedRuntimeSha256 ?? "").toLowerCase() || Number(snapshot?.runtimeRevision) !== Number(input?.expectedRuntimeRevision)) throw Object.assign(new Error("Final snapshot does not match the authorized runtime identity."), { code: "FINAL_SNAPSHOT_AUTHORIZATION_MISMATCH" }); }
function completed(operationId, status, extra = {}) { return freeze({ classification: CoordinatorInspectionClassification.COMPLETED, evidence: { operationId, status, ...extra } }); }
function notApplied(operationId, status) { return freeze({ classification: CoordinatorInspectionClassification.NOT_APPLIED, evidence: { operationId, status } }); }
function blocked(operationId, status) { return freeze({ classification: CoordinatorInspectionClassification.BLOCKED, evidence: { operationId, status } }); }
function ambiguous(operationId, status) { return freeze({ classification: CoordinatorInspectionClassification.AMBIGUOUS, evidence: { operationId, status } }); }
function required(value, field) { const text = String(value ?? "").trim(); if (!text) throw new Error(`${field} is required.`); return text; }
function requiredObject(value, field) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} is required.`); return value; }
function assertDependencies(value) {
  for (const method of ["read", "transition"]) if (typeof value?.authorityStore?.[method] !== "function") throw new Error(`Production coordinator services require authorityStore.${method}.`);
  for (const method of ["read"]) if (typeof value?.controlStore?.[method] !== "function") throw new Error(`Production coordinator services require controlStore.${method}.`);
  for (const name of ["infrastructurePreflightInspector", "providerPreBoundaryInspector"]) if (typeof value?.[name]?.inspect !== "function") throw new Error(`Production coordinator services require ${name}.inspect.`);
  for (const name of ["windowsCadenceService", "stabilizationService"]) if (typeof value?.[name]?.inspect !== "function") throw new Error(`Production coordinator services require ${name}.inspect.`);
  if (typeof value?.windowsFenceAdapter?.activateWindowsWriteFence !== "function") throw new Error("Production coordinator services require the Windows write-fence adapter.");
  if (typeof value?.finalSnapshotService?.inspectFinalSnapshot !== "function" || typeof value?.finalSnapshotService?.captureFinalSnapshot !== "function") throw new Error("Production coordinator services require inspectable final snapshots.");
  if (typeof value?.finalPackageExportService?.exportFinalPackage !== "function" || typeof value?.transferSnapshot !== "function") throw new Error("Production coordinator services require typed package export and transfer.");
  for (const name of ["manifestReceiptStore", "preparationStore", "handoffReceiptStore"]) if (typeof value?.[name]?.read !== "function") throw new Error(`Production coordinator services require ${name}.read.`);
  for (const [name, method] of Object.entries({ canonicalImportService: "import", providerParityService: "verifyParity", preparationAcknowledgementService: "acknowledge", authorityHandoffService: "transferAuthorityAndRoute", postHandoffVerificationService: "verifyPostHandoff", workerHandoffService: "activateProviderWorkersAndRetireWindows", firstProviderCommandService: "executeFirstProviderCommand", windowsRecoveryService: "restorePreBoundaryWindows", providerRecoveryService: "enterProviderRecovery" })) if (typeof value?.[name]?.[method] !== "function") throw new Error(`Production coordinator services require ${name}.${method}.`);
}
