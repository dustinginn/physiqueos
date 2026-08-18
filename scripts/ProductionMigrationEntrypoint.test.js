import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  importProductionMigrationModule,
  normalizeProductionMigrationModuleSpecifier,
} from "./productionMigrationModuleLoader.mjs";

const root = process.cwd();
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("production migration module loader", () => {
  it.runIf(process.platform === "win32")("normalizes Windows absolute paths, backslashes, and spaces", () => {
    const directory = temporaryDirectory("production migration loader ");
    const modulePath = path.join(directory, "adapter with spaces.mjs");
    expect(modulePath).toMatch(/^[A-Za-z]:\\/);
    expect(normalizeProductionMigrationModuleSpecifier(modulePath, { allowedRoot: directory }))
      .toBe(pathToFileURL(modulePath).href);
  });

  it("keeps file URLs and package specifiers usable and normalizes platform-absolute paths", () => {
    const directory = temporaryDirectory("production-migration-loader-");
    const modulePath = path.join(directory, "adapter.mjs");
    const fileUrl = pathToFileURL(modulePath).href;
    expect(normalizeProductionMigrationModuleSpecifier(fileUrl, { allowedRoot: directory })).toBe(fileUrl);
    expect(normalizeProductionMigrationModuleSpecifier("@physiqueos/migration-adapter")).toBe("@physiqueos/migration-adapter");
    expect(normalizeProductionMigrationModuleSpecifier(path.resolve(directory, "posix-compatible.mjs"), { allowedRoot: directory }))
      .toBe(pathToFileURL(path.resolve(directory, "posix-compatible.mjs")).href);
  });

  it("resolves relative filesystem paths inside the allowed root", () => {
    const directory = temporaryDirectory("production-migration-relative-");
    expect(normalizeProductionMigrationModuleSpecifier("./adapter.mjs", {
      baseDirectory: directory,
      allowedRoot: directory,
    })).toBe(pathToFileURL(path.join(directory, "adapter.mjs")).href);
  });

  it("imports a real module through the same loader used by the CLI", async () => {
    const directory = temporaryDirectory("production migration import ");
    const modulePath = path.join(directory, "adapter with spaces.mjs");
    fs.writeFileSync(modulePath, "export const loaded = 'windows-file-url-pass';\n", "utf8");
    await expect(importProductionMigrationModule(modulePath, { allowedRoot: directory }))
      .resolves.toMatchObject({ loaded: "windows-file-url-pass" });
  });

  it("fails closed for unsupported schemes, escaped paths, and missing files", async () => {
    const directory = temporaryDirectory("production-migration-fail-closed-");
    expect(() => normalizeProductionMigrationModuleSpecifier("https://example.invalid/adapter.mjs"))
      .toThrow(expect.objectContaining({ code: "PRODUCTION_MIGRATION_MODULE_SCHEME_UNSUPPORTED" }));
    expect(() => normalizeProductionMigrationModuleSpecifier("../outside.mjs", {
      baseDirectory: directory,
      allowedRoot: directory,
    })).toThrow(expect.objectContaining({ code: "PRODUCTION_MIGRATION_MODULE_PATH_OUTSIDE_ROOT" }));
    await expect(importProductionMigrationModule(path.join(directory, "missing.mjs"), { allowedRoot: directory }))
      .rejects.toMatchObject({ code: "ERR_MODULE_NOT_FOUND" });
  });
});

describe("production migration CLI Windows entrypoint", () => {
  it("loads the actual runner and reaches non-mutating dry-run preflight", () => {
    const directory = temporaryDirectory("production migration cli ");
    for (const file of [
      "runProductionMigration.mjs",
      "productionMigrationModuleLoader.mjs",
      "sourceModuleResolutionHook.mjs",
    ]) {
      fs.copyFileSync(path.join(root, "scripts", file), path.join(directory, file));
    }
    const runnerUrl = pathToFileURL(path.join(root, "src", "platform", "cutover", "ProductionMigrationRunner.js")).href;
    fs.writeFileSync(
      path.join(directory, "productionMigrationEnvironmentAdapters.mjs"),
      fixtureEnvironmentSource(runnerUrl),
      "utf8",
    );
    const result = spawnSync(process.execPath, ["runProductionMigration.mjs", "--dry-run", "true"], {
      cwd: directory,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toContain("ERR_UNSUPPORTED_ESM_URL_SCHEME");
    expect(JSON.parse(result.stdout)).toMatchObject({
      classification: "READY",
      finalMigrationAuthorizationSupplied: false,
      finalMigrationAuthorizationRequired: true,
      controlState: {
        fenceState: "inactive",
        canonicalStoreEpoch: "legacy-json",
        compositionMode: "legacy-json",
        writesEnabled: true,
        readsEnabled: true,
        migrationOperationId: null,
        firstPostgresWriteAt: null,
      },
      fixture: {
        transitionCount: 0,
        calls: [
          "inspectBuildIdentity",
          "inspectCanonicalSource",
          "verifyBackup",
          "backupFreshness",
          "verifyTargetHealth",
          "verifyMigrationScripts",
          "verifyCollectionInventory",
        ],
      },
    });
  });

  it("fails with the explicit provider-boundary code instead of attempting DigitalOcean PostgreSQL from Windows", async () => {
    const { assertTrustedProviderExecutionBoundary } = await import("./productionMigrationEnvironmentAdapters.mjs");
    const databaseConfig = { connectionString: "postgresql://example.invalid@private.db.ondigitalocean.com:25060/target" };
    expect(() => assertTrustedProviderExecutionBoundary(databaseConfig, {})).toThrow(expect.objectContaining({ code: "MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED" }));
    expect(() => assertTrustedProviderExecutionBoundary(databaseConfig, {
      PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY: "digitalocean-app-platform",
      PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED: "1",
    })).not.toThrow();
  });
});

describe("production migration operation workspace", () => {
  it("creates the gitignored workspace parent in a clean checkout that has no .tmp hierarchy", async () => {
    const { operationPaths, prepareOperationWorkspace } = await import("./productionMigrationEnvironmentAdapters.mjs");
    const workspaceRoot = temporaryDirectory("production-migration-workspace-");
    expect(fs.existsSync(path.join(workspaceRoot, ".tmp"))).toBe(false);

    const paths = operationPaths("gate8-production-migration-20260818-073122", { workspaceRoot });
    await prepareOperationWorkspace(paths);

    expect(fs.existsSync(paths.parent)).toBe(true);
    expect(fs.existsSync(paths.root)).toBe(true);
    expect(paths.parent).toBe(path.join(workspaceRoot, ".tmp", "production-migration"));
  });

  it("still refuses to reuse an existing operation directory", async () => {
    const { operationPaths, prepareOperationWorkspace } = await import("./productionMigrationEnvironmentAdapters.mjs");
    const workspaceRoot = temporaryDirectory("production-migration-workspace-");
    const paths = operationPaths("gate8-retry-0001", { workspaceRoot });

    await prepareOperationWorkspace(paths);
    await expect(prepareOperationWorkspace(paths)).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("keeps rejecting operation identifiers that would escape the workspace parent", async () => {
    const { operationPaths } = await import("./productionMigrationEnvironmentAdapters.mjs");
    const workspaceRoot = temporaryDirectory("production-migration-workspace-");
    expect(() => operationPaths("..", { workspaceRoot })).toThrow(/escaped/);
    expect(() => operationPaths("has space", { workspaceRoot })).toThrow(/unsafe/);
  });
});

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

function fixtureEnvironmentSource(runnerUrl) {
  return `
import { createProductionMigrationRunner } from ${JSON.stringify(runnerUrl)};

const state = Object.freeze({
  schemaVersion: "production-migration-control-v1",
  version: 1,
  environment: "isolated-cli-test",
  fenceId: null,
  migrationOperationId: null,
  expectedMigrationId: null,
  fenceState: "inactive",
  canonicalStoreEpoch: "legacy-json",
  compositionMode: "legacy-json",
  canonicalStoreTarget: "legacy-json",
  writesEnabled: true,
  readsEnabled: true,
  firstPostgresWriteAt: null,
});
const calls = [];
let transitionCount = 0;
const controlStore = {
  read: () => ({ state, audit: [] }),
  transition: () => { transitionCount += 1; throw new Error("Dry-run attempted a control transition."); },
};
const requiredAdapters = [
  "inspectBuildIdentity", "inspectCanonicalSource", "verifyBackup", "verifyTargetHealth",
  "verifyMigrationScripts", "verifyCollectionInventory", "captureFinalSnapshot", "exportCanonicalPackage",
  "verifyPackage", "importCanonicalPackage", "verifyImport", "verifyReadParity", "verifyCommandReadiness",
  "switchComposition", "verifyProductionReads", "acceptRepresentativePostgresWrite", "runPostCutoverSmoke",
  "enterStabilization",
];
const adapters = Object.fromEntries(requiredAdapters.map((name) => [name, async () => {
  calls.push(name);
  if (name === "inspectBuildIdentity") return pass({
    identity: { commit: "a".repeat(40), buildId: "cli-fixture-build" },
    repositoryCommit: "a".repeat(40),
    migrationScriptCommit: "a".repeat(40),
  });
  if (name === "inspectCanonicalSource") return pass({ runtimeRevision: "122", runtimeSha256: "b".repeat(64) });
  if (name === "verifyMigrationScripts") return pass({ productionRunnerWired: true, providerCompositionWired: true });
  return pass();
}]));
const backupFreshnessVerifier = { verify: async () => {
  calls.push("backupFreshness");
  return { ready: true, status: "PASS", reason: "isolated-cli-fixture-current", mutated: false };
} };
const runner = createProductionMigrationRunner({ controlStore, adapters, backupFreshnessVerifier });

export async function createProductionMigrationEnvironment() {
  return {
    runner,
    readOperatorInput: () => ({
      operator: "founder",
      migrationOperationId: "isolated-cli-dry-run",
      expectedMigrationId: "isolated-cli-package",
      correlationId: "isolated-cli-correlation",
      commandPrefix: "isolated-cli-command",
      reason: "Windows CLI regression fixture.",
      expectedSourceCommit: "a".repeat(40),
      expectedBuildId: "cli-fixture-build",
      expectedRuntimeRevision: "122",
      expectedRuntimeSha256: "b".repeat(64),
      expectedControlVersion: 1,
    }),
    redactResult: (result) => ({ ...result, fixture: { calls, transitionCount } }),
    close: async () => {},
  };
}

function pass(value = {}) { return { ready: true, mutated: false, ...value }; }
`;
}
