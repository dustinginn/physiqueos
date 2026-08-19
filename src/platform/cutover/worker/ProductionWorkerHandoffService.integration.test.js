// Integration-style proof for the Phase 6C worker-handoff service: the REAL
// CombinedAppPlatformCutoverOrchestrator (through phase L), the REAL CombinedRuntimeAuthorityState
// machine and PostgresCombinedRuntimeAuthorityStore (against the transaction-faithful fixture), the
// REAL Phase 5 ProductionAuthorityHandoffService, the REAL first-write-boundary transaction path
// (phase M, exactly like the synthetic rehearsal and other integration suites already exercise it),
// and NOW the REAL Phase 6C ProductionWorkerHandoffService (phase N/O) - proving the full documented
// sequence L -> M -> N/O end to end. No authority transition is duplicated in a test helper.
import { describe, expect, it } from "vitest";
import { createCombinedAppPlatformCutoverOrchestrator } from "../CombinedAppPlatformCutoverOrchestrator.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { initializeCombinedCutoverAuthority } from "../CombinedCutoverAuthorityInitializer.js";
import { createTransactionalPostgresFixture } from "../../database/testing/transactionalPostgresFixture.js";
import { createPhase4CanonicalRecordStore } from "../../database/Phase4CanonicalRecordStore.js";
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { createPostgresCombinedCutoverPreparationStore } from "../preparation/PostgresCombinedCutoverPreparationStore.js";
import { createFakePreparationPool } from "../preparation/testSupport/fakePreparationPool.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "../handoff/PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "../handoff/testSupport/fakeHandoffReceiptPool.js";
import { createProductionAuthorityHandoffService } from "../handoff/ProductionAuthorityHandoffService.js";
import { createDeterministicCombinedCutoverRoutingControl } from "../routing/testSupport/deterministicRoutingControl.js";
import { createProductionWorkerHandoffService } from "./ProductionWorkerHandoffService.js";
import { createDeterministicCombinedCutoverWorkerControl } from "./testSupport/deterministicWorkerControl.js";
import { WorkerState } from "./combinedCutoverWorkerControl.js";

const ENVIRONMENT = "combined-cutover-worker-integration-test";
const OPERATION_ID = "combined-op-worker-0001";
const digest = (character) => character.repeat(64);
const authorizationFingerprint = digest("a");
const fenceId = "fence-1";
const routingTarget = "provider-ingress";
const providerDeploymentId = "deployment-1";
const snapshot = Object.freeze({
  runtimeSha256: digest("b"), runtimeRevision: 140, mediaInventorySha256: digest("e"),
  migrationControlSha256: digest("f"), packageDigest: digest("c"),
});
const target = Object.freeze({ databaseClusterId: "cluster", databaseName: "physiqueos_production", spacesBucket: "bucket" });
const providerSource = Object.freeze({ commit: "p".repeat(40), buildId: "provider-build" });
const windowsSource = Object.freeze({ commit: "w".repeat(40), buildId: "windows-build" });

function harness({ workerControl = createDeterministicCombinedCutoverWorkerControl() } = {}) {
  const fixture = createTransactionalPostgresFixture();
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment: ENVIRONMENT });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
  const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
  const routing = createDeterministicCombinedCutoverRoutingControl();
  const handoffService = createProductionAuthorityHandoffService({ authorityStore, preparationStore, handoffReceiptStore, routingControl: routing });
  const workerHandoffService = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl });

  const preflightOk = async () => ({ ready: true, mutated: false });
  const adapters = {
    verifyAuthorization: preflightOk, verifyWindowsSource: preflightOk, verifyProviderBuild: preflightOk,
    verifyTargetIsolation: preflightOk, verifyBackups: preflightOk, verifyCostCeiling: preflightOk,
    activateWindowsWriteFence: async () => ({ fenceId, ready: true }),
    captureFinalSnapshot: async () => snapshot,
    exportFinalPackage: async () => ({ packageDigest: snapshot.packageDigest }),
    transferSnapshot: async () => ({ receiptId: "synthetic-receipt", packageDigest: snapshot.packageDigest }),
    async importProviderCanonicalState({ input }) {
      await preparationStore.declare({ migrationOperationId: input.migrationOperationId, authorizationFingerprint: input.authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, targetDatabase: target.databaseName });
      await preparationStore.recordImportSucceeded({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, collectionCounts: { goals: 1 }, importDigest: digest("d") });
      await preparationStore.recordMediaSucceeded({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, objectCount: 1, byteLength: 10 });
      return { ready: true, records: 1 };
    },
    async verifyProviderParity({ input }) {
      await preparationStore.recordParityPassed({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, readSurfaceCount: 11 });
      return { ready: true };
    },
    async acknowledgeProviderPrepared({ input }) {
      const ack = { migrationOperationId: input.migrationOperationId, authorizationFingerprint: input.authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, providerDeploymentId };
      await preparationStore.recordPreparedAcknowledged({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, providerDeploymentId });
      return ack;
    },
    transferAuthorityAndRoute: handoffService.transferAuthorityAndRoute,
    verifyPostHandoff: async () => ({ ready: true }),
    restoreWindowsAuthority: async () => ({ ready: true }),
    enterProviderRecovery: async () => ({ ready: true }),
  };

  const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore, adapters });
  return { fixture, authorityStore, handoffReceiptStore, orchestrator, workerHandoffService, workerControl };
}

function executeInput(overrides = {}) {
  return {
    productionAuthorization: true,
    migrationOperationId: OPERATION_ID,
    authorizationFingerprint,
    commandPrefix: OPERATION_ID,
    routingTarget,
    expectedRuntimeSha256: snapshot.runtimeSha256,
    expectedRuntimeRevision: snapshot.runtimeRevision,
    providerSource,
    target,
    ...overrides,
  };
}

async function initialize(fixture) {
  return initializeCombinedCutoverAuthority({ pool: fixture.pool, environment: ENVIRONMENT, windowsSource, now: new Date("2026-08-21T00:00:00.000Z").toISOString() });
}

async function crossFirstWriteBoundary(fixture, authorityStore, commandId) {
  const client = await fixture.pool.connect();
  try {
    await client.query("BEGIN");
    await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId: OPERATION_ID, commandId });
    const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
    await records.put({ ownerUserId: "integration-owner", collection: "migrationMarkers", recordId: "first", payload: { id: "first", userId: "integration-owner", status: "accepted", version: 1 } });
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

describe("integration — the full documented L -> M -> N/O sequence", () => {
  it("worker handoff succeeds only after real authority transfer (L) and a real first-write boundary (M)", async () => {
    const { fixture, authorityStore, orchestrator, workerHandoffService, workerControl } = harness();
    await initialize(fixture);
    const result = await orchestrator.execute(executeInput());
    expect(result.state.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(result.state.firstProviderCanonicalWriteAt).toBeNull(); // L done, M not yet

    // Attempting worker handoff before M is refused.
    await expect(workerHandoffService.activateProviderWorkersAndRetireWindows({ input: executeInput() })).rejects.toMatchObject({ code: "WORKER_HANDOFF_BOUNDARY_NOT_YET_CROSSED" });

    await crossFirstWriteBoundary(fixture, authorityStore, "integration:worker-first-write");
    const afterWrite = (await authorityStore.read()).state;
    expect(afterWrite.firstProviderCanonicalWriteAt).not.toBeNull();

    const handoff = await workerHandoffService.activateProviderWorkersAndRetireWindows({ input: executeInput() });
    expect(handoff).toMatchObject({ ready: true, outcome: "activated" });
    expect(workerControl.currentWorkerState()).toBe(WorkerState.PROVIDER_ACTIVE);

    // Worker activation itself never touched firstProviderCanonicalWriteAt or authority version.
    const final = (await authorityStore.read()).state;
    expect(final.firstProviderCanonicalWriteAt).toBe(afterWrite.firstProviderCanonicalWriteAt);
    expect(final.version).toBe(afterWrite.version);
  });

  it("no dual worker authority across the whole L -> M -> N/O timeline: workerAuthority is a single value throughout", async () => {
    const { fixture, authorityStore, orchestrator, workerHandoffService } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());
    await crossFirstWriteBoundary(fixture, authorityStore, "integration:worker-dual-authority");
    await workerHandoffService.activateProviderWorkersAndRetireWindows({ input: executeInput() });

    const auditRows = fixture.committedAuditRows(ENVIRONMENT);
    for (const row of auditRows) {
      // workerAuthority is always exactly one of windows/paused/provider on every recorded state -
      // CombinedRuntimeAuthorityState's own shape guarantees this is never a compound/dual value.
      expect(["windows", "paused", "provider"]).toContain(row.state.workerAuthority);
    }
    const final = (await authorityStore.read()).state;
    expect(final.workerAuthority).toBe("provider");
  });

  it("durable worker evidence identifies the operation, deployment, and activation/verification/retirement status", async () => {
    const { fixture, authorityStore, orchestrator, handoffReceiptStore, workerHandoffService } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());
    await crossFirstWriteBoundary(fixture, authorityStore, "integration:worker-evidence");
    await workerHandoffService.activateProviderWorkersAndRetireWindows({ input: executeInput() });

    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.operationId).toBe(OPERATION_ID);
    expect(receipt.providerDeploymentId).toBe(providerDeploymentId);
    expect(receipt.workerActivationStatus).toBe("verified");
    expect(receipt.workerActivatedAt).not.toBeNull();
    expect(receipt.workerVerifiedAt).not.toBeNull();
    expect(receipt.windowsWorkerRetirementStatus).toBe("retired");
    expect(receipt.windowsWorkerRetiredAt).not.toBeNull();
  });
});
