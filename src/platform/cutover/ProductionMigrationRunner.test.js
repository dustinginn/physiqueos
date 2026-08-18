import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDurableMigrationControlStore } from "./DurableMigrationControlStore.js";
import { createProductionMigrationRunner } from "./ProductionMigrationRunner.js";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("single bounded production migration runner", () => {
  it("dry-runs the same adapter wiring without any canonical/control mutation", async () => {
    const fixture = createFixture();
    const before = fixture.store.read();
    const result = await fixture.runner.dryRun(input());
    expect(result).toMatchObject({ classification: "READY", finalMigrationAuthorizationSupplied: false, finalMigrationAuthorizationRequired: true });
    expect(fixture.store.read()).toEqual(before);
    expect(fixture.calls).toEqual([
      "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "backupFreshness", "verifyTargetHealth",
      "verifyMigrationScripts", "verifyCollectionInventory",
    ]);
  });

  it("blocks dry-run when independent managed backup evidence is stale", async () => {
    const fixture = createFixture({ backupReady: false });
    await expect(fixture.runner.dryRun(input())).rejects.toMatchObject({ code: "MANAGED_POSTGRES_BACKUP_NOT_FRESH" });
    expect(fixture.store.read().state.fenceState).toBe("inactive");
  });

  it("requires the exact separate final GO and then executes through the accepted orchestrator", async () => {
    const fixture = createFixture();
    await expect(fixture.runner.execute({ ...input(), finalMigrationAuthorization: "yes" }))
      .rejects.toMatchObject({ code: "FINAL_MIGRATION_AUTHORIZATION_REQUIRED" });
    const phrase = fixture.runner.expectedAuthorization(input());
    const result = await fixture.runner.execute({ ...input(), finalMigrationAuthorization: phrase });
    expect(result).toMatchObject({ classification: "COMPLETED", controlState: { compositionMode: "postgres", canonicalStoreEpoch: "postgres-canonical" } });
    expect(fixture.calls).toContain("acceptRepresentativePostgresWrite");
  });

  it("fails closed on exact build/runtime/control mismatches before fencing", async () => {
    const fixture = createFixture();
    await expect(fixture.runner.dryRun(input({ expectedBuildId: "wrong-build" })))
      .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_IDENTITY_MISMATCH" });
    await expect(fixture.runner.dryRun(input({ expectedControlVersion: 2 })))
      .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH" });
    expect(fixture.store.read().state.fenceState).toBe("inactive");
  });
});

describe("retry after a clean pre-write ABORT_TO_LEGACY", () => {
  it("accepts a fresh operation from the aborted legacy-safe state, mints new fence identity, and preserves the prior audit trail", async () => {
    const fixture = createFixture({ failAt: "captureFinalSnapshot" });
    const first = input();
    await expect(fixture.runner.execute({ ...first, finalMigrationAuthorization: fixture.runner.expectedAuthorization(first) }))
      .rejects.toThrow();

    const aborted = fixture.store.read();
    expect(aborted.state).toMatchObject({
      fenceState: "aborted",
      canonicalStoreEpoch: "legacy-json",
      compositionMode: "legacy-json",
      canonicalStoreTarget: "legacy-json",
      writesEnabled: true,
      readsEnabled: true,
      firstPostgresWriteAt: null,
      migrationOperationId: "migration-operation-0001",
    });
    expect(aborted.state.fenceId).toEqual(expect.any(String));

    fixture.control.failAt = null;
    const retry = input({
      migrationOperationId: "migration-operation-0002",
      correlationId: "migration-correlation-0002",
      commandPrefix: "migration-command-0002",
      expectedControlVersion: aborted.state.version,
    });
    const result = await fixture.runner.execute({ ...retry, finalMigrationAuthorization: fixture.runner.expectedAuthorization(retry) });
    expect(result).toMatchObject({ classification: "COMPLETED" });

    const after = fixture.store.read();
    expect(after.state.migrationOperationId).toBe("migration-operation-0002");
    expect(after.state.fenceId).not.toBe(aborted.state.fenceId);
    expect(after.state.correlationId).toBe("migration-correlation-0002");
    // Prior audit entries are retained byte-for-byte and only appended to.
    expect(after.audit.length).toBeGreaterThan(aborted.audit.length);
    expect(after.audit.slice(0, aborted.audit.length)).toEqual(aborted.audit);
  });

  it("rejects reuse of the aborted migration operation ID", async () => {
    // executeAgainst submits "migration-operation-0002"; the aborted state already owns it.
    await expect(executeAgainst(controlState({ migrationOperationId: "migration-operation-0002" })))
      .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_OPERATION_REUSE_REJECTED" });
  });

  it("rejects an aborted state that already crossed the first PostgreSQL write boundary", async () => {
    await expect(executeAgainst(controlState({ firstPostgresWriteAt: "2026-08-18T14:34:07.029Z" })))
      .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH" });
  });

  it("rejects inconsistent canonical epoch, composition, target, or disabled read/write safety fields", async () => {
    for (const overrides of [
      { canonicalStoreEpoch: "postgres-canonical" },
      { canonicalStoreEpoch: "migration-fence" },
      { compositionMode: "postgres" },
      { canonicalStoreTarget: "postgres" },
      { writesEnabled: false },
      { readsEnabled: false },
    ]) {
      await expect(executeAgainst(controlState(overrides)))
        .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH" });
    }
  });

  it("rejects every non-restartable fence state even when all other invariants look legacy-safe", async () => {
    for (const fenceState of ["active", "cutover-in-progress", "completed", "recovery-required"]) {
      await expect(executeAgainst(controlState({ fenceState })))
        .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH" });
    }
  });

  it("still requires a null operation ID when starting from the pristine inactive state", async () => {
    await expect(executeAgainst(controlState({ fenceState: "inactive", migrationOperationId: "left-over-operation" })))
      .rejects.toMatchObject({ code: "PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH" });
  });
});

function controlState(overrides = {}) {
  return {
    schemaVersion: "production-migration-control-v1",
    version: 4,
    environment: "isolated",
    fenceId: "fence-0001",
    migrationOperationId: "migration-operation-0001",
    fenceState: "aborted",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "legacy-json",
    canonicalStoreTarget: "legacy-json",
    writesEnabled: true,
    readsEnabled: true,
    firstPostgresWriteAt: null,
    ...overrides,
  };
}

/** Drives the runner's pre-fence guard against a crafted control state; any transition attempt fails the test. */
function executeAgainst(state) {
  const store = {
    read: () => ({ state, audit: [] }),
    transition: () => { throw new Error("The pre-fence guard must reject before any control transition."); },
  };
  const adapters = Object.fromEntries([
    "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth", "verifyMigrationScripts",
    "verifyCollectionInventory", "captureFinalSnapshot", "exportCanonicalPackage", "verifyPackage", "importCanonicalPackage",
    "migrateMedia", "verifyImport", "verifyReadParity", "verifyCommandReadiness", "switchComposition", "verifyProductionReads",
    "acceptRepresentativePostgresWrite", "runPostCutoverSmoke", "enterStabilization", "rollbackTargetBeforeWrite",
  ].map((name) => [name, async () => { throw new Error(`Adapter ${name} must not run when the pre-fence guard rejects.`); }]));
  const runner = createProductionMigrationRunner({
    controlStore: store,
    adapters,
    backupFreshnessVerifier: { verify: async () => ({ ready: true, status: "PASS", reason: "backup-current" }) },
  });
  const value = input({ migrationOperationId: "migration-operation-0002", expectedControlVersion: state.version });
  return runner.execute({ ...value, finalMigrationAuthorization: runner.expectedAuthorization(value) });
}

function createFixture({ backupReady = true, failAt = null } = {}) {
  const control = { failAt };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-migration-runner-"));
  directories.push(directory);
  let tick = 0;
  const store = createDurableMigrationControlStore({ filePath: path.join(directory, "control.json"), now: () => new Date(`2026-08-13T12:00:${String(tick++).padStart(2, "0")}.000Z`) });
  store.initialize({ environment: "isolated", operator: "founder", commandId: "initialize", correlationId: "initialize", sourceIdentity: { commit: "a".repeat(40), buildId: "build-one" } });
  const calls = [];
  const names = [
    "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth", "verifyMigrationScripts", "verifyCollectionInventory",
    "captureFinalSnapshot", "exportCanonicalPackage", "verifyPackage", "importCanonicalPackage", "migrateMedia", "verifyImport",
    "verifyReadParity", "verifyCommandReadiness", "switchComposition", "verifyProductionReads", "acceptRepresentativePostgresWrite",
    "runPostCutoverSmoke", "enterStabilization", "rollbackTargetBeforeWrite",
  ];
  const adapters = Object.fromEntries(names.map((name) => [name, async () => {
    calls.push(name);
    if (control.failAt === name) throw new Error(`Fixture-induced failure at ${name}.`);
    if (name === "inspectBuildIdentity") return pass({ identity: { commit: "a".repeat(40), buildId: "build-one" } });
    if (name === "inspectCanonicalSource") return pass({ runtimeRevision: "122", runtimeSha256: "b".repeat(64) });
    if (name === "verifyMigrationScripts") return pass({ productionRunnerWired: true, providerCompositionWired: true });
    if (name === "acceptRepresentativePostgresWrite") return { accepted: true };
    return name.startsWith("verify") ? pass() : { status: "passed" };
  }]));
  const backupFreshnessVerifier = { verify: async () => {
    calls.push("backupFreshness");
    return { ready: backupReady, status: backupReady ? "PASS" : "BLOCKED", reason: backupReady ? "backup-current" : "backup-stale" };
  } };
  const runner = createProductionMigrationRunner({ controlStore: store, adapters, backupFreshnessVerifier });
  return { store, calls, runner, control };
}

function input(overrides = {}) {
  return {
    operator: "founder",
    migrationOperationId: "migration-operation-0001",
    expectedMigrationId: "migration-package-0001",
    correlationId: "migration-correlation-0001",
    commandPrefix: "migration-command-0001",
    reason: "Isolated runner acceptance.",
    expectedSourceCommit: "a".repeat(40),
    expectedBuildId: "build-one",
    expectedRuntimeRevision: "122",
    expectedRuntimeSha256: "b".repeat(64),
    expectedControlVersion: 1,
    ...overrides,
  };
}

function pass(value = {}) { return { ready: true, mutated: false, ...value }; }
