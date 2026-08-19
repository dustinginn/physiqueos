import { describe, expect, it } from "vitest";
import { assertWindowsFenceRollbackLegal, releaseCombinedCutoverWindowsFence } from "./combinedCutoverWindowsFenceRelease.js";
import { MigrationFenceState, MigrationControlAction } from "../migrationControlState.js";
import { withIsolatedMigrationControlStore, activateIsolatedFence } from "./testSupport/isolatedMigrationControlStore.js";

const OPERATION_ID = "combined-op-fence-release-0001";

describe("assertWindowsFenceRollbackLegal", () => {
  it("passes when firstPostgresWriteAt is null", () => {
    expect(() => assertWindowsFenceRollbackLegal({ firstPostgresWriteAt: null })).not.toThrow();
  });

  it("refuses when firstPostgresWriteAt is non-null", () => {
    expect(() => assertWindowsFenceRollbackLegal({ firstPostgresWriteAt: "2026-08-20T00:00:00.000Z" }))
      .toThrow(expect.objectContaining({ code: "RECOVERY_ROLLBACK_ILLEGAL" }));
  });
});

describe("releaseCombinedCutoverWindowsFence", () => {
  it("requires the durable migration-control store", async () => {
    await expect(releaseCombinedCutoverWindowsFence({ operationId: OPERATION_ID })).rejects.toThrow();
  });

  it("releases an active fence held by the exact operation through ABORT_TO_LEGACY", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const result = await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID });
      expect(result).toMatchObject({ action: "released", fenceState: MigrationFenceState.ABORTED, writesEnabled: true });
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.ABORTED);
    });
  });

  it("embeds the triggering failure code into the durable release reason when supplied", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID, error: { code: "SYNTHETIC_FAILURE_snapshot" } });
      expect(controlStore.read().state.reason).toContain("SYNTHETIC_FAILURE_snapshot");
    });
  });

  it("is a no-op when the fence is already inactive", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const result = await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID });
      expect(result).toMatchObject({ action: "not-required", fenceState: MigrationFenceState.INACTIVE });
    });
  });

  it("never releases a fence held by a different operation", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, "combined-op-other");
      const result = await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID });
      expect(result).toMatchObject({ action: "not-required" });
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.ACTIVE);
      expect(controlStore.read().state.migrationOperationId).toBe("combined-op-other");
    });
  });

  it("refuses (throws, never released) once the local firstPostgresWriteAt is non-null", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      const activated = activateIsolatedFence(controlStore, OPERATION_ID);
      let current = controlStore.transition({
        action: MigrationControlAction.BEGIN_CUTOVER, commandId: `${OPERATION_ID}:begin`, correlationId: OPERATION_ID, operator: "test-operator", reason: "test",
        expectedVersion: activated.state.version, expectedFenceState: activated.state.fenceState,
        expectedCanonicalStoreEpoch: activated.state.canonicalStoreEpoch, expectedCompositionMode: activated.state.compositionMode,
        migrationOperationId: OPERATION_ID,
      }).state;
      current = controlStore.transition({
        action: MigrationControlAction.SWITCH_TO_POSTGRES, commandId: `${OPERATION_ID}:switch`, correlationId: OPERATION_ID, operator: "test-operator", reason: "test",
        expectedVersion: current.version, expectedFenceState: current.fenceState, expectedCanonicalStoreEpoch: current.canonicalStoreEpoch, expectedCompositionMode: current.compositionMode,
        migrationOperationId: OPERATION_ID,
      }).state;
      controlStore.transition({
        action: MigrationControlAction.RECORD_FIRST_POSTGRES_WRITE, commandId: `${OPERATION_ID}:first-write`, correlationId: OPERATION_ID, operator: "test-operator", reason: "test",
        expectedVersion: current.version, expectedFenceState: current.fenceState, expectedCanonicalStoreEpoch: current.canonicalStoreEpoch, expectedCompositionMode: current.compositionMode,
        migrationOperationId: OPERATION_ID,
      });

      await expect(releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID }))
        .rejects.toMatchObject({ code: "RECOVERY_ROLLBACK_ILLEGAL" });
      // Still active - the guard refused before attempting any transition.
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.CUTOVER_IN_PROGRESS);
    });
  });

  it("audit history remains append-only across a release", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const auditBefore = controlStore.read().audit.length;
      await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID });
      const afterRead = controlStore.read();
      expect(afterRead.audit.length).toBe(auditBefore + 1);
      expect(afterRead.audit.slice(0, auditBefore)).toEqual(controlStore.read().audit.slice(0, auditBefore));
    });
  });

  it("is idempotent: a second release attempt for the same already-released operation is a safe no-op", async () => {
    await withIsolatedMigrationControlStore(async (controlStore) => {
      activateIsolatedFence(controlStore, OPERATION_ID);
      const first = await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID });
      const versionAfterFirst = controlStore.read().state.version;
      const second = await releaseCombinedCutoverWindowsFence({ controlStore, operationId: OPERATION_ID });
      expect(first.action).toBe("released");
      expect(second.action).toBe("not-required");
      expect(controlStore.read().state.version).toBe(versionAfterFirst);
    });
  });
});
