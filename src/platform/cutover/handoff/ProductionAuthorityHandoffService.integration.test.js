// Integration-style proof: the REAL CombinedAppPlatformCutoverOrchestrator, the REAL
// CombinedRuntimeAuthorityState machine, the REAL PostgresCombinedRuntimeAuthorityStore (against the
// transaction-faithful fixture), the REAL Phase 4 preparation receipt store, and the REAL Phase 5
// ProductionAuthorityHandoffService + handoff receipt store + routing-control contract, driven
// together exactly as they would run in production. Every OTHER adapter (the six preflights, Windows
// fence/snapshot/export, transfer, import, parity, acknowledge, verifyPostHandoff,
// restoreWindowsAuthority, enterProviderRecovery) is a minimal stub, matching the pattern the
// existing Phase 2B synthetic rehearsal already established for out-of-scope responsibilities - this
// file does not duplicate any authority state transition in a test helper; every transition is
// driven through the real orchestrator/store.
import { describe, expect, it } from "vitest";
import { createCombinedAppPlatformCutoverOrchestrator } from "../CombinedAppPlatformCutoverOrchestrator.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { initializeCombinedCutoverAuthority } from "../CombinedCutoverAuthorityInitializer.js";
import { createTransactionalPostgresFixture } from "../../database/testing/transactionalPostgresFixture.js";
import { createPhase4CanonicalRecordStore } from "../../database/Phase4CanonicalRecordStore.js";
import { RuntimeAuthority, RuntimeAuthorityAction } from "../CombinedRuntimeAuthorityState.js";
import { inspectCombinedCutoverRecovery } from "../syntheticCombinedCutoverRehearsal.js";
import { createPostgresCombinedCutoverPreparationStore } from "../preparation/PostgresCombinedCutoverPreparationStore.js";
import { createFakePreparationPool } from "../preparation/testSupport/fakePreparationPool.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "./PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "./testSupport/fakeHandoffReceiptPool.js";
import { createProductionAuthorityHandoffService } from "./ProductionAuthorityHandoffService.js";
import { createDeterministicCombinedCutoverRoutingControl } from "../routing/testSupport/deterministicRoutingControl.js";

const ENVIRONMENT = "combined-cutover-integration-test";
const OPERATION_ID = "combined-op-integration-0001";
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

function harness({ routing = createDeterministicCombinedCutoverRoutingControl(), seedPreparationEvidence = true } = {}) {
  const fixture = createTransactionalPostgresFixture();
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment: ENVIRONMENT });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool: createFakePreparationPool() });
  const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
  const handoffService = createProductionAuthorityHandoffService({ authorityStore, preparationStore, handoffReceiptStore, routingControl: routing });

  const preflightOk = async () => ({ ready: true, mutated: false });

  const adapters = {
    verifyAuthorization: preflightOk, verifyWindowsSource: preflightOk, verifyProviderBuild: preflightOk,
    verifyTargetIsolation: preflightOk, verifyBackups: preflightOk, verifyCostCeiling: preflightOk,
    activateWindowsWriteFence: async () => ({ fenceId, ready: true }),
    captureFinalSnapshot: async () => snapshot,
    exportFinalPackage: async () => ({ packageDigest: snapshot.packageDigest }),
    transferSnapshot: async () => ({ receiptId: "synthetic-receipt", packageDigest: snapshot.packageDigest }),
    async importProviderCanonicalState({ input }) {
      if (!seedPreparationEvidence) return { ready: true, records: 0 };
      await preparationStore.declare({ migrationOperationId: input.migrationOperationId, authorizationFingerprint: input.authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, targetDatabase: target.databaseName });
      await preparationStore.recordImportSucceeded({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, collectionCounts: { goals: 1 }, importDigest: digest("d") });
      await preparationStore.recordMediaSucceeded({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, objectCount: 1, byteLength: 10 });
      return { ready: true, records: 1 };
    },
    async verifyProviderParity({ input }) {
      if (seedPreparationEvidence) {
        await preparationStore.recordParityPassed({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, readSurfaceCount: 11 });
      }
      return { ready: true };
    },
    async acknowledgeProviderPrepared({ input }) {
      const ack = { migrationOperationId: input.migrationOperationId, authorizationFingerprint: input.authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, providerDeploymentId };
      if (seedPreparationEvidence) {
        await preparationStore.recordPreparedAcknowledged({ migrationOperationId: input.migrationOperationId, expectedPackageDigest: snapshot.packageDigest, providerDeploymentId });
      }
      return ack;
    },
    transferAuthorityAndRoute: handoffService.transferAuthorityAndRoute, // the REAL production adapter under test
    async verifyPostHandoff({ state }) { return { ready: state.authority === RuntimeAuthority.PROVIDER }; },
    async restoreWindowsAuthority() { return { ready: true }; }, // out of scope for Phase 5; minimal stub
    async enterProviderRecovery() { return { ready: true }; }, // out of scope for Phase 5; minimal stub
  };

  const orchestrator = createCombinedAppPlatformCutoverOrchestrator({ authorityStore, adapters });

  return { fixture, authorityStore, preparationStore, handoffReceiptStore, routing, orchestrator };
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

describe("integration — successful handoff through the real orchestrator", () => {
  it("a valid provider-prepared operation transfers to provider-authoritative exactly once, with firstProviderCanonicalWriteAt still null", async () => {
    const { fixture, authorityStore, orchestrator } = harness();
    await initialize(fixture);
    const result = await orchestrator.execute(executeInput());

    expect(result.classification).toBe("COMPLETED");
    expect(result.state.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(result.state.publicRuntimeAuthority).toBe("provider");
    expect(result.state.firstProviderCanonicalWriteAt).toBeNull();

    const inspection = inspectCombinedCutoverRecovery(result.state);
    expect(inspection.classification).toBe("PRE_BOUNDARY_CUTOVER_IN_PROGRESS"); // provider-authoritative, no write yet
    expect(inspection.rollbackLegal).toBe(true);
    expect(inspection.forwardRecoveryRequired).toBe(false);

    const final = (await authorityStore.read()).state;
    expect(final.authority).toBe(RuntimeAuthority.PROVIDER);
  });

  it("the canonical provider write boundary remains a wholly separate, later action - claiming it now is what actually sets firstProviderCanonicalWriteAt", async () => {
    const { fixture, authorityStore, orchestrator } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());
    expect((await authorityStore.read()).state.firstProviderCanonicalWriteAt).toBeNull();

    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId: OPERATION_ID, commandId: "integration:first-write" });
      const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
      await records.put({ ownerUserId: "integration-owner", collection: "migrationMarkers", recordId: "first", payload: { id: "first", userId: "integration-owner", status: "accepted", version: 1 } });
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const afterWrite = (await authorityStore.read()).state;
    expect(afterWrite.firstProviderCanonicalWriteAt).not.toBeNull();
    const inspection = inspectCombinedCutoverRecovery(afterWrite);
    expect(inspection.classification).toBe("FORWARD_REPAIR_REQUIRED");
    expect(inspection.rollbackLegal).toBe(false);
  });
});

describe("integration — precondition failures block transfer before any authority mutation", () => {
  it("preparation evidence mismatch blocks transfer and the orchestrator restores Windows authority", async () => {
    const { fixture, authorityStore, orchestrator } = harness({ seedPreparationEvidence: false });
    await initialize(fixture);
    await expect(orchestrator.execute(executeInput())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "ABORTED_TO_WINDOWS", automaticWindowsRollback: true }),
    });
    const final = (await authorityStore.read()).state;
    expect(final.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(final.firstProviderCanonicalWriteAt).toBeNull();
  });

  it("wrong authority state blocks transfer (direct adapter call against a not-yet-prepared authority row)", async () => {
    const { fixture, authorityStore, handoffReceiptStore, preparationStore } = harness();
    await initialize(fixture);
    const service = createProductionAuthorityHandoffService({
      authorityStore, preparationStore, handoffReceiptStore, routingControl: createDeterministicCombinedCutoverRoutingControl(),
    });
    const state = (await authorityStore.read()).state; // still windows-legacy-authoritative
    const acknowledgement = { migrationOperationId: OPERATION_ID, authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, providerDeploymentId };
    await expect(service.transferAuthorityAndRoute({
      input: { migrationOperationId: OPERATION_ID, authorizationFingerprint, routingTarget, commandPrefix: OPERATION_ID },
      state, acknowledgement, commitAuthority: async () => { throw new Error("must not be called"); },
    })).rejects.toMatchObject({ code: "HANDOFF_AUTHORITY_STATE_REJECTED" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
  });

  it("wrong operation blocks transfer even against a genuinely provider-prepared authority row for a different operation", async () => {
    const { fixture, authorityStore, handoffReceiptStore, preparationStore, orchestrator } = harness();
    await initialize(fixture);
    // Drive the real orchestrator preflight far enough to reach provider-prepared for OPERATION_ID...
    // simpler: directly advance the real state machine to provider-prepared for OPERATION_ID via the
    // store, then call the service with a mismatched operationId in `input`.
    const begun = await authorityStore.transition({
      action: RuntimeAuthorityAction.BEGIN_CUTOVER, expectedVersion: (await authorityStore.read()).state.version,
      migrationOperationId: OPERATION_ID, authorizationFingerprint, fenceId, finalSnapshot: snapshot,
      providerSource, target, routingTarget, commandId: `${OPERATION_ID}:begin`, reason: "test fixture",
    });
    const acknowledgement = { migrationOperationId: OPERATION_ID, authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, providerDeploymentId };
    const prepared = await authorityStore.transition({
      action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, expectedVersion: begun.state.version,
      migrationOperationId: OPERATION_ID, authorizationFingerprint, providerAcknowledgement: acknowledgement,
      commandId: `${OPERATION_ID}:ack`, reason: "test fixture",
    });

    const service = createProductionAuthorityHandoffService({ authorityStore, preparationStore, handoffReceiptStore, routingControl: createDeterministicCombinedCutoverRoutingControl() });
    await expect(service.transferAuthorityAndRoute({
      input: { migrationOperationId: "combined-op-a-completely-different-operation", authorizationFingerprint, routingTarget, commandPrefix: "other" },
      state: prepared.state, acknowledgement, commitAuthority: async () => { throw new Error("must not be called"); },
    })).rejects.toThrow();
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER_PREPARED);
  });

  it("wrong public-runtime state blocks transfer (defense in depth beyond the authority enum check alone)", async () => {
    const { fixture, authorityStore, handoffReceiptStore, preparationStore } = harness();
    await initialize(fixture);
    const begun = await authorityStore.transition({
      action: RuntimeAuthorityAction.BEGIN_CUTOVER, expectedVersion: (await authorityStore.read()).state.version,
      migrationOperationId: OPERATION_ID, authorizationFingerprint, fenceId, finalSnapshot: snapshot,
      providerSource, target, routingTarget, commandId: `${OPERATION_ID}:begin2`, reason: "test fixture",
    });
    const acknowledgement = { migrationOperationId: OPERATION_ID, authorizationFingerprint, fenceId, packageDigest: snapshot.packageDigest, providerDeploymentId };
    const prepared = await authorityStore.transition({
      action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER, expectedVersion: begun.state.version,
      migrationOperationId: OPERATION_ID, authorizationFingerprint, providerAcknowledgement: acknowledgement,
      commandId: `${OPERATION_ID}:ack2`, reason: "test fixture",
    });
    // Deliberately corrupted, structurally provider-prepared-shaped state with public runtime
    // already claiming "provider" - simulates a caller passing an inconsistent snapshot; this
    // module's own defense-in-depth check must reject it independently of the enum check above.
    const corrupted = { ...prepared.state, publicRuntimeAuthority: "provider" };

    const service = createProductionAuthorityHandoffService({ authorityStore, preparationStore, handoffReceiptStore, routingControl: createDeterministicCombinedCutoverRoutingControl() });
    await expect(service.transferAuthorityAndRoute({
      input: { migrationOperationId: OPERATION_ID, authorizationFingerprint, routingTarget, commandPrefix: OPERATION_ID },
      state: corrupted, acknowledgement, commitAuthority: async () => { throw new Error("must not be called"); },
    })).rejects.toMatchObject({ code: "HANDOFF_AUTHORITY_STATE_REJECTED" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER_PREPARED);
  });
});

describe("integration — routing failure classification and post-transfer/pre-write recovery", () => {
  it("routing activation failure after authority commits is recovered by the orchestrator's existing Windows-rollback path (firstProviderCanonicalWriteAt still null)", async () => {
    const failingRouting = createDeterministicCombinedCutoverRoutingControl({ failActivateWith: new Error("activation boom") });
    const { fixture, authorityStore, handoffReceiptStore, orchestrator } = harness({ routing: failingRouting });
    await initialize(fixture);

    await expect(orchestrator.execute(executeInput())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "ABORTED_TO_WINDOWS", automaticWindowsRollback: true }),
    });

    const final = (await authorityStore.read()).state;
    expect(final.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(final.firstProviderCanonicalWriteAt).toBeNull();

    // Durable handoff evidence still honestly shows authority committed and routing failed, even
    // though the orchestrator subsequently reverted Windows authority via ABORT_TO_WINDOWS - this is
    // exactly the ambiguity window the governing document describes, resolved safely because no
    // provider write ever landed.
    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.authorityStatus).toBe("committed");
    expect(receipt.routingStatus).toBe("failed");
  });

  it("routing verification ambiguity after activation is recoverable per source semantics: rollback remains legal because no write landed", async () => {
    const ambiguousRouting = createDeterministicCombinedCutoverRoutingControl({ failVerifyWith: new Error("verify boom") });
    const { fixture, authorityStore, handoffReceiptStore, orchestrator } = harness({ routing: ambiguousRouting });
    await initialize(fixture);

    await expect(orchestrator.execute(executeInput())).rejects.toMatchObject({
      combinedCutoverRecovery: expect.objectContaining({ classification: "ABORTED_TO_WINDOWS" }),
    });

    const { receipt } = await handoffReceiptStore.read(OPERATION_ID);
    expect(receipt.authorityStatus).toBe("committed");
    expect(receipt.routingStatus).toBe("activated"); // never silently downgraded to "failed"

    const final = (await authorityStore.read()).state;
    const inspection = inspectCombinedCutoverRecovery(final);
    expect(inspection.rollbackLegal).toBe(true);
    expect(inspection.forwardRecoveryRequired).toBe(false);
  });
});

describe("integration — no dual authority, ever, at any recorded transition", () => {
  it("Windows and provider public/canonical authority are never simultaneously active across the whole run", async () => {
    const { fixture, authorityStore, orchestrator } = harness();
    await initialize(fixture);
    const initial = (await authorityStore.read()).state;
    expect(initial.publicRuntimeAuthority).toBe("windows");
    expect(initial.writesEnabled).toBe(true);

    const result = await orchestrator.execute(executeInput());
    expect(result.state.publicRuntimeAuthority).toBe("provider");
    expect(result.state.writesEnabled).toBe(true);

    // At no point does the audit trail show both windows and provider holding writesEnabled
    // simultaneously - every intermediate state along BEGIN_CUTOVER/ACKNOWLEDGE_PROVIDER had
    // writesEnabled=false, and only TRANSFER_TO_PROVIDER's resulting state enables writes, and it
    // enables them for the provider only (publicRuntimeAuthority='provider' is asserted by
    // CombinedRuntimeAuthorityState's own validator alongside writesEnabled=true in that same state).
    const auditRows = fixture.committedAuditRows(ENVIRONMENT);
    const dualAuthorityRows = auditRows.filter((row) => row.state.writesEnabled === true && row.state.publicRuntimeAuthority !== row.state.migrationControlAuthority);
    expect(dualAuthorityRows).toHaveLength(0);
  });
});

describe("integration — post-first-write recovery forbids Windows rollback", () => {
  it("after firstProviderCanonicalWriteAt is set, ABORT_TO_WINDOWS is rejected by the real state machine", async () => {
    const { fixture, authorityStore, orchestrator } = harness();
    await initialize(fixture);
    await orchestrator.execute(executeInput());

    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId: OPERATION_ID, commandId: "integration:first-write-2" });
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const afterWrite = (await authorityStore.read()).state;
    await expect(authorityStore.transition({
      action: RuntimeAuthorityAction.ABORT_TO_WINDOWS, expectedVersion: afterWrite.version,
      migrationOperationId: OPERATION_ID, authorizationFingerprint, commandId: "integration:illegal-rollback",
      reason: "attempted stale rollback",
    })).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_TRANSITION_REJECTED" });

    const unchanged = (await authorityStore.read()).state;
    expect(unchanged.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(unchanged.firstProviderCanonicalWriteAt).not.toBeNull();
  });
});
