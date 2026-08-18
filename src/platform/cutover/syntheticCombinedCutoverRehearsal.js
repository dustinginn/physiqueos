// SYNTHETIC / NON-PRODUCTION combined App Platform + persistence cutover rehearsal.
//
// This harness drives the REAL createCombinedAppPlatformCutoverOrchestrator, the REAL
// CombinedRuntimeAuthorityState machine, the REAL PostgresCombinedRuntimeAuthorityStore, the REAL
// CombinedCutoverAuthorityInitializer, and the REAL claimCanonicalWriteBoundary transaction path
// against the transaction-faithful fixture from Phase 2A. Only external effects - Windows fencing,
// packaging, transfer, provider import, media, routing, workers, access gate - are synthetic.
//
// It never reads private/founder data, never opens a network connection, and cannot be pointed at
// production: it accepts no connection string, no credentials, and no Founder paths.
//
// ARCHITECTURAL NOTE ON THE BOUNDARY. The orchestrator has no first-provider-write stage. Per
// docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase M, the irreversible boundary is
// crossed when "the first real canonical production command accepted through the provider
// application is committed with the first-write marker" - which is why claimCanonicalWriteBoundary
// lives in the repository facade, not in the orchestrator. The rehearsal therefore drives the
// orchestrator through phase L (authority + routing handoff) and then crosses the boundary
// separately through the real authority-protected canonical write path.

import { createCombinedAppPlatformCutoverOrchestrator } from "./CombinedAppPlatformCutoverOrchestrator.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "./PostgresCombinedRuntimeAuthorityStore.js";
import { initializeCombinedCutoverAuthority } from "./CombinedCutoverAuthorityInitializer.js";
import { createTransactionalPostgresFixture } from "../database/testing/transactionalPostgresFixture.js";
import { createPhase4CanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { RuntimeAuthority } from "./CombinedRuntimeAuthorityState.js";

export const REHEARSAL_ENVIRONMENT = "synthetic-combined-cutover";
export const REHEARSAL_OWNER_ID = "synthetic-founder";
const PRE_WRITE_BUDGET_MS = 10 * 60_000;

// Source-derived stage names: the six PREFLIGHTS plus each effect adapter, plus the boundary
// stages that occur outside the orchestrator.
export const REHEARSAL_STAGES = Object.freeze([
  "verifyAuthorization", "verifyWindowsSource", "verifyProviderBuild",
  "verifyTargetIsolation", "verifyBackups", "verifyCostCeiling",
  "activateWindowsWriteFence", "captureFinalSnapshot", "exportFinalPackage",
  "transferSnapshot", "importProviderCanonicalState", "verifyProviderParity",
  "acknowledgeProviderPrepared", "beforeTransferAuthority", "transferAuthorityAndRoute",
  "afterTransferAuthority", "routingHandoff", "workerHandoff", "verifyPostHandoff",
  "beforeBoundaryClaim", "afterBoundaryClaimBeforeMutation", "afterMutationBeforeCommit",
  "afterBoundaryCommit",
]);

const SYNTHETIC_PACKAGE = Object.freeze({
  collections: { migrationMarkers: [] },
  records: 3,
  mediaObjects: [
    Object.freeze({ objectId: "synthetic-media-1", version: "v1", bytes: 11, sha256: "1".repeat(64) }),
    Object.freeze({ objectId: "synthetic-media-2", version: "v1", bytes: 13, sha256: "2".repeat(64) }),
  ],
});

export function createSyntheticCombinedCutoverRehearsal({
  failAt = null,
  failWith = null,
  clock = createDeterministicClock(),
  migrationOperationId = "synthetic-cutover-0001",
  // Advances the deterministic clock when a named stage is reached, so budget exhaustion can be
  // exercised at a precise point inside the run rather than before it starts.
  advanceAtStage = null,
} = {}) {
  const fixture = createTransactionalPostgresFixture();
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment: REHEARSAL_ENVIRONMENT });
  const timeline = [];
  const world = {
    windows: { serving: true, writeFenced: false, canonicalWrites: true, route: "active" },
    provider: { serving: false, route: "prepared-not-active", worker: "inert", accessGate: "enforced", imported: null, media: [] },
    transferReceipts: new Map(),
  };

  function record(stage, detail = {}) {
    timeline.push({ stage, atMs: clock.now().getTime(), ...detail });
  }

  function gate(stage) {
    if (advanceAtStage?.stage === stage) clock.advanceMs(advanceAtStage.ms);
    if (failAt !== stage) return;
    throw failWith ?? Object.assign(new Error(`Synthetic failure injected at ${stage}.`), { code: `SYNTHETIC_FAILURE_${stage}` });
  }

  const authorizationFingerprint = "a".repeat(64);
  const fenceId = "synthetic-fence-0001";
  const providerSource = { commit: "9".repeat(40), buildId: "synthetic-provider-build" };
  const windowsSource = { commit: "1".repeat(40), buildId: "synthetic-windows-build" };
  const target = {
    databaseClusterId: "synthetic-cluster",
    databaseName: "physiqueos_phase5_test_provider_20260811",
    spacesBucket: "synthetic-space",
  };
  const snapshot = {
    runtimeSha256: "c".repeat(64),
    runtimeRevision: 140,
    mediaInventorySha256: "d".repeat(64),
    migrationControlSha256: "e".repeat(64),
    packageDigest: "f".repeat(64),
  };

  function preflight(name) {
    return async () => { gate(name); record(name); return { ready: true, mutated: false }; };
  }

  const adapters = {
    verifyAuthorization: preflight("verifyAuthorization"),
    verifyWindowsSource: preflight("verifyWindowsSource"),
    verifyProviderBuild: preflight("verifyProviderBuild"),
    verifyTargetIsolation: preflight("verifyTargetIsolation"),
    verifyBackups: preflight("verifyBackups"),
    verifyCostCeiling: preflight("verifyCostCeiling"),

    async activateWindowsWriteFence() {
      gate("activateWindowsWriteFence");
      world.windows.writeFenced = true;
      world.windows.canonicalWrites = false;
      record("activateWindowsWriteFence", { windowsCanonicalWrites: false });
      return { fenceId, ready: true };
    },

    async captureFinalSnapshot() {
      gate("captureFinalSnapshot");
      record("captureFinalSnapshot", { packageDigest: snapshot.packageDigest });
      return snapshot;
    },

    async exportFinalPackage() {
      gate("exportFinalPackage");
      record("exportFinalPackage", { records: SYNTHETIC_PACKAGE.records });
      return { packageDigest: snapshot.packageDigest, records: SYNTHETIC_PACKAGE.records };
    },

    // Digest-bound, idempotent synthetic transfer. The eventual production contract is an
    // authenticated provider endpoint receiving declared chunks; it must preserve exactly these
    // semantics: receipts keyed by (operation, package), bound to the package digest, idempotent
    // on identical redelivery, and rejecting a digest or operation mismatch. Transfer never
    // mutates provider authority.
    async transferSnapshot({ input, exported }) {
      gate("transferSnapshot");
      const receiptId = `${input.migrationOperationId}:${exported.packageDigest}`;
      const existing = world.transferReceipts.get(input.migrationOperationId);
      if (existing) {
        if (existing.packageDigest !== exported.packageDigest) {
          throw Object.assign(new Error("Transfer receipt digest mismatch."), { code: "SYNTHETIC_TRANSFER_DIGEST_MISMATCH" });
        }
        record("transferSnapshot", { receiptId, outcome: "idempotent-replay" });
        return { ...existing, outcome: "idempotent-replay" };
      }
      const receipt = { receiptId, migrationOperationId: input.migrationOperationId, packageDigest: exported.packageDigest, outcome: "received" };
      world.transferReceipts.set(input.migrationOperationId, receipt);
      record("transferSnapshot", { receiptId, outcome: "received" });
      return receipt;
    },

    async importProviderCanonicalState({ transfer }) {
      gate("importProviderCanonicalState");
      if (transfer.packageDigest !== snapshot.packageDigest) {
        throw Object.assign(new Error("Imported package digest does not match the transferred receipt."), { code: "SYNTHETIC_IMPORT_DIGEST_MISMATCH" });
      }
      // Imported data is readable but confers no authority.
      world.provider.imported = { packageDigest: transfer.packageDigest, records: SYNTHETIC_PACKAGE.records };
      world.provider.media = SYNTHETIC_PACKAGE.mediaObjects.map((item) => ({ ...item }));
      record("importProviderCanonicalState", { records: SYNTHETIC_PACKAGE.records, mediaObjects: world.provider.media.length });
      return { ready: true, records: SYNTHETIC_PACKAGE.records };
    },

    async verifyProviderParity() {
      gate("verifyProviderParity");
      const mediaOk = world.provider.media.length === SYNTHETIC_PACKAGE.mediaObjects.length;
      record("verifyProviderParity", { readParity: "pass", commandReadiness: "pass", mediaValidated: mediaOk });
      return { ready: mediaOk, readParity: "pass", commandReadiness: "pass" };
    },

    async acknowledgeProviderPrepared({ input }) {
      gate("acknowledgeProviderPrepared");
      record("acknowledgeProviderPrepared", { providerDeploymentId: "synthetic-deployment" });
      // Prepared is explicitly NOT authority: routing and serving stay with Windows here.
      return {
        migrationOperationId: input.migrationOperationId,
        authorizationFingerprint: input.authorizationFingerprint,
        fenceId,
        packageDigest: snapshot.packageDigest,
        providerDeploymentId: "synthetic-deployment",
      };
    },

    async transferAuthorityAndRoute({ commitAuthority }) {
      gate("beforeTransferAuthority");
      const state = await commitAuthority();
      gate("afterTransferAuthority");

      gate("routingHandoff");
      world.provider.route = "active";
      world.provider.serving = true;
      world.windows.route = "retired-recovery-evidence";
      world.windows.serving = false;
      world.provider.accessGate = "founder-enabled";
      record("routingHandoff", { providerRoute: "active", windowsRoute: "retired-recovery-evidence" });

      gate("workerHandoff");
      world.provider.worker = "active";
      record("workerHandoff", { providerWorker: "active" });

      return { ready: true, authority: state.authority };
    },

    async verifyPostHandoff({ state }) {
      gate("verifyPostHandoff");
      const ok = state.authority === RuntimeAuthority.PROVIDER
        && world.provider.serving === true
        && world.windows.canonicalWrites === false;
      record("verifyPostHandoff", { ready: ok });
      return { ready: ok };
    },

    async restoreWindowsAuthority() {
      // Pre-boundary recovery only: staged provider artifacts are discarded and Windows resumes.
      world.provider.imported = null;
      world.provider.media = [];
      world.provider.route = "prepared-not-active";
      world.provider.serving = false;
      world.provider.worker = "inert";
      world.provider.accessGate = "enforced";
      world.windows.route = "active";
      world.windows.serving = true;
      world.windows.writeFenced = false;
      world.windows.canonicalWrites = true;
      record("restoreWindowsAuthority", { windowsCanonicalWrites: true, providerStagedDataCleared: true });
      return { ready: true };
    },

    async enterProviderRecovery() {
      // Post-boundary: provider stays canonical, writes pause, Windows must NOT resume.
      world.provider.worker = "paused";
      world.windows.canonicalWrites = false;
      world.windows.serving = false;
      record("enterProviderRecovery", { providerRetainsCanonical: true, windowsCanonicalWrites: false });
      return { ready: true };
    },
  };

  const orchestrator = createCombinedAppPlatformCutoverOrchestrator({
    authorityStore,
    adapters,
    now: () => clock.now(),
    maximumPreWriteFenceMs: PRE_WRITE_BUDGET_MS,
  });

  return {
    fixture,
    authorityStore,
    world,
    clock,
    timeline: () => timeline.map((entry) => ({ ...entry })),
    identity: { migrationOperationId, authorizationFingerprint, fenceId, providerSource, target, windowsSource, snapshot },

    async initializeAuthority() {
      return initializeCombinedCutoverAuthority({
        pool: fixture.pool,
        environment: REHEARSAL_ENVIRONMENT,
        windowsSource,
        now: clock.now().toISOString(),
      });
    },

    async execute(overrides = {}) {
      return orchestrator.execute({
        productionAuthorization: true,
        migrationOperationId,
        authorizationFingerprint,
        commandPrefix: "synthetic-cutover",
        routingTarget: "synthetic-provider-ingress",
        expectedRuntimeSha256: snapshot.runtimeSha256,
        expectedRuntimeRevision: snapshot.runtimeRevision,
        providerSource,
        target,
        ...overrides,
      });
    },

    // Crosses the documented phase-M boundary through the REAL authority-protected transaction,
    // exactly as PostgresFounderRepositoryFacade does. firstProviderCanonicalWriteAt is never set
    // directly by this harness.
    async crossFirstWriteBoundary({ recordId = "synthetic-first-command", commandId = "synthetic:first-provider-command" } = {}) {
      const client = await fixture.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${REHEARSAL_OWNER_ID}`]);
        gate("beforeBoundaryClaim");
        await authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId });
        gate("afterBoundaryClaimBeforeMutation");
        const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
        const written = await records.put({
          ownerUserId: REHEARSAL_OWNER_ID,
          collection: "migrationMarkers",
          recordId,
          payload: { id: recordId, userId: REHEARSAL_OWNER_ID, status: "accepted", version: 1 },
        });
        gate("afterMutationBeforeCommit");
        await client.query("COMMIT");
        record("firstProviderCanonicalWrite", { recordId, commandId });
        gate("afterBoundaryCommit");
        return written;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async evidence({ classification = null, failureInjectedAt = failAt, error = null } = {}) {
      const state = fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
      const inspection = inspectCombinedCutoverRecovery(state);
      return Object.freeze({
        mode: "SYNTHETIC / NON-PRODUCTION",
        operationId: migrationOperationId,
        packageDigest: snapshot.packageDigest,
        transferReceiptId: world.transferReceipts.get(migrationOperationId)?.receiptId ?? null,
        finalAuthority: state?.authority ?? null,
        publicRuntimeAuthority: state?.publicRuntimeAuthority ?? null,
        firstProviderCanonicalWriteAt: state?.firstProviderCanonicalWriteAt ?? null,
        firstProviderCommandId: state?.firstProviderCommandId ?? null,
        rollbackLegal: inspection.rollbackLegal,
        forwardRecoveryRequired: inspection.forwardRecoveryRequired,
        windows: { ...world.windows },
        provider: { ...world.provider, media: world.provider.media.length },
        canonicalRecords: fixture.committedCanonicalRecords().length,
        auditActions: fixture.committedAuditRows(REHEARSAL_ENVIRONMENT).map((row) => row.action),
        budgetThresholdMs: PRE_WRITE_BUDGET_MS,
        budgetElapsedMs: clock.elapsedMs(),
        failureInjectedAt: failureInjectedAt ?? null,
        terminalClassification: classification ?? (error?.combinedCutoverRecovery?.classification ?? null),
        timeline: timeline.map((entry) => ({ ...entry })),
      });
    },
  };
}

// Source-owned recovery inspector. Provider-side durable evidence is authoritative: if the
// provider recorded a canonical write boundary, no local state - including a stale or missing
// migration-control firstPostgresWriteAt - may readmit a Windows rollback or a pre-boundary retry.
export function inspectCombinedCutoverRecovery(authorityState) {
  if (!authorityState) {
    return Object.freeze({
      classification: "AUTHORITY_UNAVAILABLE", rollbackLegal: false, forwardRecoveryRequired: false, restartAdmissible: false,
      reason: "Combined runtime authority state is unavailable; nothing may be admitted.",
    });
  }
  if (authorityState.firstProviderCanonicalWriteAt != null) {
    return Object.freeze({
      classification: "FORWARD_REPAIR_REQUIRED", rollbackLegal: false, forwardRecoveryRequired: true, restartAdmissible: false,
      reason: "Provider recorded a durable canonical write boundary; only forward recovery applies.",
    });
  }
  if (authorityState.authority === RuntimeAuthority.RECOVERY_REQUIRED) {
    return Object.freeze({
      classification: "FORWARD_REPAIR_REQUIRED", rollbackLegal: false, forwardRecoveryRequired: true, restartAdmissible: false,
      reason: "Runtime authority is explicitly recovery-required.",
    });
  }
  if (authorityState.authority === RuntimeAuthority.WINDOWS_LEGACY) {
    return Object.freeze({
      classification: "WINDOWS_AUTHORITATIVE", rollbackLegal: true, forwardRecoveryRequired: false, restartAdmissible: true,
      reason: "Windows retains legacy authority with no provider write boundary.",
    });
  }
  return Object.freeze({
    classification: "PRE_BOUNDARY_CUTOVER_IN_PROGRESS", rollbackLegal: true, forwardRecoveryRequired: false, restartAdmissible: false,
    reason: "A combined cutover is in progress before the provider write boundary; rollback remains legal but a fresh restart is not admissible until it is resolved.",
  });
}

export function createDeterministicClock({ start = new Date("2026-08-18T00:00:00.000Z") } = {}) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advanceMs: (ms) => { current += ms; },
    elapsedMs: () => current - start.getTime(),
  };
}
