import { describe, expect, it } from "vitest";
import { MigrationFenceState } from "../migrationControlState.js";
import { providerAuthoritativeState, firstWriteBoundaryState, windowsLegacyState, OPERATION_ID } from "../recovery/testSupport/recoveryFixtures.js";
import { createProductionWindowsWorkerRestorationService } from "./ProductionWindowsWorkerRestorationService.js";
import { createDeterministicCombinedCutoverWorkerControl } from "./testSupport/deterministicWorkerControl.js";

const input = { migrationOperationId: OPERATION_ID };

describe("ProductionWindowsWorkerRestorationService — pre-M ordering", () => {
  it("restores Runtime Monitor only after routing/authority/fence report full restoration", async () => {
    const events = [];
    const authorityStore = mutableStore(providerAuthoritativeState());
    const controlStore = mutableStore(activeFence());
    const deterministic = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorEnabled: false });
    const workerControl = loggingControl(deterministic, events);
    const authorityRestorationService = {
      async restoreWindowsAuthority() {
        events.push("routing-authority-fence");
        authorityStore.set(windowsLegacyState());
        controlStore.set(releasedFence());
        return { ready: true, classification: "RESTORED" };
      },
    };
    const service = createProductionWindowsWorkerRestorationService({ authorityStore, controlStore, authorityRestorationService, workerControl });
    const snapshot = exactSnapshot();
    await expect(service.restorePreBoundaryWindows({ input, snapshot })).resolves.toMatchObject({ ready: true, classification: "RESTORED" });
    expect(events).toEqual(["routing-authority-fence", "restore-runtime-monitor"]);
  });

  it("does not restore Runtime Monitor when base routing/authority/fence recovery is partial", async () => {
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorEnabled: false });
    const service = createProductionWindowsWorkerRestorationService({
      authorityStore: mutableStore(providerAuthoritativeState()),
      controlStore: mutableStore(activeFence()),
      authorityRestorationService: { restoreWindowsAuthority: async () => ({ ready: false, classification: "PARTIAL" }) },
      workerControl,
    });
    await expect(service.restorePreBoundaryWindows({ input, snapshot: exactSnapshot() })).resolves.toMatchObject({ ready: false, cadence: { action: "not-attempted" } });
    expect(workerControl.inspectCalls()).toHaveLength(0);
  });

  it("fails closed on snapshot mismatch after base restoration", async () => {
    const authorityStore = mutableStore(providerAuthoritativeState());
    const controlStore = mutableStore(activeFence());
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorEnabled: false });
    const service = createProductionWindowsWorkerRestorationService({
      authorityStore, controlStore,
      authorityRestorationService: { async restoreWindowsAuthority() { authorityStore.set(windowsLegacyState()); controlStore.set(releasedFence()); return { ready: true, classification: "RESTORED" }; } },
      workerControl,
    });
    await expect(service.restorePreBoundaryWindows({ input, snapshot: exactSnapshot({ definitionSha256: "b".repeat(64) }) }))
      .rejects.toMatchObject({ code: "WORKER_WINDOWS_SNAPSHOT_MISMATCH" });
    expect(workerControl.inspectCalls().filter((call) => call.op === "restore")).toHaveLength(1);
  });

  it("refuses after M before base recovery or any Windows worker call", async () => {
    let baseCalls = 0;
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorEnabled: false });
    const service = createProductionWindowsWorkerRestorationService({
      authorityStore: mutableStore(firstWriteBoundaryState()),
      controlStore: mutableStore(activeFence()),
      authorityRestorationService: { async restoreWindowsAuthority() { baseCalls += 1; } },
      workerControl,
    });
    await expect(service.restorePreBoundaryWindows({ input, snapshot: exactSnapshot() })).rejects.toMatchObject({ code: "RECOVERY_ROLLBACK_ILLEGAL" });
    expect(baseCalls).toBe(0);
    expect(workerControl.inspectCalls()).toHaveLength(0);
  });

  it("propagates ambiguous snapshot restoration once without retry", async () => {
    const authorityStore = mutableStore(providerAuthoritativeState());
    const controlStore = mutableStore(activeFence());
    const ambiguous = Object.assign(new Error("restore unresolved"), { code: "WORKER_OUTCOME_AMBIGUOUS" });
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorEnabled: false, failRestoreWith: ambiguous });
    const service = createProductionWindowsWorkerRestorationService({
      authorityStore, controlStore,
      authorityRestorationService: { async restoreWindowsAuthority() { authorityStore.set(windowsLegacyState()); controlStore.set(releasedFence()); return { ready: true, classification: "RESTORED" }; } },
      workerControl,
    });
    await expect(service.restorePreBoundaryWindows({ input, snapshot: exactSnapshot() })).rejects.toMatchObject({ code: "WORKER_OUTCOME_AMBIGUOUS" });
    expect(workerControl.inspectCalls().filter((call) => call.op === "restore")).toHaveLength(1);
  });
});

function exactSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    runtimeMonitor: { taskName: "PhysiqueOS Runtime Monitor", enabled: true, taskState: "ready", definitionSha256: "a".repeat(64), ...overrides },
    runtimeDesiredState: "running", ngrokDesiredState: "running", cadencePresent: false,
  };
}
function activeFence() { return { fenceState: MigrationFenceState.ACTIVE, firstPostgresWriteAt: null, writesEnabled: false, migrationOperationId: OPERATION_ID }; }
function releasedFence() { return { fenceState: MigrationFenceState.ABORTED, firstPostgresWriteAt: null, writesEnabled: true, migrationOperationId: OPERATION_ID }; }
function mutableStore(initial) { let state = initial; return { read: async () => ({ state }), set(value) { state = value; } }; }
function loggingControl(control, events) {
  return {
    ...control,
    async restoreWindowsWorkers(args) { events.push("restore-runtime-monitor"); return control.restoreWindowsWorkers(args); },
  };
}
