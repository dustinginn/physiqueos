// Isolated (never live) Windows-local migration-control store for Phase 6C recovery tests. Test-
// support only; never imported by production code. The live production fence must never be activated
// during tests - every instance here is backed by a fresh temp file, discarded afterward.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDurableMigrationControlStore } from "../../DurableMigrationControlStore.js";
import { MigrationControlAction } from "../../migrationControlState.js";

export async function withIsolatedMigrationControlStore(run, { environment = "synthetic" } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-recovery-fence-"));
  try {
    const controlStore = createDurableMigrationControlStore({ filePath: path.join(root, "migration-control.json") });
    controlStore.initialize({ environment, operator: "test-operator", commandId: "init:1", correlationId: "init" });
    return await run(controlStore);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

export function activateIsolatedFence(controlStore, operationId) {
  const current = controlStore.read().state;
  return controlStore.transition({
    action: MigrationControlAction.ACTIVATE_FENCE,
    commandId: `${operationId}:activate-fence`,
    correlationId: operationId,
    operator: "test-operator",
    reason: "test fixture fence activation",
    expectedVersion: current.version,
    expectedFenceState: current.fenceState,
    expectedCanonicalStoreEpoch: current.canonicalStoreEpoch,
    expectedCompositionMode: current.compositionMode,
    migrationOperationId: operationId,
    expectedMigrationId: operationId,
  });
}
