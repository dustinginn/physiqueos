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

function createFixture({ backupReady = true } = {}) {
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
  return { store, calls, runner };
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
