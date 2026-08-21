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
  failQuiesceWith = null,
  runtimeMonitorEnabled = true,
  runtimeMonitorRunning = false,
  cadenceActive = false,
  productionServerRetired = false,
  ngrokRetired = false,
} = {}) {
  let workerState = initialWorkerState;
  let monitorEnabled = runtimeMonitorEnabled;
  let monitorRunning = runtimeMonitorRunning;
  let cadencePresent = cadenceActive;
  let serverRetired = productionServerRetired;
  let tunnelRetired = ngrokRetired;
  const calls = [];
  const definitionHash = "a".repeat(64);

  function snapshot() {
    return Object.freeze({
      schemaVersion: 1,
      runtimeMonitor: Object.freeze({ taskName: "PhysiqueOS Runtime Monitor", enabled: monitorEnabled, taskState: monitorRunning ? "running" : "ready", definitionSha256: definitionHash }),
      runtimeDesiredState: "running",
      ngrokDesiredState: "running",
      cadencePresent,
      productionServer: Object.freeze({ taskName: "PhysiqueOS Production Server", taskState: serverRetired ? "ready" : "running", definitionSha256: "b".repeat(64), listenerPid: serverRetired ? null : 4100, nodeOwnershipProven: !serverRetired, runtimeMetadataMatches: !serverRetired }),
      ngrok: Object.freeze({ taskName: "PhysiqueOS Ngrok Tunnel", taskState: tunnelRetired ? "ready" : "running", definitionSha256: "c".repeat(64), processId: tunnelRetired ? null : 4200, processOwnershipProven: !tunnelRetired }),
    });
  }

  return Object.freeze({
    kind: "deterministic-worker-control",
    async inspectWorkerState({ operationId } = {}) {
      calls.push({ op: "inspect", operationId });
      return Object.freeze({ workerState, operationId: operationId ?? null, snapshot: snapshot(), windows: { monitorEnabled, monitorRunning, cadencePresent, serverRetired, ngrokRetired: tunnelRetired } });
    },
    async quiesceWindowsCadence({ operationId, operationIdentity } = {}) {
      calls.push({ op: "quiesce", operationId, operationIdentity });
      if (failQuiesceWith) throw failQuiesceWith;
      const before = snapshot();
      monitorEnabled = false;
      monitorRunning = false;
      cadencePresent = false;
      return Object.freeze({ ready: true, workerState: WorkerState.WINDOWS_CADENCE_QUIESCED, snapshot: before });
    },
    async activateProviderWorkers({ operationId, providerDeploymentId, operationIdentity } = {}) {
      calls.push({ op: "activate", operationId, providerDeploymentId, operationIdentity });
      if (failActivateWith) throw failActivateWith;
      if (workerState === WorkerState.PROVIDER_ACTIVE) return Object.freeze({ workerState, outcome: "idempotent-replay" });
      workerState = WorkerState.PROVIDER_ACTIVE;
      return Object.freeze({ workerState, outcome: "activated" });
    },
    async verifyProviderWorkers({ operationId, providerDeploymentId } = {}) {
      calls.push({ op: "verify", operationId, providerDeploymentId });
      if (failVerifyWith) throw failVerifyWith;
      if (workerState !== WorkerState.PROVIDER_ACTIVE) {
        throw workerControlError(WorkerErrorCode.VERIFICATION_FAILED, "Provider worker is not active.");
      }
      return Object.freeze({ ready: true, workerState });
    },
    async retireWindowsWorkers({ operationId, operationIdentity } = {}) {
      calls.push({ op: "retire", operationId, operationIdentity });
      if (failRetireWith) throw failRetireWith;
      serverRetired = true;
      tunnelRetired = true;
      return Object.freeze({ retired: true, workerState: WorkerState.WINDOWS_RETIRED });
    },
    async restoreWindowsWorkers({ operationId, snapshot: expectedSnapshot, operationIdentity } = {}) {
      calls.push({ op: "restore", operationId, operationIdentity });
      if (failRestoreWith) throw failRestoreWith;
      if (expectedSnapshot?.runtimeMonitor?.definitionSha256 !== definitionHash) {
        throw workerControlError(WorkerErrorCode.SNAPSHOT_MISMATCH, "Runtime Monitor snapshot identity does not match.");
      }
      monitorEnabled = expectedSnapshot.runtimeMonitor.enabled === true;
      monitorRunning = expectedSnapshot.runtimeMonitor.taskState === "running";
      cadencePresent = false;
      workerState = WorkerState.WINDOWS_ACTIVE;
      return Object.freeze({ workerState: WorkerState.WINDOWS_ACTIVE, outcome: "restored", snapshot: snapshot() });
    },
    inspectCalls: () => calls.map((entry) => ({ ...entry })),
    currentWorkerState: () => workerState,
    currentWindowsState: () => ({ monitorEnabled, monitorRunning, cadencePresent, serverRetired, ngrokRetired: tunnelRetired }),
  });
}
