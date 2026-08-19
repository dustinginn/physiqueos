// Integration-style proof for the Phase 6A post-handoff recovery trio: the REAL
// CombinedAppPlatformCutoverOrchestrator, the REAL CombinedRuntimeAuthorityState machine, the REAL
// PostgresCombinedRuntimeAuthorityStore (against the transaction-faithful fixture), the REAL Phase 4
// preparation store, the REAL Phase 5 ProductionAuthorityHandoffService + handoff receipt store, AND
// NOW the REAL Phase 6A verifyPostHandoff / restoreWindowsAuthority / enterProviderRecovery services,
// all plugged into the orchestrator together exactly as they would run in production. Only the six
// preflights and Windows fence/snapshot/export/transfer/import/parity/acknowledge remain minimal
// stubs (out of scope for this task). No authority transition is duplicated in a test helper - every
// transition is driven through the real orchestrator/store/services.
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
import { RouteState } from "../routing/combinedCutoverRoutingControl.js";
import { createProductionPostHandoffVerificationService } from "./ProductionPostHandoffVerificationService.js";
import { createProductionWindowsAuthorityRestorationService } from "./ProductionWindowsAuthorityRestorationService.js";
import { createProductionProviderForwardRecoveryService } from "./ProductionProviderForwardRecoveryService.js";

const ENVIRONMENT = "combined-cutover-recovery-integration-test";
const OPERATION_ID = "combined-op-recovery-0001";
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

function harness({ routing = createDeterministicCombinedCutoverRoutingControl() } = {}) {
  const fixture = createTransactionalPostgresFixture();
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment: ENVIRONMENT });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
  const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
  const handoffService = createProductionAuthorityHandoffService({ authorityStore, preparationStore, handoffReceiptStore, routingControl: routing });
  const verificationService = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });
  const restorationService = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl: routing });
  const forwardRecoveryService = createProductionProviderForwardRecoveryService({ authorityStore });

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
    transferAuthorityAndRoute: handoffService.transferAuthorityAndRoute, // Phase 5, real
    verifyPostHandoff: verificationService.verifyPostHandoff, // Phase 6A, real
    restoreWindowsAuthority: restorationService.restoreWindowsAuthority, // Phase 6A, real
    enterProviderRecovery: forwardRecoveryService.enterProviderRecovery, // Phase 6A, real
  };

  const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore, adapters });
  return { fixture, authorityStore, preparationStore, handoffReceiptStore, routing, orchestrator, verificationService, restorationService, forwardRecoveryService };
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
  return initializeCombinedCutoverAuthority({ pool: fixture.pool, environment: ENVIRONMENT, windowsSource, now: new Date("2026-08-19T00:00:00.000Z").toISOString() });
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

describe("integration — verifyPostHandoff independently confirms durable post-handoff state", () => {
  it("reports pre-write success right after handoff, then reflects the first-write boundary once it is crossed - all from durable evidence", async () => {
    const { fixture, authorityStore, orchestrator, verificationService } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());

    const preWrite = await verificationService.verifyPostHandoff({ input: executeInput() });
    expect(preWrite).toMatchObject({ ready: true, classification: "PROVIDER_HANDED_OFF_PRE_WRITE", authority: RuntimeAuthority.PROVIDER });
    expect(preWrite.firstProviderCanonicalWriteAt).toBeNull();

    await crossFirstWriteBoundary(fixture, authorityStore, "integration:first-write-verify");

    const postWrite = await verificationService.verifyPostHandoff({ input: executeInput() });
    expect(postWrite).toMatchObject({ ready: true, classification: "FIRST_WRITE_BOUNDARY_CROSSED" });
    expect(postWrite.firstProviderCanonicalWriteAt).not.toBeNull();
  });
});

describe("integration — a pre-boundary routing failure returns to Windows through the real restoreWindowsAuthority", () => {
  it("a routing-verification ambiguity (route genuinely activated) is recovered with an actual routing restoration back to Windows", async () => {
    const ambiguousRouting = createDeterministicCombinedCutoverRoutingControl({ failVerifyWith: new Error("verify boom") });
    const { fixture, authorityStore, handoffReceiptStore, orchestrator, routing } = harness({ routing: ambiguousRouting });
    await initialize(fixture);

    await expect(orchestrator.execute(executeInput())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "ABORTED_TO_WINDOWS", automaticWindowsRollback: true }),
    });

    const final = (await authorityStore.read()).state;
    expect(final.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(final.firstProviderCanonicalWriteAt).toBeNull();

    // The real restoreWindowsAuthority - plugged in as the orchestrator's own adapter - actually
    // called routingControl.restoreWindowsRoute, because durable handoff evidence showed routing had
    // genuinely activated (never downgraded to "failed" by the handoff service itself).
    expect(routing.inspectCalls().map((call) => call.op)).toContain("restore");
    expect(routing.currentRouteState()).toBe(RouteState.WINDOWS_ACTIVE);

    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.routingStatus).toBe("activated");
    expect(receipt.windowsRoutingRestoreStatus).toBe("restored");
  });

  it("a routing-activation failure (route never actually went live) returns to Windows without attempting a routing restoration", async () => {
    const failingRouting = createDeterministicCombinedCutoverRoutingControl({ failActivateWith: new Error("activation boom") });
    const { fixture, authorityStore, handoffReceiptStore, orchestrator, routing } = harness({ routing: failingRouting });
    await initialize(fixture);

    await expect(orchestrator.execute(executeInput())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "ABORTED_TO_WINDOWS" }),
    });

    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.routingStatus).toBe("failed");
    expect(receipt.windowsRoutingRestoreStatus).toBeNull(); // nothing to restore - the route never activated
    expect(routing.inspectCalls().map((call) => call.op)).not.toContain("restore");
  });
});

describe("integration — post-first-write recovery: durable authority alone decides, never a local mirror", () => {
  it("after a hard crash immediately following the provider first-write COMMIT, restoreWindowsAuthority refuses and enterProviderRecovery succeeds", async () => {
    const { fixture, authorityStore, orchestrator, restorationService, forwardRecoveryService } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());
    await crossFirstWriteBoundary(fixture, authorityStore, "integration:first-write-hard-crash");

    // A hypothetical local migration-control mirror that a real deployment might maintain, left null by
    // a hard crash before it could be updated. Neither service below accepts or reads any such
    // value - both decide solely from durable `combined_runtime_authority`, which is the whole point
    // of this proof (see combinedCutoverRecoveryDecision.js's header comment).
    const staleLocalMirror = Object.freeze({ firstPostgresWriteAt: null });
    expect(staleLocalMirror.firstPostgresWriteAt).toBeNull(); // documents the premise; never passed below

    await expect(restorationService.restoreWindowsAuthority({ input: executeInput() })).rejects.toMatchObject({ code: "RECOVERY_ROLLBACK_ILLEGAL" });

    const forward = await forwardRecoveryService.enterProviderRecovery({ input: executeInput() });
    expect(forward).toMatchObject({ ready: true, classification: "FORWARD_REPAIR_REQUIRED", authority: RuntimeAuthority.RECOVERY_REQUIRED });

    const final = (await authorityStore.read()).state;
    expect(final.authority).toBe(RuntimeAuthority.RECOVERY_REQUIRED);
    expect(final.firstProviderCanonicalWriteAt).not.toBeNull();
    expect(final.writesEnabled).toBe(false);
  });
});

describe("integration — provider forward recovery is operation-bound and durable", () => {
  it("rejects a forward-recovery attempt for a different operation, and durably records the correct owning operation once run", async () => {
    const { fixture, authorityStore, orchestrator, forwardRecoveryService } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());
    await crossFirstWriteBoundary(fixture, authorityStore, "integration:first-write-operation-bound");

    await expect(forwardRecoveryService.enterProviderRecovery({ input: { migrationOperationId: "combined-op-a-completely-different-operation" } }))
      .rejects.toMatchObject({ code: "RECOVERY_CONFLICTING_OPERATION" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER); // untouched by the rejected attempt

    await forwardRecoveryService.enterProviderRecovery({ input: executeInput() });
    const recoveryRow = fixture.committedAuditRows(ENVIRONMENT).find((row) => row.action === "require-provider-recovery");
    expect(recoveryRow).toBeDefined();
    expect(recoveryRow.migrationOperationId).toBe(OPERATION_ID);
  });
});

describe("integration — no dual canonical-write authority, ever, across handoff and recovery", () => {
  it("no recorded transition across a full handoff-then-rollback run shows dual public/migration-control authority", async () => {
    const ambiguousRouting = createDeterministicCombinedCutoverRoutingControl({ failVerifyWith: new Error("verify boom") });
    const { fixture, orchestrator } = harness({ routing: ambiguousRouting });
    await initialize(fixture);
    await expect(orchestrator.execute(executeInput())).rejects.toThrow();

    const auditRows = fixture.committedAuditRows(ENVIRONMENT);
    const dualAuthorityRows = auditRows.filter((row) => row.state.writesEnabled === true && row.state.publicRuntimeAuthority !== row.state.migrationControlAuthority);
    expect(dualAuthorityRows).toHaveLength(0);
  });

  it("no recorded transition across a full handoff-then-forward-recovery run shows dual public/migration-control authority", async () => {
    const { fixture, authorityStore, orchestrator, forwardRecoveryService } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());
    await crossFirstWriteBoundary(fixture, authorityStore, "integration:first-write-dual-authority");
    await forwardRecoveryService.enterProviderRecovery({ input: executeInput() });

    const auditRows = fixture.committedAuditRows(ENVIRONMENT);
    const dualAuthorityRows = auditRows.filter((row) => row.state.writesEnabled === true && row.state.publicRuntimeAuthority !== row.state.migrationControlAuthority);
    expect(dualAuthorityRows).toHaveLength(0);
  });
});
