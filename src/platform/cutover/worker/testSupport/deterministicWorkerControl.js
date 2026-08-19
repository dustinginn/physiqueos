// Deterministic, in-memory worker-control double satisfying the exact `combinedCutoverWorkerControl.js`
// contract. Test-support only; never imported by production code. Unlike `createUnavailableWorkerControl`
// (the real production default), this can actually succeed, fail on command, or report an ambiguous/
// unhealthy outcome, so tests can exercise every real branch of `ProductionWorkerHandoffService.js`
// without any live provider/Windows process control.
import { WorkerState, workerControlError, WorkerErrorCode } from "../combinedCutoverWorkerControl.js";

export function createDeterministicCombinedCutoverWorkerControl({
  initialWorkerState = WorkerState.WINDOWS_ACTIVE,
  failActivateWith = null,
  failVerifyWith = null,
  failRetireWith = null,
  failRestoreWith = null,
} = {}) {
  let workerState = initialWorkerState;
  const calls = [];

  return Object.freeze({
    kind: "deterministic-worker-control",
    async inspectWorkerState({ operationId } = {}) {
      calls.push({ op: "inspect", operationId });
      return Object.freeze({ workerState, operationId: operationId ?? null });
    },
    async activateProviderWorkers({ operationId, providerDeploymentId } = {}) {
      calls.push({ op: "activate", operationId, providerDeploymentId });
      if (failActivateWith) throw failActivateWith;
      if (workerState === WorkerState.PROVIDER_ACTIVE) return Object.freeze({ workerState, outcome: "idempotent-replay" });
      workerState = WorkerState.PROVIDER_ACTIVE;
      return Object.freeze({ workerState, outcome: "activated" });
    },
    async verifyProviderWorkers({ operationId } = {}) {
      calls.push({ op: "verify", operationId });
      if (failVerifyWith) throw failVerifyWith;
      if (workerState !== WorkerState.PROVIDER_ACTIVE) {
        throw workerControlError(WorkerErrorCode.VERIFICATION_FAILED, "Provider worker is not active.");
      }
      return Object.freeze({ ready: true, workerState });
    },
    async retireWindowsWorkers({ operationId } = {}) {
      calls.push({ op: "retire", operationId });
      if (failRetireWith) throw failRetireWith;
      return Object.freeze({ retired: true });
    },
    async restoreWindowsWorkers({ operationId } = {}) {
      calls.push({ op: "restore", operationId });
      if (failRestoreWith) throw failRestoreWith;
      workerState = WorkerState.WINDOWS_ACTIVE;
      return Object.freeze({ workerState, outcome: "restored" });
    },
    inspectCalls: () => calls.map((entry) => ({ ...entry })),
    currentWorkerState: () => workerState,
  });
}
