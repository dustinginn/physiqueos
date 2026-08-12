import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDurableMigrationControlStore } from "./DurableMigrationControlStore.js";
import { createProductionMigrationOrchestrator } from "./ProductionMigrationOrchestrator.js";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("bounded production migration wrapper", () => {
  it("keeps dry-run non-mutating while verifying every preflight", async () => {
    const fixture = createFixture();
    const before = fixture.store.read().state;
    const result = await fixture.wrapper.dryRun(input());
    expect(result.classification).toBe("READY");
    expect(fixture.store.read().state).toEqual(before);
    expect(fixture.calls).toEqual([
      "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth",
      "verifyMigrationScripts", "verifyCollectionInventory",
    ]);
  });

  it("runs the strict isolated cutover order and records the first PostgreSQL write before release", async () => {
    const fixture = createFixture();
    const result = await fixture.wrapper.execute(input());
    expect(result.classification).toBe("COMPLETED");
    expect(result.controlState).toMatchObject({
      fenceState: "completed",
      canonicalStoreEpoch: "postgres-canonical",
      compositionMode: "postgres",
      writesEnabled: true,
    });
    expect(result.controlState.firstPostgresWriteAt).toBeTruthy();
    expect(fixture.calls).toEqual([
      "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth", "verifyMigrationScripts", "verifyCollectionInventory",
      "captureFinalSnapshot", "exportCanonicalPackage", "verifyPackage", "importCanonicalPackage", "migrateMedia",
      "verifyImport", "verifyReadParity", "verifyCommandReadiness", "switchComposition", "verifyProductionReads",
      "acceptRepresentativePostgresWrite", "runPostCutoverSmoke", "enterStabilization",
    ]);
    const actions = fixture.store.read().audit.map((entry) => entry.action);
    expect(actions).toEqual([
      "initialized", "activate-fence", "begin-cutover", "switch-to-postgres",
      "record-first-postgres-write", "release-fence",
    ]);
  });

  it("aborts to unchanged legacy state when import fails before canonical switch", async () => {
    const fixture = createFixture({ failAt: "importCanonicalPackage" });
    await expect(fixture.wrapper.execute(input())).rejects.toMatchObject({
      migrationRecovery: { classification: "ABORTED_TO_LEGACY", automaticLegacyRollback: true },
    });
    expect(fixture.store.read().state).toMatchObject({
      fenceState: "aborted",
      canonicalStoreEpoch: "legacy-json",
      compositionMode: "legacy-json",
      writesEnabled: true,
      firstPostgresWriteAt: null,
    });
    expect(fixture.calls).toContain("rollbackTargetBeforeWrite");
  });

  it("never returns to stale JSON after the first PostgreSQL write", async () => {
    const fixture = createFixture({ failAt: "runPostCutoverSmoke" });
    await expect(fixture.wrapper.execute(input())).rejects.toMatchObject({
      migrationRecovery: { classification: "FORWARD_REPAIR_REQUIRED", automaticLegacyRollback: false },
    });
    expect(fixture.store.read().state).toMatchObject({
      fenceState: "recovery-required",
      canonicalStoreEpoch: "postgres-canonical",
      compositionMode: "postgres",
      writesEnabled: false,
    });
    expect(fixture.calls).not.toContain("rollbackTargetBeforeWrite");
  });

  it("repeats successfully from a second fresh isolated target", async () => {
    const first = createFixture();
    const second = createFixture();
    await expect(first.wrapper.execute(input({ commandPrefix: "rehearsal-one" }))).resolves.toMatchObject({ classification: "COMPLETED" });
    await expect(second.wrapper.execute(input({ commandPrefix: "rehearsal-two", migrationOperationId: "migration-operation-0002" }))).resolves.toMatchObject({ classification: "COMPLETED" });
    expect(first.store.read().state.compositionMode).toBe("postgres");
    expect(second.store.read().state.compositionMode).toBe("postgres");
  });

  it("aborts to legacy when the hard pre-write fence budget is exhausted", async () => {
    const fixture = createFixture({ monotonicStepMs: 120_000 });
    await expect(fixture.wrapper.execute(input())).rejects.toMatchObject({
      code: "CUTOVER_WINDOW_EXCEEDED_BEFORE_FIRST_POSTGRES_WRITE",
      migrationRecovery: { classification: "ABORTED_TO_LEGACY", automaticLegacyRollback: true },
    });
    expect(fixture.store.read().state).toMatchObject({
      fenceState: "aborted",
      canonicalStoreEpoch: "legacy-json",
      compositionMode: "legacy-json",
      writesEnabled: true,
      firstPostgresWriteAt: null,
    });
  });
});

function createFixture({ failAt = null, monotonicStepMs = 7 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "migration-wrapper-"));
  directories.push(directory);
  const filePath = path.join(directory, "control.json");
  let clockTick = 0;
  let monotonic = 0;
  const store = createDurableMigrationControlStore({
    filePath,
    now: () => new Date(`2026-08-12T21:00:${String(clockTick++).padStart(2, "0")}.000Z`),
  });
  store.initialize({
    environment: "isolated-rehearsal",
    operator: "founder",
    commandId: "initialize-control-0001",
    correlationId: "initialize-correlation-0001",
    sourceIdentity: { commit: "accepted-commit", buildId: "accepted-build" },
  });
  const calls = [];
  const adapters = Object.fromEntries([
    "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth", "verifyMigrationScripts", "verifyCollectionInventory",
    "captureFinalSnapshot", "exportCanonicalPackage", "verifyPackage", "importCanonicalPackage", "migrateMedia", "verifyImport",
    "verifyReadParity", "verifyCommandReadiness", "switchComposition", "verifyProductionReads", "acceptRepresentativePostgresWrite",
    "runPostCutoverSmoke", "enterStabilization", "rollbackTargetBeforeWrite",
  ].map((name) => [name, async () => {
    calls.push(name);
    monotonic += monotonicStepMs;
    if (name === failAt) {
      const error = new Error(`Deliberate ${name} failure.`);
      error.code = `DELIBERATE_${name.toUpperCase()}_FAILURE`;
      throw error;
    }
    if (name === "inspectBuildIdentity") return { ready: true, mutated: false, identity: { commit: "accepted-commit", buildId: "accepted-build" } };
    if (["inspectCanonicalSource", "verifyBackup", "verifyTargetHealth", "verifyMigrationScripts", "verifyCollectionInventory"].includes(name)) return { ready: true, mutated: false };
    if (name === "acceptRepresentativePostgresWrite") return { accepted: true, receiptId: "isolated-receipt" };
    return { status: "passed" };
  }]));
  const wrapper = createProductionMigrationOrchestrator({
    controlStore: store,
    adapters,
    monotonicNow: () => monotonic,
  });
  return { store, calls, wrapper };
}

function input(overrides = {}) {
  return {
    mode: "isolated",
    operator: "founder",
    migrationOperationId: "migration-operation-0001",
    expectedMigrationId: "migration-package-0001",
    correlationId: "migration-correlation-0001",
    commandPrefix: "migration-command-0001",
    reason: "Isolated production-wrapper acceptance rehearsal.",
    ...overrides,
  };
}
