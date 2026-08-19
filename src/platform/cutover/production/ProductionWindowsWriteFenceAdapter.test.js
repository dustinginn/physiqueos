import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDurableMigrationControlStore } from "../DurableMigrationControlStore.js";
import { createProductionWindowsWriteFenceAdapter } from "./ProductionWindowsWriteFenceAdapter.js";
import { MigrationFenceState, MigrationControlAction } from "../migrationControlState.js";

const ENVIRONMENT = "combined-cutover-fence-test";

async function withIsolatedControlStore(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-fence-"));
  try {
    const filePath = path.join(root, "migration-control.json");
    const controlStore = createDurableMigrationControlStore({ filePath });
    controlStore.initialize({ environment: ENVIRONMENT, operator: "test-operator", commandId: "init:1", correlationId: "init" });
    return await run(controlStore);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function input(overrides = {}) {
  return { migrationOperationId: "combined-op-fence-0001", commandPrefix: "combined-op-fence-0001", ...overrides };
}

describe("ProductionWindowsWriteFenceAdapter — construction", () => {
  it("requires the durable migration-control store", () => {
    expect(() => createProductionWindowsWriteFenceAdapter({})).toThrow();
  });
});

describe("ProductionWindowsWriteFenceAdapter — activateWindowsWriteFence", () => {
  it("activates the isolated Windows write fence exactly once for a valid pre-cutover state", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      const result = await adapter.activateWindowsWriteFence({ input: input() });
      expect(result).toMatchObject({ ready: true });
      expect(result.fenceId).toBeTruthy();
      expect(result.controlState.fenceState).toBe(MigrationFenceState.ACTIVE);
      expect(result.controlState.writesEnabled).toBe(false);

      const after = controlStore.read().state;
      expect(after.fenceState).toBe(MigrationFenceState.ACTIVE);
      expect(after.migrationOperationId).toBe("combined-op-fence-0001");
    });
  });

  it("is idempotent on an identical command replay (same operation, same commandPrefix)", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      const first = await adapter.activateWindowsWriteFence({ input: input() });
      const second = await adapter.activateWindowsWriteFence({ input: input() });
      expect(second.fenceId).toBe(first.fenceId);
      expect(controlStore.read().state.version).toBe(first.controlState.version); // no second transition applied
    });
  });

  it("fails closed when the fence is already active for a different operation (stale/conflicting attempt)", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      await adapter.activateWindowsWriteFence({ input: input() });
      await expect(adapter.activateWindowsWriteFence({ input: input({ migrationOperationId: "combined-op-fence-other", commandPrefix: "combined-op-fence-other" }) }))
        .rejects.toMatchObject({ code: "MIGRATION_CONTROL_TRANSITION_REJECTED" });
    });
  });

  it("fails closed on a reused commandId with different inputs (wrong operation for the same command)", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      await adapter.activateWindowsWriteFence({ input: input() });
      await expect(adapter.activateWindowsWriteFence({ input: input({ migrationOperationId: "combined-op-fence-DIFFERENT" }) }))
        .rejects.toMatchObject({ code: "MIGRATION_CONTROL_COMMAND_REUSED" });
    });
  });

  it("leaves firstPostgresWriteAt null after activation", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      const result = await adapter.activateWindowsWriteFence({ input: input() });
      expect(result.controlState.firstPostgresWriteAt).toBeNull();
    });
  });

  it("never touches combined_runtime_authority - the adapter exposes no method other than activateWindowsWriteFence", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      expect(Object.keys(adapter)).toEqual(["activateWindowsWriteFence"]);
    });
  });

  it("recovery can release the isolated fence via the existing ABORT_TO_LEGACY transition (pre-boundary path)", async () => {
    await withIsolatedControlStore(async (controlStore) => {
      const adapter = createProductionWindowsWriteFenceAdapter({ controlStore });
      const activated = await adapter.activateWindowsWriteFence({ input: input() });
      expect(activated.controlState.fenceState).toBe(MigrationFenceState.ACTIVE);

      const released = controlStore.transition({
        action: MigrationControlAction.ABORT_TO_LEGACY,
        commandId: "combined-op-fence-0001:abort",
        correlationId: "combined-op-fence-0001",
        operator: "test-operator",
        reason: "test recovery release",
        expectedVersion: activated.controlState.version,
        expectedFenceState: activated.controlState.fenceState,
        expectedCanonicalStoreEpoch: activated.controlState.canonicalStoreEpoch,
        expectedCompositionMode: activated.controlState.compositionMode,
        migrationOperationId: "combined-op-fence-0001",
      });
      expect(released.state.fenceState).toBe(MigrationFenceState.ABORTED);
      expect(released.state.writesEnabled).toBe(true);

      // The fence can now be activated again for a fresh operation.
      const reactivated = await adapter.activateWindowsWriteFence({ input: input({ migrationOperationId: "combined-op-fence-0002", commandPrefix: "combined-op-fence-0002" }) });
      expect(reactivated.controlState.fenceState).toBe(MigrationFenceState.ACTIVE);
    });
  });
});
