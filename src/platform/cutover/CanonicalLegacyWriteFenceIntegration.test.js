import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderRuntimeStore, persistFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore.js";
import { createDurableMigrationControlStore } from "./DurableMigrationControlStore.js";
import { MigrationControlAction } from "./migrationControlState.js";

const directories = [];
afterEach(() => {
  delete process.env.PHYSIQUEOS_MIGRATION_CONTROL_PATH;
  directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe("legacy canonical write fence integration", () => {
  it("permits inactive writes and prevents an active-fence mutation from reaching the canonical file", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-write-fence-"));
    directories.push(directory);
    const controlPath = path.join(directory, "control.json");
    const runtimePath = path.join(directory, "runtime-store.json");
    process.env.PHYSIQUEOS_MIGRATION_CONTROL_PATH = controlPath;
    const controlStore = createDurableMigrationControlStore({ filePath: controlPath });
    let state = controlStore.initialize({
      environment: "isolated-rehearsal", operator: "founder", commandId: "initialize-legacy-fence-0001",
      correlationId: "correlation-legacy-fence-0001", sourceIdentity: { commit: "test", buildId: "test" },
    }).state;
    const runtime = createFounderRuntimeStore({ revision: 5, weightEntries: [] });
    persistFounderRuntimeStore(runtime, { filePath: runtimePath, mutatedCollection: "weightEntries", throwOnError: true });
    const before = digest(runtimePath);
    const beforeWeightIds = JSON.parse(fs.readFileSync(runtimePath, "utf8")).weightEntries.map((entry) => entry.id);
    state = controlStore.transition({
      action: MigrationControlAction.ACTIVATE_FENCE,
      commandId: "activate-legacy-fence-0001", correlationId: "correlation-legacy-fence-0001", operator: "founder",
      reason: "Test active fence.", expectedVersion: state.version, expectedFenceState: state.fenceState,
      expectedCanonicalStoreEpoch: state.canonicalStoreEpoch, expectedCompositionMode: state.compositionMode,
      migrationOperationId: "legacy-fence-operation", expectedMigrationId: "legacy-fence-migration",
    }).state;
    runtime.weightEntries.push({ id: "blocked-weight", userId: "user_founder_001", value: 180 });
    expect(() => persistFounderRuntimeStore(runtime, { filePath: runtimePath, mutatedCollection: "weightEntries", throwOnError: true })).toThrowError(expect.objectContaining({
      status: 503,
      code: "CANONICAL_WRITES_PAUSED",
    }));
    expect(digest(runtimePath)).toBe(before);
    expect(JSON.parse(fs.readFileSync(runtimePath, "utf8")).weightEntries.map((entry) => entry.id)).toEqual(beforeWeightIds);
    expect(beforeWeightIds).not.toContain("blocked-weight");
  });
});

function digest(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
