import {
  WorkerErrorCode,
  WorkerMutationClassification,
  WorkerReadbackClassification,
  WorkerState,
  workerControlError,
} from "./combinedCutoverWorkerControl.js";
import { createWorkerMutationReconciler } from "./WorkerMutationReconciler.js";
import { redactProviderEvidence } from "../../provider/digitalocean/DigitalOceanProviderContract.js";

export const WINDOWS_PRODUCTION_TASK = "PhysiqueOS Production Server";
export const WINDOWS_MONITOR_TASK = "PhysiqueOS Runtime Monitor";
export const WINDOWS_NGROK_TASK = "PhysiqueOS Ngrok Tunnel";

/**
 * Production worker control for the prestarted authority-gated provider worker and the three exact
 * accepted Windows surfaces. It owns mechanism and exact identity only; B/N/O/rollback legality is
 * enforced by the services above it.
 */
export function createProductionCombinedCutoverWorkerControl({
  client,
  appId,
  heartbeatStore,
  windowsTransport,
  expectedProviderBuildId,
  expectedProviderWorkerId,
  maximumHeartbeatAgeMs = 120_000,
  now = () => new Date(),
  mutationReconciler = createWorkerMutationReconciler(),
} = {}) {
  assertDependencies({ client, heartbeatStore, windowsTransport, mutationReconciler });
  const config = freeze({
    appId: required(appId, "appId"),
    expectedProviderBuildId: required(expectedProviderBuildId, "expectedProviderBuildId"),
    expectedProviderWorkerId: required(expectedProviderWorkerId, "expectedProviderWorkerId"),
    maximumHeartbeatAgeMs: boundedInteger(maximumHeartbeatAgeMs, "maximumHeartbeatAgeMs", 1_000, 600_000),
  });

  async function inspectProvider(providerDeploymentId) {
    const deploymentId = required(providerDeploymentId, "providerDeploymentId");
    let deployment;
    let heartbeat;
    try {
      deployment = await client.getDeployment({ appId: config.appId, deploymentId });
      heartbeat = await heartbeatStore.latestHeartbeat();
    } catch (error) {
      throw workerControlError(WorkerErrorCode.UNAVAILABLE, "Provider worker identity inspection failed.", safeEvidence({
        expectedDeploymentId: deploymentId,
        providerClassification: error?.classification,
        providerEvidence: error?.evidence,
      }));
    }
    const value = deployment.value;
    if (String(value?.id ?? "") !== deploymentId || String(value?.phase ?? "") !== "ACTIVE") {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Provider worker deployment is not the exact ACTIVE deployment.", safeEvidence({
        expectedDeploymentId: deploymentId,
        observedDeploymentId: value?.id,
        observedDeploymentPhase: value?.phase,
      }));
    }
    const workerId = String(heartbeat?.worker_id ?? heartbeat?.workerId ?? "");
    const buildId = String(heartbeat?.build_id ?? heartbeat?.buildId ?? "");
    const status = String(heartbeat?.status ?? "");
    const observedAt = normalizeTimestamp(heartbeat?.observed_at ?? heartbeat?.observedAt);
    const ageMs = observedAt == null ? null : Math.max(0, now().getTime() - new Date(observedAt).getTime());
    if (workerId !== config.expectedProviderWorkerId || buildId !== config.expectedProviderBuildId || observedAt == null || ageMs > config.maximumHeartbeatAgeMs) {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Provider worker heartbeat identity is missing, stale, or mismatched.", safeEvidence({
        expectedDeploymentId: deploymentId,
        observedWorkerId: workerId || null,
        observedBuildId: buildId || null,
        observedAt,
        heartbeatAgeMs: ageMs,
      }));
    }
    if (!['healthy', 'paused_authority'].includes(status)) {
      throw workerControlError(WorkerErrorCode.VERIFICATION_FAILED, "Provider worker heartbeat has an unsupported status.", safeEvidence({ status }));
    }
    return freeze({
      workerState: status === "healthy" ? WorkerState.PROVIDER_ACTIVE : WorkerState.PROVIDER_INERT,
      deploymentId,
      deploymentPhase: "ACTIVE",
      workerId,
      buildId,
      heartbeatStatus: status,
      observedAt,
      heartbeatAgeMs: ageMs,
      evidence: safeEvidence({ deploymentId, deploymentPhase: "ACTIVE", workerId, buildId, heartbeatStatus: status, observedAt, heartbeatAgeMs: ageMs }),
    });
  }

  async function inspectMonitor() {
    const result = await windowsTransport.inspectRuntimeMonitor();
    const state = result?.evidence;
    if (!state || state.taskName !== WINDOWS_MONITOR_TASK || state.present !== true || state.definitionMatches !== true ||
        !isSha256(state.definitionSha256) || Number(state.monitorProcessCount) > 1 || Number(state.cadenceProcessCount) > 1) {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Runtime Monitor exact identity could not be proven.", safeWindowsEvidence(state));
    }
    return freeze(state);
  }

  async function inspectProductionServer() {
    const state = (await windowsTransport.inspectProductionServer())?.evidence;
    if (!state || state.taskName !== WINDOWS_PRODUCTION_TASK || state.present !== true || state.definitionMatches !== true || !isSha256(state.definitionSha256)) {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Production Server task identity could not be proven.", safeWindowsEvidence(state));
    }
    if (state.retired !== true && (Number(state.listenerCount) !== 1 || state.nodeOwnershipProven !== true || state.runtimeMetadataMatches !== true)) {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Production Server listener, Node ownership, or runtime metadata did not match.", safeWindowsEvidence(state));
    }
    return freeze(state);
  }

  async function inspectNgrok() {
    const state = (await windowsTransport.inspectNgrok())?.evidence;
    if (!state || state.taskName !== WINDOWS_NGROK_TASK || state.present !== true || state.definitionMatches !== true || !isSha256(state.definitionSha256) || Number(state.foreignProcessCount) !== 0 || Number(state.canonicalProcessCount) > 1) {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Ngrok exact task/process identity could not be proven.", safeWindowsEvidence(state));
    }
    if (state.retired !== true && (Number(state.canonicalProcessCount) !== 1 || state.processOwnershipProven !== true)) {
      throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Ngrok process ownership could not be proven.", safeWindowsEvidence(state));
    }
    return freeze(state);
  }

  async function inspectWorkerState({ operationId, providerDeploymentId } = {}) {
    required(operationId, "operationId");
    const [provider, monitor, server, ngrok] = await Promise.all([
      inspectProvider(providerDeploymentId), inspectMonitor(), inspectProductionServer(), inspectNgrok(),
    ]);
    return freeze({
      workerState: provider.workerState,
      provider,
      windows: freeze({ runtimeMonitor: monitor, productionServer: server, ngrok }),
    });
  }

  async function inspectWindowsCadence({ operationId } = {}) {
    required(operationId, "operationId");
    const [monitor, productionServer, ngrok] = await Promise.all([
      inspectMonitor(), inspectProductionServer(), inspectNgrok(),
    ]);
    const quiesced = monitor.enabled === false && monitor.taskState !== "running" &&
      Number(monitor.monitorProcessCount) === 0 && monitor.cadencePresent === false;
    return freeze({
      ready: quiesced,
      workerState: quiesced ? WorkerState.WINDOWS_CADENCE_QUIESCED : WorkerState.WINDOWS_ACTIVE,
      runtimeMonitor: monitor,
      productionServer,
      ngrok,
    });
  }

  async function activateProviderWorkers({ operationId, providerDeploymentId, operationIdentity } = {}) {
    requireIdentity(operationIdentity, operationId, "activate-provider-workers");
    const provider = await inspectProvider(providerDeploymentId);
    // The component is deliberately already running. AuthorityGatedWorker, not scale, is the gate.
    return freeze({
      workerState: provider.workerState,
      outcome: "prestarted-authority-gated",
      mutated: false,
      provider,
    });
  }

  async function verifyProviderWorkers({ operationId, providerDeploymentId } = {}) {
    required(operationId, "operationId");
    const provider = await inspectProvider(providerDeploymentId);
    if (provider.workerState !== WorkerState.PROVIDER_ACTIVE || provider.heartbeatStatus !== "healthy") {
      throw workerControlError(WorkerErrorCode.VERIFICATION_FAILED, "Provider worker is still authority-paused or unhealthy.", provider.evidence);
    }
    return freeze({ ready: true, workerState: WorkerState.PROVIDER_ACTIVE, provider });
  }

  async function quiesceWindowsCadence({ operationId, operationIdentity, snapshot: suppliedSnapshot = null } = {}) {
    const identity = requireIdentity(operationIdentity, operationId, "quiesce-runtime-monitor");
    const [before, productionServer, ngrok] = await Promise.all([inspectMonitor(), inspectProductionServer(), inspectNgrok()]);
    const alreadyQuiesced = before.enabled === false && before.taskState !== "running" && before.monitorProcessCount === 0 && before.cadencePresent === false;
    if (alreadyQuiesced) {
      const snapshot = validateSnapshot(suppliedSnapshot, before.definitionSha256);
      return freeze({ ready: true, outcome: "idempotent-replay", workerState: WorkerState.WINDOWS_CADENCE_QUIESCED, snapshot });
    }
    const snapshot = suppliedSnapshot == null ? createSnapshot(before, productionServer, ngrok) : validateSnapshot(suppliedSnapshot, before.definitionSha256);
    const reconciliation = await mutationReconciler.execute({
      resourceKey: `windows-task:${WINDOWS_MONITOR_TASK}`,
      operationIdentity: identity,
      mutate: () => windowsTransport.quiesceRuntimeMonitor({ operationIdentity: identity }),
      readCurrent: inspectMonitor,
      classifyReadback: (state) => classifyMonitorQuiescence(state, before),
    });
    const final = await inspectMonitor().catch(() => null);
    if (reconciliation.readbackClassification === WorkerReadbackClassification.PROVEN_NOT_APPLIED) {
      throw workerControlError(WorkerErrorCode.ACTIVATION_FAILED, "Runtime Monitor quiescence was proven not applied.", safeEvidence({ mutationAttempted: true, ...reconciliation }));
    }
    if (reconciliation.readbackClassification !== WorkerReadbackClassification.PROVEN_APPLIED || !final) {
      throw workerControlError(WorkerErrorCode.AMBIGUOUS, "Runtime Monitor quiescence remains ambiguous; no second mutation is permitted.", safeEvidence({ mutationAttempted: true, ...reconciliation }));
    }
    if (final.cadencePresent || final.monitorProcessCount > 0 || final.taskState === "running") {
      throw workerControlError(WorkerErrorCode.CADENCE_STILL_ACTIVE, "Runtime Monitor or cadence child remains active after disable/stop.", safeWindowsEvidence(final));
    }
    return freeze({ ready: true, outcome: "quiesced", workerState: WorkerState.WINDOWS_CADENCE_QUIESCED, snapshot, evidence: safeEvidence(reconciliation) });
  }

  async function captureWindowsCadenceSnapshot({ operationId } = {}) {
    required(operationId, "operationId");
    const [monitor, productionServer, ngrok] = await Promise.all([inspectMonitor(), inspectProductionServer(), inspectNgrok()]);
    if (monitor.enabled !== true) {
      throw workerControlError(WorkerErrorCode.SNAPSHOT_MISMATCH, "Runtime Monitor pre-change snapshot requires the exact enabled state.", safeWindowsEvidence(monitor));
    }
    return freeze({ ready: true, snapshot: createSnapshot(monitor, productionServer, ngrok) });
  }

  async function retireWindowsWorkers({ operationId, operationIdentity } = {}) {
    const identity = requireIdentity(operationIdentity, operationId, "retire-windows-workers");
    // Prove both independent Windows resources before stopping either one. This avoids an otherwise
    // preventable partial retirement when the second resource already has conflicting identity.
    const [serverBefore, ngrokBefore] = await Promise.all([inspectProductionServer(), inspectNgrok()]);
    const server = await retireExactWindowsResource({
      resourceKey: `windows-task:${WINDOWS_PRODUCTION_TASK}`,
      identity: childIdentity(identity, "production-server"),
      inspect: inspectProductionServer,
      mutate: windowsTransport.retireProductionServer,
      before: serverBefore,
    });
    const ngrok = await retireExactWindowsResource({
      resourceKey: `windows-task:${WINDOWS_NGROK_TASK}`,
      identity: childIdentity(identity, "ngrok"),
      inspect: inspectNgrok,
      mutate: windowsTransport.retireNgrok,
      before: ngrokBefore,
    });
    return freeze({ retired: true, workerState: WorkerState.WINDOWS_RETIRED, server, ngrok });
  }

  async function retireExactWindowsResource({ resourceKey, identity, inspect, mutate, before }) {
    if (before.retired === true) return freeze({ outcome: "idempotent-replay", evidence: safeWindowsEvidence(before) });
    const reconciliation = await mutationReconciler.execute({
      resourceKey,
      operationIdentity: identity,
      mutate: () => mutate.call(windowsTransport, { operationIdentity: identity }),
      readCurrent: inspect,
      classifyReadback: (state) => state?.retired === true
        ? WorkerReadbackClassification.PROVEN_APPLIED
        : exactActiveState(state, before) ? WorkerReadbackClassification.PROVEN_NOT_APPLIED : WorkerReadbackClassification.STILL_AMBIGUOUS,
    });
    if (reconciliation.readbackClassification !== WorkerReadbackClassification.PROVEN_APPLIED) {
      const ambiguous = reconciliation.readbackClassification === WorkerReadbackClassification.STILL_AMBIGUOUS;
      throw workerControlError(ambiguous ? WorkerErrorCode.AMBIGUOUS : WorkerErrorCode.RETIRE_FAILED,
        ambiguous ? "Windows retirement remains ambiguous; no second mutation is permitted." : "Windows retirement was proven not applied.",
        safeEvidence({ mutationAttempted: true, ...reconciliation }));
    }
    return freeze({ outcome: "retired", evidence: safeEvidence(reconciliation) });
  }

  async function restoreWindowsWorkers({ operationId, snapshot, operationIdentity } = {}) {
    const identity = requireIdentity(operationIdentity, operationId, "restore-runtime-monitor");
    const current = await inspectMonitor();
    const expected = validateSnapshot(snapshot, current.definitionSha256);
    if (current.cadencePresent || current.monitorProcessCount > 0) {
      throw workerControlError(WorkerErrorCode.SNAPSHOT_MISMATCH, "Runtime Monitor restoration requires a quiescent exact current state.", safeWindowsEvidence(current));
    }
    if (current.enabled === expected.runtimeMonitor.enabled && current.definitionSha256 === expected.runtimeMonitor.definitionSha256) {
      return freeze({ workerState: WorkerState.WINDOWS_ACTIVE, outcome: "idempotent-replay", snapshot: expected });
    }
    const reconciliation = await mutationReconciler.execute({
      resourceKey: `windows-task:${WINDOWS_MONITOR_TASK}`,
      operationIdentity: identity,
      mutate: () => windowsTransport.restoreRuntimeMonitor({ snapshot: expected, operationIdentity: identity }),
      readCurrent: inspectMonitor,
      classifyReadback: (state) => classifyMonitorRestoration(state, current, expected),
    });
    if (reconciliation.readbackClassification !== WorkerReadbackClassification.PROVEN_APPLIED) {
      const ambiguous = reconciliation.readbackClassification === WorkerReadbackClassification.STILL_AMBIGUOUS;
      throw workerControlError(ambiguous ? WorkerErrorCode.AMBIGUOUS : WorkerErrorCode.RESTORE_FAILED,
        ambiguous ? "Runtime Monitor restoration remains ambiguous; no second mutation is permitted." : "Runtime Monitor restoration was proven not applied.",
        safeEvidence({ mutationAttempted: true, ...reconciliation }));
    }
    return freeze({ workerState: WorkerState.WINDOWS_ACTIVE, outcome: "restored", snapshot: expected, evidence: safeEvidence(reconciliation) });
  }

  return freeze({
    kind: "production-combined-cutover-worker-control",
    inspectWorkerState,
    inspectWindowsCadence,
    captureWindowsCadenceSnapshot,
    quiesceWindowsCadence,
    activateProviderWorkers,
    verifyProviderWorkers,
    retireWindowsWorkers,
    restoreWindowsWorkers,
  });

}

function createSnapshot(monitor, productionServer, ngrok) {
  return freeze({
    schemaVersion: 1,
    runtimeMonitor: freeze({
      taskName: WINDOWS_MONITOR_TASK,
      enabled: monitor.enabled === true,
      taskState: String(monitor.taskState),
      definitionSha256: monitor.definitionSha256,
    }),
    runtimeDesiredState: String(monitor.runtimeDesiredState ?? "unknown"),
    ngrokDesiredState: String(monitor.ngrokDesiredState ?? "unknown"),
    cadencePresent: monitor.cadencePresent === true,
    productionServer: freeze({
      taskName: WINDOWS_PRODUCTION_TASK,
      taskState: String(productionServer.taskState),
      definitionSha256: productionServer.definitionSha256,
      listenerPid: productionServer.listenerPid ?? null,
      nodeOwnershipProven: productionServer.nodeOwnershipProven === true,
      runtimeMetadataMatches: productionServer.runtimeMetadataMatches === true,
    }),
    ngrok: freeze({
      taskName: WINDOWS_NGROK_TASK,
      taskState: String(ngrok.taskState),
      definitionSha256: ngrok.definitionSha256,
      processId: ngrok.processId ?? null,
      processOwnershipProven: ngrok.processOwnershipProven === true,
    }),
  });
}

function validateSnapshot(snapshot, expectedDefinitionSha256) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.runtimeMonitor?.taskName !== WINDOWS_MONITOR_TASK ||
      typeof snapshot.runtimeMonitor.enabled !== "boolean" || !["ready", "running", "disabled"].includes(String(snapshot.runtimeMonitor.taskState)) ||
      snapshot.runtimeMonitor.definitionSha256 !== expectedDefinitionSha256 || typeof snapshot.cadencePresent !== "boolean" ||
      !["running", "stopped", "unknown"].includes(String(snapshot.runtimeDesiredState)) ||
      !["running", "stopped", "unknown"].includes(String(snapshot.ngrokDesiredState)) ||
      snapshot.productionServer?.taskName !== WINDOWS_PRODUCTION_TASK || !isSha256(snapshot.productionServer?.definitionSha256) ||
      typeof snapshot.productionServer?.nodeOwnershipProven !== "boolean" || typeof snapshot.productionServer?.runtimeMetadataMatches !== "boolean" ||
      snapshot.ngrok?.taskName !== WINDOWS_NGROK_TASK || !isSha256(snapshot.ngrok?.definitionSha256) ||
      typeof snapshot.ngrok?.processOwnershipProven !== "boolean") {
    throw workerControlError(WorkerErrorCode.SNAPSHOT_MISMATCH, "Runtime Monitor restoration snapshot is missing, unsafe, or mismatched.");
  }
  return freeze({
    schemaVersion: 1,
    runtimeMonitor: freeze({
      taskName: WINDOWS_MONITOR_TASK,
      enabled: snapshot.runtimeMonitor.enabled,
      taskState: String(snapshot.runtimeMonitor.taskState),
      definitionSha256: snapshot.runtimeMonitor.definitionSha256,
    }),
    runtimeDesiredState: String(snapshot.runtimeDesiredState),
    ngrokDesiredState: String(snapshot.ngrokDesiredState),
    cadencePresent: snapshot.cadencePresent,
    productionServer: freeze({
      taskName: WINDOWS_PRODUCTION_TASK,
      taskState: String(snapshot.productionServer.taskState ?? "unknown"),
      definitionSha256: snapshot.productionServer.definitionSha256,
      listenerPid: positiveIntegerOrNull(snapshot.productionServer.listenerPid),
      nodeOwnershipProven: snapshot.productionServer.nodeOwnershipProven,
      runtimeMetadataMatches: snapshot.productionServer.runtimeMetadataMatches,
    }),
    ngrok: freeze({
      taskName: WINDOWS_NGROK_TASK,
      taskState: String(snapshot.ngrok.taskState ?? "unknown"),
      definitionSha256: snapshot.ngrok.definitionSha256,
      processId: positiveIntegerOrNull(snapshot.ngrok.processId),
      processOwnershipProven: snapshot.ngrok.processOwnershipProven,
    }),
  });
}

function classifyMonitorQuiescence(state, prior) {
  if (state?.definitionSha256 !== prior.definitionSha256) return WorkerReadbackClassification.STILL_AMBIGUOUS;
  if (state.enabled === false && state.taskState !== "running" && state.monitorProcessCount === 0 && state.cadencePresent === false) return WorkerReadbackClassification.PROVEN_APPLIED;
  if (state.enabled === prior.enabled && state.taskState === prior.taskState && state.monitorProcessCount === prior.monitorProcessCount && state.cadencePresent === prior.cadencePresent) return WorkerReadbackClassification.PROVEN_NOT_APPLIED;
  return WorkerReadbackClassification.STILL_AMBIGUOUS;
}

function classifyMonitorRestoration(state, prior, expected) {
  if (state?.definitionSha256 !== expected.runtimeMonitor.definitionSha256) return WorkerReadbackClassification.STILL_AMBIGUOUS;
  if (state.enabled === expected.runtimeMonitor.enabled && (!expected.runtimeMonitor.enabled || expected.runtimeMonitor.taskState !== "running" || state.taskState === "running")) return WorkerReadbackClassification.PROVEN_APPLIED;
  if (state.enabled === prior.enabled && state.taskState === prior.taskState) return WorkerReadbackClassification.PROVEN_NOT_APPLIED;
  return WorkerReadbackClassification.STILL_AMBIGUOUS;
}

function exactActiveState(current, prior) {
  return current?.taskName === prior?.taskName && current?.retired === false && current?.taskState === prior?.taskState;
}

function requireIdentity(value, operationId, suffix) {
  const expectedOperationId = required(operationId, "operationId");
  if (!value || typeof value !== "object" || Array.isArray(value) || required(value.operationId, "operationIdentity.operationId") !== expectedOperationId) {
    throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Worker operation identity does not match the cutover operation.");
  }
  const commandId = required(value.commandId, "operationIdentity.commandId");
  if (!commandId.endsWith(`:${suffix}`)) throw workerControlError(WorkerErrorCode.IDENTITY_MISMATCH, "Worker command identity has the wrong fixed operation suffix.");
  return freeze({ operationId: expectedOperationId, commandId });
}

function childIdentity(identity, child) {
  return freeze({ operationId: identity.operationId, commandId: `${identity.commandId}:${child}` });
}

function safeWindowsEvidence(value) {
  if (!value || typeof value !== "object") return freeze({ observed: false });
  const allowed = ["taskName", "present", "enabled", "taskState", "definitionMatches", "definitionSha256", "monitorProcessCount", "cadenceProcessCount", "cadencePresent", "runtimeDesiredState", "ngrokDesiredState", "listenerCount", "listenerPid", "nodeOwnershipProven", "runtimeMetadataMatches", "retired", "canonicalProcessCount", "foreignProcessCount", "processId", "processOwnershipProven", "desiredState"];
  return freeze(Object.fromEntries(allowed.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]])));
}

function safeEvidence(value) { return freeze(redactProviderEvidence(value)); }
function normalizeTimestamp(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : null;
}
function isSha256(value) { return /^[0-9a-f]{64}$/.test(String(value ?? "")); }
function positiveIntegerOrNull(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) throw new Error(`${field} is required.`); return candidate; }
function boundedInteger(value, field, minimum, maximum) { if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`); return value; }
function assertDependencies({ client, heartbeatStore, windowsTransport, mutationReconciler }) {
  if (typeof client?.getDeployment !== "function") throw new Error("Worker control requires DigitalOcean getDeployment.");
  if (typeof heartbeatStore?.latestHeartbeat !== "function") throw new Error("Worker control requires latestHeartbeat.");
  for (const method of ["inspectRuntimeMonitor", "quiesceRuntimeMonitor", "restoreRuntimeMonitor", "inspectProductionServer", "retireProductionServer", "inspectNgrok", "retireNgrok"]) {
    if (typeof windowsTransport?.[method] !== "function") throw new Error(`Worker control requires windowsTransport.${method}.`);
  }
  if (typeof mutationReconciler?.execute !== "function" || typeof mutationReconciler?.hasUnresolvedMutation !== "function") {
    throw new Error("Worker control requires a mutation reconciler.");
  }
}
function freeze(value) {
  if (!value || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freeze(entry)])));
}
