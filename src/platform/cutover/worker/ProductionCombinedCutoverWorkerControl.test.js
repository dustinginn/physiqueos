import { describe, expect, it, vi } from "vitest";
import { createDigitalOceanApiClient } from "../../provider/digitalocean/DigitalOceanApiClient.js";
import { createProductionCombinedCutoverWorkerControl } from "./ProductionCombinedCutoverWorkerControl.js";
import { createWorkerMutationReconciler } from "./WorkerMutationReconciler.js";
import { WorkerReadbackClassification, WorkerState } from "./combinedCutoverWorkerControl.js";
import { createDeterministicCombinedCutoverWorkerControl } from "./testSupport/deterministicWorkerControl.js";
import { createDeterministicWindowsWorkerTransport, runtimeMonitorSnapshot } from "./testSupport/deterministicWindowsWorkerTransport.js";

const APP_ID = "app-1";
const DEPLOYMENT_ID = "deployment-1";
const BUILD_ID = "phase7b-worker-build";
const WORKER_ID = "provider-worker-1";
const OPERATION_ID = "combined-op-worker-control";
const NOW = new Date("2026-08-21T05:00:00.000Z");
const identity = (suffix) => ({ operationId: OPERATION_ID, commandId: `${OPERATION_ID}:${suffix}` });

describe.each([
  ["deterministic contract double", () => ({ control: createDeterministicCombinedCutoverWorkerControl({ initialWorkerState: WorkerState.PROVIDER_ACTIVE }), providerDeploymentId: DEPLOYMENT_ID })],
  ["production adapter with mocked transports", () => { const fixture = harness(); return { control: fixture.control, providerDeploymentId: DEPLOYMENT_ID }; }],
])("worker-control parity — %s", (_label, factory) => {
  it("activates/verifies provider before retiring Windows", async () => {
    const { control, providerDeploymentId } = factory();
    await control.activateProviderWorkers({ operationId: OPERATION_ID, providerDeploymentId, operationIdentity: identity("activate-provider-workers") });
    await expect(control.verifyProviderWorkers({ operationId: OPERATION_ID, providerDeploymentId })).resolves.toMatchObject({ ready: true, workerState: WorkerState.PROVIDER_ACTIVE });
    await expect(control.retireWindowsWorkers({ operationId: OPERATION_ID, operationIdentity: identity("retire-windows-workers") })).resolves.toMatchObject({ retired: true });
  });
});

describe("production provider worker identity and M-gate-compatible posture", () => {
  it("treats the prestarted healthy exact deployment/build/worker heartbeat as active without scaling", async () => {
    const fixture = harness();
    const result = await fixture.control.activateProviderWorkers({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID, operationIdentity: identity("activate-provider-workers") });
    expect(result).toMatchObject({ mutated: false, outcome: "prestarted-authority-gated", workerState: WorkerState.PROVIDER_ACTIVE });
    expect(fixture.deploymentReads()).toBe(1);
  });

  it("keeps a paused-authority heartbeat inert and refuses N verification", async () => {
    const fixture = harness({ heartbeatStatus: "paused_authority" });
    await expect(fixture.control.activateProviderWorkers({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID, operationIdentity: identity("activate-provider-workers") }))
      .resolves.toMatchObject({ mutated: false, workerState: WorkerState.PROVIDER_INERT });
    await expect(fixture.control.verifyProviderWorkers({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID }))
      .rejects.toMatchObject({ code: "WORKER_VERIFICATION_FAILED" });
  });

  it.each([
    ["wrong deployment", { returnedDeploymentId: "deployment-other" }],
    ["non-ACTIVE deployment", { deploymentPhase: "DEPLOYING" }],
    ["wrong build", { heartbeatBuildId: "wrong-build" }],
    ["wrong worker", { heartbeatWorkerId: "wrong-worker" }],
    ["stale heartbeat", { heartbeatObservedAt: "2026-08-21T04:00:00.000Z" }],
  ])("fails closed for %s", async (_label, options) => {
    const fixture = harness(options);
    await expect(fixture.control.verifyProviderWorkers({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID })).rejects.toBeTruthy();
  });
});

describe("Runtime Monitor B control and ambiguity", () => {
  it("captures a safe exact pre-mutation snapshot without changing Windows", async () => {
    const fixture = harness();
    const result = await fixture.control.captureWindowsCadenceSnapshot({ operationId: OPERATION_ID });
    expect(result).toMatchObject({ ready: true, snapshot: { runtimeMonitor: { enabled: true }, productionServer: { listenerPid: 4100 }, ngrok: { processId: 4200 } } });
    expect(fixture.windows.mutationCount("quiesce-runtime-monitor")).toBe(0);
  });

  it("inspects the exact monitor and drains active cadence before proving disabled/stopped", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ monitor: { taskState: "running", monitorProcessCount: 1, cadenceProcessCount: 1, cadencePresent: true } });
    const fixture = harness({ windows });
    const result = await fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") });
    expect(result).toMatchObject({ ready: true, outcome: "quiesced", workerState: WorkerState.WINDOWS_CADENCE_QUIESCED });
    expect(result.snapshot).toMatchObject({
      cadencePresent: true,
      runtimeMonitor: { taskName: "PhysiqueOS Runtime Monitor", enabled: true },
      productionServer: { taskName: "PhysiqueOS Production Server", listenerPid: 4100, nodeOwnershipProven: true, runtimeMetadataMatches: true },
      ngrok: { taskName: "PhysiqueOS Ngrok Tunnel", processId: 4200, processOwnershipProven: true },
    });
    expect(windows.current().monitor).toMatchObject({ enabled: false, cadencePresent: false, monitorProcessCount: 0 });
  });

  it("fails closed on monitor definition mismatch before mutation", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ monitor: { definitionMatches: false } });
    const fixture = harness({ windows });
    await expect(fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") }))
      .rejects.toMatchObject({ code: "WORKER_IDENTITY_MISMATCH" });
    expect(windows.mutationCount("quiesce-runtime-monitor")).toBe(0);
  });

  it.each([
    ["ambiguous mutation with disabled readback", "ambiguous-applied", WorkerReadbackClassification.PROVEN_APPLIED, true],
    ["ambiguous mutation with prior enabled readback", "ambiguous-not-applied", WorkerReadbackClassification.PROVEN_NOT_APPLIED, false],
    ["ambiguous mutation with unreadable readback", "ambiguous-unreadable", WorkerReadbackClassification.STILL_AMBIGUOUS, false],
  ])("classifies %s with one mutation", async (_label, mode, classification, succeeds) => {
    const windows = createDeterministicWindowsWorkerTransport({ mutationModes: { "quiesce-runtime-monitor": mode } });
    const fixture = harness({ windows });
    const promise = fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") });
    if (succeeds) {
      await expect(promise).resolves.toMatchObject({ evidence: { readbackClassification: classification } });
    } else {
      const error = await capture(promise);
      expect(error.readbackClassification).toBe(classification);
    }
    expect(windows.mutationCount("quiesce-runtime-monitor")).toBe(1);
  });

  it("treats a conclusive disable rejection as failure with zero retry", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ mutationModes: { "quiesce-runtime-monitor": "rejected" } });
    const fixture = harness({ windows });
    await expect(fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") }))
      .rejects.toMatchObject({ classification: "WORKER_MUTATION_REJECTED" });
    expect(windows.mutationCount("quiesce-runtime-monitor")).toBe(1);
  });

  it("fails closed when cadence remains after disable and does not mutate twice", async () => {
    const windows = createDeterministicWindowsWorkerTransport({
      monitor: { cadenceProcessCount: 1, cadencePresent: true },
      mutationModes: { "quiesce-runtime-monitor": "accepted-cadence-remains" },
    });
    const fixture = harness({ windows });
    await expect(fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") }))
      .rejects.toMatchObject({ code: "WORKER_OUTCOME_AMBIGUOUS" });
    await expect(fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") }))
      .rejects.toMatchObject({ code: "WORKER_OUTCOME_AMBIGUOUS" });
    expect(windows.mutationCount("quiesce-runtime-monitor")).toBe(1);
  });

  it("blocks a second mutation while the first outcome remains unresolved", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ mutationModes: { "quiesce-runtime-monitor": "ambiguous-unreadable" } });
    const fixture = harness({ windows });
    await expect(fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") })).rejects.toBeTruthy();
    await expect(fixture.control.quiesceWindowsCadence({ operationId: OPERATION_ID, operationIdentity: identity("quiesce-runtime-monitor") })).rejects.toBeTruthy();
    expect(windows.mutationCount("quiesce-runtime-monitor")).toBe(1);
  });
});

describe("exact Windows ownership and recovery", () => {
  it("accepts exact Production Server and ngrok ownership", async () => {
    const fixture = harness();
    const state = await fixture.control.inspectWorkerState({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID });
    expect(state.windows.productionServer).toMatchObject({ listenerCount: 1, nodeOwnershipProven: true, runtimeMetadataMatches: true });
    expect(state.windows.ngrok).toMatchObject({ canonicalProcessCount: 1, foreignProcessCount: 0, processOwnershipProven: true });
  });

  it.each([
    ["listener mismatch", { productionServer: { listenerCount: 2 } }],
    ["Node ownership mismatch", { productionServer: { nodeOwnershipProven: false } }],
    ["runtime metadata mismatch", { productionServer: { runtimeMetadataMatches: false } }],
    ["duplicate ngrok", { ngrok: { canonicalProcessCount: 2 } }],
    ["foreign ngrok", { ngrok: { foreignProcessCount: 1 } }],
  ])("refuses %s", async (_label, windowsOptions) => {
    const windows = createDeterministicWindowsWorkerTransport(windowsOptions);
    const fixture = harness({ windows });
    await expect(fixture.control.inspectWorkerState({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID })).rejects.toBeTruthy();
  });

  it("requires exact snapshot identity for Runtime Monitor restoration", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ monitor: { enabled: false, taskState: "disabled" } });
    const fixture = harness({ windows });
    await expect(fixture.control.restoreWindowsWorkers({
      operationId: OPERATION_ID,
      snapshot: runtimeMonitorSnapshot({ runtimeMonitor: { definitionSha256: "b".repeat(64) } }),
      operationIdentity: identity("restore-runtime-monitor"),
    })).rejects.toMatchObject({ code: "WORKER_WINDOWS_SNAPSHOT_MISMATCH" });
    expect(windows.mutationCount("restore-runtime-monitor")).toBe(0);
  });

  it("restores only the canonical safe snapshot projection", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ monitor: { enabled: false, taskState: "disabled" } });
    const fixture = harness({ windows });
    const supplied = { ...runtimeMonitorSnapshot(), rawTaskXml: "must-not-survive", environment: { secret: "must-not-survive" } };
    const result = await fixture.control.restoreWindowsWorkers({
      operationId: OPERATION_ID, snapshot: supplied, operationIdentity: identity("restore-runtime-monitor"),
    });
    expect(result).toMatchObject({ outcome: "restored", workerState: WorkerState.WINDOWS_ACTIVE });
    expect(JSON.stringify(result)).not.toContain("must-not-survive");
    expect(windows.mutationCount("restore-runtime-monitor")).toBe(1);
  });

  it("fails an ambiguous Runtime Monitor restoration closed with one mutation", async () => {
    const windows = createDeterministicWindowsWorkerTransport({
      monitor: { enabled: false, taskState: "disabled" },
      mutationModes: { "restore-runtime-monitor": "ambiguous-unreadable" },
    });
    const fixture = harness({ windows });
    await expect(fixture.control.restoreWindowsWorkers({
      operationId: OPERATION_ID, snapshot: runtimeMonitorSnapshot(), operationIdentity: identity("restore-runtime-monitor"),
    })).rejects.toMatchObject({ code: "WORKER_OUTCOME_AMBIGUOUS" });
    expect(windows.mutationCount("restore-runtime-monitor")).toBe(1);
  });

  it("preflights both Windows retirement resources before stopping either", async () => {
    const windows = createDeterministicWindowsWorkerTransport({ ngrok: { canonicalProcessCount: 2 } });
    const fixture = harness({ windows });
    await expect(fixture.control.retireWindowsWorkers({ operationId: OPERATION_ID, operationIdentity: identity("retire-windows-workers") })).rejects.toBeTruthy();
    expect(windows.mutationCount("retire-production-server")).toBe(0);
    expect(windows.mutationCount("retire-ngrok")).toBe(0);
  });
});

describe("no-live and narrow surface", () => {
  it("uses only injected DigitalOcean/mock Windows transports", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("LIVE_NETWORK_DISABLED"));
    try {
      const fixture = harness();
      await fixture.control.inspectWorkerState({ operationId: OPERATION_ID, providerDeploymentId: DEPLOYMENT_ID });
      expect(globalFetch).not.toHaveBeenCalled();
    } finally { globalFetch.mockRestore(); }
  });
});

function harness({
  windows = createDeterministicWindowsWorkerTransport(),
  returnedDeploymentId = DEPLOYMENT_ID,
  deploymentPhase = "ACTIVE",
  heartbeatStatus = "healthy",
  heartbeatBuildId = BUILD_ID,
  heartbeatWorkerId = WORKER_ID,
  heartbeatObservedAt = "2026-08-21T04:59:30.000Z",
} = {}) {
  let deploymentReadCount = 0;
  const fetchImpl = vi.fn(async () => {
    deploymentReadCount += 1;
    return new Response(JSON.stringify({ deployment: { id: returnedDeploymentId, phase: deploymentPhase } }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createDigitalOceanApiClient({ accessToken: ["dop", "v1", "fixture"].join("_"), fetchImpl, requestTimeoutMs: 100 });
  const heartbeatStore = {
    latestHeartbeat: async () => ({ worker_id: heartbeatWorkerId, build_id: heartbeatBuildId, status: heartbeatStatus, observed_at: heartbeatObservedAt }),
  };
  const control = createProductionCombinedCutoverWorkerControl({
    client, appId: APP_ID, heartbeatStore, windowsTransport: windows,
    expectedProviderBuildId: BUILD_ID, expectedProviderWorkerId: WORKER_ID,
    maximumHeartbeatAgeMs: 120_000, now: () => NOW,
    mutationReconciler: createWorkerMutationReconciler({ maximumReadbackAttempts: 2, readbackIntervalMs: 0 }),
  });
  return { control, windows, deploymentReads: () => deploymentReadCount };
}

async function capture(promise) {
  try { await promise; throw new Error("Expected rejection."); } catch (error) { return error; }
}
