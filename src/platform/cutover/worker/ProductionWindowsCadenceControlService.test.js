import { describe, expect, it } from "vitest";
import { MigrationFenceState } from "../migrationControlState.js";
import { createProductionWindowsCadenceControlService } from "./ProductionWindowsCadenceControlService.js";
import { createDeterministicCombinedCutoverWorkerControl } from "./testSupport/deterministicWorkerControl.js";

const OPERATION_ID = "combined-op-cadence";
const FENCE_ID = "fence-cadence";
const input = { migrationOperationId: OPERATION_ID, commandPrefix: OPERATION_ID };

describe("ProductionWindowsCadenceControlService — B ordering", () => {
  it("refuses Runtime Monitor mutation without exact active write-fence evidence", async () => {
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorRunning: true, cadenceActive: true });
    const service = createProductionWindowsCadenceControlService({ controlStore: store(controlState({ fenceState: MigrationFenceState.INACTIVE, writesEnabled: true })), workerControl });
    await expect(service.quiesceAfterWriteFence({ input, fenceEvidence: { ready: true, fenceId: FENCE_ID } }))
      .rejects.toMatchObject({ code: "WORKER_WINDOWS_FENCE_REQUIRED" });
    expect(workerControl.inspectCalls()).toHaveLength(0);
  });

  it("after the exact fence, drains/disables only Runtime Monitor and leaves Production Server/ngrok untouched", async () => {
    const workerControl = createDeterministicCombinedCutoverWorkerControl({ runtimeMonitorRunning: true, cadenceActive: true });
    const service = createProductionWindowsCadenceControlService({ controlStore: store(controlState()), workerControl });
    const result = await service.quiesceAfterWriteFence({ input, fenceEvidence: { ready: true, fenceId: FENCE_ID } });
    expect(result).toMatchObject({ ready: true, workerState: "windows-cadence-quiesced" });
    expect(workerControl.inspectCalls().map((call) => call.op)).toEqual(["quiesce"]);
    expect(workerControl.currentWindowsState()).toEqual({
      monitorEnabled: false, monitorRunning: false, cadencePresent: false,
      serverRetired: false, ngrokRetired: false,
    });
  });

  it("rejects stale fence identity", async () => {
    const workerControl = createDeterministicCombinedCutoverWorkerControl();
    const service = createProductionWindowsCadenceControlService({ controlStore: store(controlState()), workerControl });
    await expect(service.quiesceAfterWriteFence({ input, fenceEvidence: { ready: true, fenceId: "other" } })).rejects.toBeTruthy();
    expect(workerControl.inspectCalls()).toHaveLength(0);
  });
});

function controlState(overrides = {}) {
  return {
    fenceState: MigrationFenceState.ACTIVE,
    migrationOperationId: OPERATION_ID,
    fenceId: FENCE_ID,
    writesEnabled: false,
    firstPostgresWriteAt: null,
    ...overrides,
  };
}
function store(state) { return { read: async () => ({ state }) }; }
