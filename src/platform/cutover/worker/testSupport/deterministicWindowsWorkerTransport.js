import {
  WorkerErrorCode,
  WorkerMutationClassification,
  workerControlError,
} from "../combinedCutoverWorkerControl.js";

const DEFINITION_SHA256 = "a".repeat(64);

export function createDeterministicWindowsWorkerTransport({
  monitor = {},
  productionServer = {},
  ngrok = {},
  mutationModes = {},
} = {}) {
  const state = {
    monitor: {
      taskName: "PhysiqueOS Runtime Monitor", present: true, enabled: true, taskState: "ready",
      definitionMatches: true, definitionSha256: DEFINITION_SHA256,
      monitorProcessCount: 0, cadenceProcessCount: 0, cadencePresent: false,
      runtimeDesiredState: "running", ngrokDesiredState: "running", ...monitor,
    },
    server: {
      taskName: "PhysiqueOS Production Server", present: true, taskState: "running",
      definitionMatches: true, definitionSha256: "b".repeat(64), listenerCount: 1, listenerPid: 4100,
      nodeOwnershipProven: true, runtimeMetadataMatches: true, retired: false, ...productionServer,
    },
    ngrok: {
      taskName: "PhysiqueOS Ngrok Tunnel", present: true, taskState: "running",
      definitionMatches: true, definitionSha256: "c".repeat(64), canonicalProcessCount: 1, foreignProcessCount: 0,
      processId: 4200, processOwnershipProven: true, retired: false, desiredState: "running", ...ngrok,
    },
  };
  const calls = [];
  const unreadable = new Set();

  async function inspect(kind, operation) {
    calls.push({ op: operation });
    if (unreadable.has(kind)) throw new Error(`${kind} unreadable`);
    return Object.freeze({ evidence: structuredClone(state[kind]) });
  }

  async function mutate(kind, operation, apply, payload) {
    calls.push({ op: operation, payload: safePayload(payload) });
    const mode = mutationModes[operation] ?? "accepted";
    if (mode === "rejected") throw mutationError(WorkerMutationClassification.REJECTED);
    if (mode === "ambiguous-applied") { apply(); throw mutationError(WorkerMutationClassification.AMBIGUOUS); }
    if (mode === "ambiguous-not-applied") throw mutationError(WorkerMutationClassification.AMBIGUOUS);
    if (mode === "ambiguous-unreadable") { unreadable.add(kind); throw mutationError(WorkerMutationClassification.AMBIGUOUS); }
    apply(mode);
    return Object.freeze({ classification: WorkerMutationClassification.ACCEPTED, evidence: structuredClone(state[kind]) });
  }

  return Object.freeze({
    kind: "deterministic-windows-worker-transport",
    inspectRuntimeMonitor: () => inspect("monitor", "inspect-runtime-monitor"),
    quiesceRuntimeMonitor: (payload) => mutate("monitor", "quiesce-runtime-monitor", (mode) => {
      state.monitor.enabled = false;
      state.monitor.taskState = "disabled";
      state.monitor.monitorProcessCount = 0;
      if (mode !== "accepted-cadence-remains") {
        state.monitor.cadenceProcessCount = 0;
        state.monitor.cadencePresent = false;
      }
    }, payload),
    restoreRuntimeMonitor: (payload) => mutate("monitor", "restore-runtime-monitor", () => {
      state.monitor.enabled = payload.snapshot.runtimeMonitor.enabled;
      state.monitor.taskState = payload.snapshot.runtimeMonitor.taskState;
      state.monitor.monitorProcessCount = 0;
      state.monitor.cadenceProcessCount = 0;
      state.monitor.cadencePresent = false;
    }, payload),
    inspectProductionServer: () => inspect("server", "inspect-production-server"),
    retireProductionServer: (payload) => mutate("server", "retire-production-server", () => {
      state.server.taskState = "ready";
      state.server.listenerCount = 0;
      state.server.listenerPid = null;
      state.server.nodeOwnershipProven = false;
      state.server.runtimeMetadataMatches = false;
      state.server.retired = true;
    }, payload),
    inspectNgrok: () => inspect("ngrok", "inspect-ngrok"),
    retireNgrok: (payload) => mutate("ngrok", "retire-ngrok", () => {
      state.ngrok.taskState = "ready";
      state.ngrok.canonicalProcessCount = 0;
      state.ngrok.processId = null;
      state.ngrok.processOwnershipProven = false;
      state.ngrok.retired = true;
      state.ngrok.desiredState = "stopped";
    }, payload),
    calls: () => calls.map((entry) => structuredClone(entry)),
    mutationCount: (operation) => calls.filter((entry) => entry.op === operation).length,
    current: () => structuredClone(state),
  });
}

export function runtimeMonitorSnapshot(overrides = {}) {
  const { runtimeMonitor = {}, ...rest } = overrides;
  return Object.freeze({
    schemaVersion: 1,
    runtimeMonitor: Object.freeze({ taskName: "PhysiqueOS Runtime Monitor", enabled: true, taskState: "ready", definitionSha256: DEFINITION_SHA256, ...runtimeMonitor }),
    runtimeDesiredState: "running",
    ngrokDesiredState: "running",
    cadencePresent: false,
    productionServer: Object.freeze({ taskName: "PhysiqueOS Production Server", taskState: "running", definitionSha256: "b".repeat(64), listenerPid: 4100, nodeOwnershipProven: true, runtimeMetadataMatches: true }),
    ngrok: Object.freeze({ taskName: "PhysiqueOS Ngrok Tunnel", taskState: "running", definitionSha256: "c".repeat(64), processId: 4200, processOwnershipProven: true }),
    ...rest,
  });
}

function mutationError(classification) {
  return workerControlError(classification === WorkerMutationClassification.AMBIGUOUS ? WorkerErrorCode.AMBIGUOUS : WorkerErrorCode.RETIRE_FAILED,
    "Deterministic Windows mutation result.", { classification });
}

function safePayload(payload) {
  return payload?.operationIdentity ? { operationIdentity: { ...payload.operationIdentity } } : {};
}
