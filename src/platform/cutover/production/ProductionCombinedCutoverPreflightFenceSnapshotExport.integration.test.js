// Integration-style proof for the Phase 6B preflight/fence/snapshot/export chain: the REAL
// CombinedAppPlatformCutoverOrchestrator, the REAL CombinedRuntimeAuthorityState machine (against the
// transaction-faithful fixture), the REAL isolated DurableMigrationControlStore (Windows-local write
// fence), and the REAL Phase 6B preflight/fence/snapshot/export production services, driven together
// exactly as they would run in production. Only the LATER stages (Phase 3 transfer, Phase 4
// import/parity/acknowledge, Phase 5 handoff, Phase 6A verify/recover) remain minimal stubs, matching
// the pattern already established by the Phase 5/6A integration tests - this file does not duplicate
// any authority or migration-control transition in a test helper.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCombinedAppPlatformCutoverOrchestrator } from "../CombinedAppPlatformCutoverOrchestrator.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { initializeCombinedCutoverAuthority } from "../CombinedCutoverAuthorityInitializer.js";
import { createTransactionalPostgresFixture } from "../../database/testing/transactionalPostgresFixture.js";
import { createDurableMigrationControlStore } from "../DurableMigrationControlStore.js";
import { MigrationFenceState, MigrationControlAction } from "../migrationControlState.js";
import { createVerifyAuthorizationPreflight } from "./ProductionCombinedCutoverAuthorizationPreflight.js";
import { createVerifyWindowsSourcePreflight } from "./ProductionWindowsSourceIdentityPreflight.js";
import { createVerifyCostCeilingPreflight } from "./ProductionCostCeilingPreflight.js";
import { createVerifyProviderBuildPreflight, createVerifyTargetIsolationPreflight, createVerifyBackupsPreflight } from "./ProductionProviderReadinessPreflights.js";
import { createProductionWindowsWriteFenceAdapter } from "./ProductionWindowsWriteFenceAdapter.js";
import { createProductionFinalSnapshotService } from "./ProductionFinalSnapshotService.js";
import { createProductionFinalPackageExportService } from "./ProductionFinalPackageExportService.js";
import { combinedCutoverOperationPaths } from "./combinedCutoverOperationWorkspace.js";
import { writeSyntheticFounderSource, syntheticBuildIdentityProvider, cleanCheckoutStatusProvider, SYNTHETIC_SOURCE_COMMIT, SYNTHETIC_BUILD_ID } from "./testSupport/productionCutoverFixtures.js";

const ENVIRONMENT = "combined-cutover-p6b-integration-test";
const OPERATION_ID = "combined-op-p6b-0001";
const digest = (character) => character.repeat(64);
const authorizationFingerprint = digest("a");
const routingTarget = "provider-ingress";
const providerSource = Object.freeze({ commit: "p".repeat(40), buildId: "provider-build" });
const target = Object.freeze({ databaseClusterId: "cluster", databaseName: "physiqueos_production", spacesBucket: "bucket" });

async function withTempDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-p6b-"));
  try { return await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function harness(root, { providerBuildReady = true } = {}) {
  const { runtimePath, mediaRoot } = await writeSyntheticFounderSource({ root });
  const runtimeBytes = await fs.readFile(runtimePath);
  const runtimeSha256 = createHash("sha256").update(runtimeBytes).digest("hex");

  const fixture = createTransactionalPostgresFixture();
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment: ENVIRONMENT });
  const controlStore = createDurableMigrationControlStore({ filePath: path.join(root, "migration-control.json") });
  controlStore.initialize({ environment: ENVIRONMENT, operator: "test-operator", commandId: "init:1", correlationId: "init" });

  const fenceAdapter = createProductionWindowsWriteFenceAdapter({ controlStore });
  const snapshotService = createProductionFinalSnapshotService({
    sourceRuntimePath: runtimePath, sourceMediaRoot: mediaRoot, workspaceRoot: root,
    buildIdentityProvider: syntheticBuildIdentityProvider(),
  });
  const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });

  const preflightAdapters = {
    verifyAuthorization: createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT }),
    verifyWindowsSource: createVerifyWindowsSourcePreflight({
      runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider(),
    }),
    verifyProviderBuild: createVerifyProviderBuildPreflight(providerBuildReady ? { providerBuildVerifier: { verify: async () => ({ ready: true }) } } : {}),
    verifyTargetIsolation: createVerifyTargetIsolationPreflight({ providerTargetIsolationVerifier: { verify: async () => ({ ready: true }) } }),
    verifyBackups: createVerifyBackupsPreflight({ backupFreshnessVerifier: { verify: async () => ({ ready: true, status: "PASS" }) } }),
    verifyCostCeiling: createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: 500 }),
  };

  const stubAdapters = {
    transferSnapshot: async () => ({ receiptId: "synthetic-receipt" }),
    importProviderCanonicalState: async () => ({ ready: true, records: 1 }),
    verifyProviderParity: async () => ({ ready: true }),
    // `state` here is combined_runtime_authority AFTER BEGIN_CUTOVER already durably bound the
    // real fenceId and finalSnapshot.packageDigest - the acknowledgement must echo those exact
    // durable values back (ACKNOWLEDGE_PROVIDER's own guard requires it), so this stub reads them
    // from `state` rather than needing its own tracking of the fence/snapshot results.
    async acknowledgeProviderPrepared({ input, state }) {
      return {
        migrationOperationId: input.migrationOperationId, authorizationFingerprint: input.authorizationFingerprint,
        fenceId: state.fenceId, packageDigest: state.finalSnapshot.packageDigest, providerDeploymentId: "deployment-1",
      };
    },
    async transferAuthorityAndRoute({ commitAuthority }) {
      await commitAuthority();
      return { ready: true };
    },
    verifyPostHandoff: async () => ({ ready: true }),
    restoreWindowsAuthority: async () => ({ ready: true }),
    enterProviderRecovery: async () => ({ ready: true }),
  };

  const adapters = {
    ...preflightAdapters,
    activateWindowsWriteFence: fenceAdapter.activateWindowsWriteFence,
    captureFinalSnapshot: snapshotService.captureFinalSnapshot,
    exportFinalPackage: exportService.exportFinalPackage,
    ...stubAdapters,
  };

  const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore, adapters });

  return {
    fixture, authorityStore, controlStore, orchestrator, adapters, root,
    expectedRuntimeSha256: runtimeSha256,
  };
}

function executeInput({ expectedRuntimeSha256, expectedMonthlyCostUsd = 100 }, overrides = {}) {
  return {
    productionAuthorization: true,
    migrationOperationId: OPERATION_ID,
    authorizationFingerprint,
    commandPrefix: OPERATION_ID,
    routingTarget,
    expectedRuntimeSha256,
    expectedRuntimeRevision: 1,
    expectedSourceCommit: SYNTHETIC_SOURCE_COMMIT,
    expectedBuildId: SYNTHETIC_BUILD_ID,
    expectedMonthlyCostUsd,
    providerSource,
    target,
    ...overrides,
  };
}

async function initialize(fixture) {
  return initializeCombinedCutoverAuthority({ pool: fixture.pool, environment: ENVIRONMENT, windowsSource: { commit: SYNTHETIC_SOURCE_COMMIT, buildId: SYNTHETIC_BUILD_ID }, now: new Date("2026-08-20T00:00:00.000Z").toISOString() });
}

describe("integration — real preflight/fence/snapshot/export chain through the real orchestrator", () => {
  it("captures and exports a package whose manifest digest matches the durably committed final snapshot, satisfying the Phase 3 transfer contract", async () => {
    await withTempDir(async (root) => {
      const { fixture, authorityStore, orchestrator, expectedRuntimeSha256 } = await harness(root);
      await initialize(fixture);
      const result = await orchestrator.execute(executeInput({ expectedRuntimeSha256 }));
      expect(result.classification).toBe("COMPLETED");

      const final = (await authorityStore.read()).state;
      expect(final.finalSnapshot.packageDigest).toBe(result.snapshot.packageDigest);
      expect(final.firstProviderCanonicalWriteAt).toBeNull();

      // Re-read the exported package from disk exactly as exportFinalPackage did (a pure read-and-
      // verify step, safe to call again) and reproduce the exact assertion
      // WindowsCombinedCutoverTransferClient.js already makes on a real export.
      const exportService = createProductionFinalPackageExportService({ workspaceRoot: root });
      const exported = await exportService.exportFinalPackage({ input: { migrationOperationId: OPERATION_ID }, state: final, snapshot: result.snapshot });
      expect(exported.manifest.semanticDigest).toBe(result.snapshot.packageDigest);
      expect(exported.manifest.semanticDigest).toBe(final.finalSnapshot.packageDigest);
    });
  });

  it("a preflight failure (unavailable provider-build capability) runs before any fence mutation", async () => {
    await withTempDir(async (root) => {
      const { fixture, controlStore, orchestrator, expectedRuntimeSha256 } = await harness(root, { providerBuildReady: false });
      await initialize(fixture);
      await expect(orchestrator.execute(executeInput({ expectedRuntimeSha256 }))).rejects.toMatchObject({ code: "CUTOVER_PREFLIGHT_FAILED" });
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.INACTIVE);
    });
  });

  it("a preflight failure (cost ceiling exceeded) runs before any fence mutation", async () => {
    await withTempDir(async (root) => {
      const { fixture, controlStore, orchestrator, expectedRuntimeSha256 } = await harness(root);
      await initialize(fixture);
      await expect(orchestrator.execute(executeInput({ expectedRuntimeSha256, expectedMonthlyCostUsd: 999999 }))).rejects.toMatchObject({ code: "CUTOVER_PREFLIGHT_FAILED" });
      expect(controlStore.read().state.fenceState).toBe(MigrationFenceState.INACTIVE);
    });
  });

  it("a fence activation failure (fence already active for a conflicting operation) creates no snapshot workspace", async () => {
    await withTempDir(async (root) => {
      const { fixture, controlStore, orchestrator, expectedRuntimeSha256, root: workspaceRoot } = await harness(root);
      await initialize(fixture);
      // Simulate the Windows fence already held by a different, unrelated migration attempt.
      const before = controlStore.read().state;
      controlStore.transition({
        action: MigrationControlAction.ACTIVATE_FENCE, commandId: "other-operation:activate", correlationId: "other", operator: "someone-else",
        reason: "unrelated fence", expectedVersion: before.version, expectedFenceState: before.fenceState,
        expectedCanonicalStoreEpoch: before.canonicalStoreEpoch, expectedCompositionMode: before.compositionMode,
        migrationOperationId: "other-operation", expectedMigrationId: "other-operation",
      });

      await expect(orchestrator.execute(executeInput({ expectedRuntimeSha256 }))).rejects.toThrow();
      const paths = combinedCutoverOperationPaths(OPERATION_ID, { workspaceRoot });
      await expect(fs.stat(paths.root)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("a snapshot capture failure creates no exported package", async () => {
    await withTempDir(async (root) => {
      const { fixture, orchestrator: baseOrchestrator, adapters, authorityStore, expectedRuntimeSha256, root: workspaceRoot } = await harness(root);
      await initialize(fixture);
      const failingAdapters = { ...adapters, captureFinalSnapshot: async () => { throw new Error("synthetic snapshot failure"); } };
      const failingOrchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore, adapters: failingAdapters });

      await expect(failingOrchestrator.execute(executeInput({ expectedRuntimeSha256 }))).rejects.toThrow(/synthetic snapshot failure/);
      const paths = combinedCutoverOperationPaths(OPERATION_ID, { workspaceRoot });
      await expect(fs.stat(paths.package)).rejects.toMatchObject({ code: "ENOENT" });
      void baseOrchestrator;
    });
  });
});
