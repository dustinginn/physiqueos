import { coordinatorInputDigest } from "../coordinator/ExternalCombinedCutoverCoordinator.js";
import { FOUNDER_AUTHORIZATION_STEPS } from "../coordinator/combinedCutoverCoordinatorContract.js";
import { loadPhase7BProductionConfiguration } from "./Phase7BProductionConfiguration.js";
import { assertPhase7BIsolatedExerciseIdentity } from "./Phase7BIsolatedExerciseGuard.js";

const ACTIONS = Object.freeze(["inspect", "create-run", "advance", "recover"]);

/** One process invocation performs at most one bounded coordinator operation. */
export function createPhase7BProductionEntrypoint({
  env = process.env,
  expectedEnvironment,
  trustedExercise,
  compositionFactory,
  authorizationProvider,
} = {}) {
  if (typeof compositionFactory !== "function") throw new Error("Phase 7B entrypoint requires a typed production composition factory.");
  if (typeof authorizationProvider?.loadAuthorization !== "function") throw new Error("Phase 7B entrypoint requires the typed coordinator authorization provider.");
  return Object.freeze({ invoke });

  async function invoke(request = {}) {
    const action = String(request.action ?? "");
    if (!ACTIONS.includes(action)) throw entryError("PHASE7B_ENTRYPOINT_ACTION_INVALID", "Requested coordinator action is invalid.");
    const configuration = loadPhase7BProductionConfiguration({ env, expectedEnvironment });
    const identity = request.identity;
    const input = request.input;
    assertPhase7BIsolatedExerciseIdentity({ configuration, identity, input, exercise: request.exercise, trusted: trustedExercise });
    const composition = await compositionFactory({ configuration });
    assertComposition(composition);
    const { coordinator } = composition;
    const store = composition.stores.coordinatorStore;
    const authorityStore = composition.stores.authorityStore;

    if (action === "create-run") {
      await authorityStore.read(); // Source state is inspected before the only permitted mutation.
      let existing = null;
      try { existing = (await store.readRun(identity?.runId)).run; } catch (error) { if (error?.code !== "COORDINATOR_RUN_NOT_FOUND") throw error; }
      if (existing && existing.inputDigest !== coordinatorInputDigest(input)) throw entryError("PHASE7B_ENTRYPOINT_RUN_CONFLICT", "Existing coordinator run has a different input identity.");
      const result = await coordinator.createRun({ identity: { ...identity, authorizationFingerprint: input.authorizationFingerprint, inputDigest: coordinatorInputDigest(input) } });
      return safeReport({ action, result });
    }

    const inspection = await coordinator.inspect({ runId: identity?.runId, input });
    if (action === "inspect") {
      rejectAuthorizationReference(request.authorizationRef);
      return safeReport({ action, inspection });
    }
    const requestedStep = String(request.requestedStep ?? "");

    if (action === "advance") {
      if (!requestedStep || requestedStep !== inspection.durablePhase) throw entryError("PHASE7B_ENTRYPOINT_STEP_MISMATCH", "Requested step is stale or does not match durable coordinator state.");
      const reconciliationOnly = ["IN_PROGRESS_OR_UNRESOLVED", "FAILED_AMBIGUOUS"].includes(inspection.stepStatus);
      const authorization = reconciliationOnly ? null : await loadStepAuthorization({ request, inspection, step: requestedStep });
      const result = await coordinator.advance({ runId: identity.runId, input, authorization });
      return safeReport({ action, inspection, result });
    }

    const recoveryStep = inspection.providerForwardRecoveryRequired ? "PROVIDER_FORWARD_RECOVERY" : "RECOVER_TO_WINDOWS";
    if (requestedStep !== recoveryStep) throw entryError("PHASE7B_ENTRYPOINT_RECOVERY_DIRECTION_MISMATCH", "Requested recovery direction does not match durable M-boundary evidence.");
    const recoveryReconciliation = ["COORDINATOR_RECOVERY_IN_PROGRESS", "COORDINATOR_RECOVERY_AMBIGUOUS"].includes((await store.readRun(identity.runId)).run.failureCode);
    const authorization = recoveryReconciliation ? null : await loadStepAuthorization({ request, inspection, step: recoveryStep });
    const result = await coordinator.recover({ runId: identity.runId, input, authorization });
    return safeReport({ action, inspection, result });
  }

  async function loadStepAuthorization({ request, inspection, step }) {
    if (!FOUNDER_AUTHORIZATION_STEPS.includes(step)) {
      rejectAuthorizationReference(request.authorizationRef);
      return null;
    }
    const ref = String(request.authorizationRef ?? "").trim();
    if (!ref) throw entryError("PHASE7B_ENTRYPOINT_AUTHORIZATION_REQUIRED", `A separate typed Founder authorization reference is required for ${step}.`);
    const decision = await authorizationProvider.loadAuthorization({
      authorizationRef: ref,
      runId: inspection.runId,
      step,
      expectedCoordinatorVersion: inspection.version,
    });
    if (!decision || decision.runId !== inspection.runId || decision.step !== step || Number(decision.expectedCoordinatorVersion) !== inspection.version) {
      throw entryError("PHASE7B_ENTRYPOINT_AUTHORIZATION_MISMATCH", "Loaded Founder authorization does not match this exact run, step, and version.");
    }
    return decision;
  }
}

function rejectAuthorizationReference(value) { if (value != null && String(value).trim()) throw entryError("PHASE7B_ENTRYPOINT_AUTHORIZATION_STALE", "Authorization was supplied for an action that cannot consume it."); }
function assertComposition(value) { if (value?.kind !== "phase7b-production-composition" || !value.coordinator || !value.stores?.coordinatorStore || !value.stores?.authorityStore) throw new Error("Composition factory did not return the typed Phase 7B production composition."); }
function safeReport({ action, inspection = null, result = null }) {
  const run = result?.run ?? result?.result?.run ?? null;
  return Object.freeze({
    schemaVersion: 1,
    action,
    classification: String(result?.classification ?? result?.outcome ?? (inspection ? "INSPECTED" : "UNKNOWN")),
    inspection: inspection == null ? null : inspection,
    result: run == null ? (result ? Object.freeze({ outcome: String(result.outcome ?? result.classification ?? "accepted") }) : null) : Object.freeze({
      runId: run.runId,
      currentStep: run.currentStep,
      stepStatus: run.stepStatus,
      completedSteps: run.completedSteps,
      mBoundaryCrossed: run.mBoundaryCrossed,
      failureCode: run.failureCode,
      version: run.version,
    }),
  });
}
function entryError(code, message) { return Object.assign(new Error(message), { code }); }
