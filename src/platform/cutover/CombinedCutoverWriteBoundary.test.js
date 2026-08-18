import { describe, expect, it } from "vitest";
import { createTransactionalPostgresFixture } from "../database/testing/transactionalPostgresFixture.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "./PostgresCombinedRuntimeAuthorityStore.js";
import { createPhase4CanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { initializeCombinedCutoverAuthority } from "./CombinedCutoverAuthorityInitializer.js";
import { RuntimeAuthority, RuntimeAuthorityAction } from "./CombinedRuntimeAuthorityState.js";

// These tests exercise the REAL production authority store, the REAL authority state machine, and
// the REAL canonical record store against the transaction-faithful fixture. No boundary logic is
// duplicated or stubbed here: firstProviderCanonicalWriteAt is established only by the production
// claimCanonicalWriteBoundary path, inside the same transaction as the canonical mutation, exactly
// as PostgresFounderRepositoryFacade does it.

const environment = "production-combined-cutover";
const ownerUserId = "user_founder_001";
const migrationOperationId = "synthetic-combined-cutover-0001";
const authorizationFingerprint = "a".repeat(64);
const fenceId = "fence-0001";
const windowsSource = { commit: "1".repeat(40), buildId: "nfxfS6GI84-CQl6ONFOQW" };
const providerSource = { commit: "9".repeat(40), buildId: "gate7-access-9068df92" };
const target = {
  databaseClusterId: "cluster-1",
  databaseName: "physiqueos_phase5_test_provider_20260811",
  spacesBucket: "synthetic-space",
};
const finalSnapshot = {
  runtimeSha256: "c".repeat(64),
  runtimeRevision: 140,
  mediaInventorySha256: "d".repeat(64),
  migrationControlSha256: "e".repeat(64),
  packageDigest: "f".repeat(64),
};

async function seededStore() {
  const fixture = createTransactionalPostgresFixture();
  await initializeCombinedCutoverAuthority({
    pool: fixture.pool, environment, windowsSource, now: "2026-08-18T00:00:00.000Z",
  });
  const store = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment });
  return { fixture, store };
}

// Drives the real state machine from windows-legacy up to provider-authoritative, pre-first-write.
async function advanceToProviderAuthority(store) {
  let state = (await store.read()).state;
  state = (await store.transition({
    action: RuntimeAuthorityAction.BEGIN_CUTOVER,
    expectedVersion: state.version,
    commandId: "synthetic:begin-cutover",
    migrationOperationId, authorizationFingerprint, fenceId, finalSnapshot, providerSource, target,
    routingTarget: "provider-ingress",
    reason: "Synthetic combined cutover rehearsal fence.",
  })).state;
  state = (await store.transition({
    action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER,
    expectedVersion: state.version,
    commandId: "synthetic:acknowledge-provider",
    migrationOperationId, authorizationFingerprint,
    providerAcknowledgement: {
      migrationOperationId, authorizationFingerprint, fenceId,
      packageDigest: finalSnapshot.packageDigest, providerDeploymentId: "deployment-1",
    },
    reason: "Synthetic provider acknowledgement.",
  })).state;
  state = (await store.transition({
    action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
    expectedVersion: state.version,
    commandId: "synthetic:transfer-to-provider",
    migrationOperationId, authorizationFingerprint,
    routingTarget: "provider-ingress",
    reason: "Synthetic authority transfer.",
  })).state;
  return state;
}

// Mirrors PostgresFounderRepositoryFacade's canonical write transaction shape.
async function canonicalWriteTransaction({ fixture, store, recordId = "migration-smoke:0001", beforeCommit = null }) {
  const client = await fixture.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
    await store.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId: `command:${recordId}` });
    const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
    const record = await records.put({
      ownerUserId, collection: "migrationMarkers", recordId,
      payload: { id: recordId, userId: ownerUserId, status: "accepted", version: 1 },
    });
    if (beforeCommit) await beforeCommit();
    await client.query("COMMIT");
    return record;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe("combined cutover first-write boundary — real authority code on a transactional fixture", () => {
  it("reaches provider-authoritative with firstProviderCanonicalWriteAt still null", async () => {
    const { fixture, store } = await seededStore();
    const state = await advanceToProviderAuthority(store);
    expect(state.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(state.publicRuntimeAuthority).toBe("provider");
    expect(state.canonicalStoreEpoch).toBe("postgres-canonical");
    expect(state.firstProviderCanonicalWriteAt).toBeNull();
    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
  });

  it("PROOF 6: provider canonical writes are rejected before authority transfer", async () => {
    const { fixture, store } = await seededStore();
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await expect(store.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId: "command:early" }))
      .rejects.toMatchObject({ code: "CANONICAL_WRITES_PAUSED" });
    await client.query("ROLLBACK");
    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
    expect(fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("PROOF 6b: writes are still rejected mid-cutover, before TRANSFER_TO_PROVIDER", async () => {
    const { fixture, store } = await seededStore();
    let state = (await store.read()).state;
    await store.transition({
      action: RuntimeAuthorityAction.BEGIN_CUTOVER,
      expectedVersion: state.version, commandId: "synthetic:begin-cutover",
      migrationOperationId, authorizationFingerprint, fenceId, finalSnapshot, providerSource, target,
      reason: "Synthetic fence.",
    });
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await expect(store.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId: "command:mid" }))
      .rejects.toMatchObject({ code: "CANONICAL_WRITES_PAUSED" });
    await client.query("ROLLBACK");
    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
  });

  it("PROOF 1: boundary claim and canonical mutation commit together", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    const record = await canonicalWriteTransaction({ fixture, store });
    expect(record).toBeTruthy();

    const committed = fixture.committedAuthority(environment);
    expect(committed.firstProviderCanonicalWriteAt).not.toBeNull();
    expect(committed.firstProviderCommandId).toBe("command:migration-smoke:0001");
    expect(fixture.committedCanonicalRecords()).toHaveLength(1);
    expect(fixture.committedCanonicalRecords()[0].recordId).toBe("migration-smoke:0001");
  });

  it("PROOF 5: firstProviderCanonicalWriteAt stays null until the transaction actually commits", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);

    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
    await store.claimCanonicalWriteBoundary({ client, migrationOperationId, commandId: "command:staged" });

    // The boundary is staged inside the open transaction but MUST NOT be globally visible yet.
    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
    await client.query("COMMIT");
    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).not.toBeNull();
  });

  it("PROOF 2: a failed canonical mutation rolls back the boundary marker with it", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    fixture.injectFailure({
      match: (sql) => sql.startsWith("INSERT INTO physiqueos.canonical_confidence_records"),
      error: Object.assign(new Error("injected canonical mutation failure"), { code: "INJECTED_CANONICAL_FAILURE" }),
    });

    await expect(canonicalWriteTransaction({ fixture, store }))
      .rejects.toMatchObject({ code: "INJECTED_CANONICAL_FAILURE" });

    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
    expect(fixture.committedAuthority(environment).firstProviderCommandId).toBeNull();
    expect(fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("PROOF 3: a hard failure after the mutation but before COMMIT leaves both uncommitted", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);

    await expect(canonicalWriteTransaction({
      fixture, store,
      beforeCommit: async () => { throw Object.assign(new Error("hard failure before commit"), { code: "INJECTED_PRE_COMMIT" }); },
    })).rejects.toMatchObject({ code: "INJECTED_PRE_COMMIT" });

    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
    expect(fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("an injected authority-audit failure rolls back the entire transaction", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    fixture.injectFailure({
      match: (sql) => sql.startsWith("INSERT INTO physiqueos.combined_runtime_authority_audit"),
      error: Object.assign(new Error("injected audit failure"), { code: "INJECTED_AUDIT_FAILURE" }),
    });

    await expect(canonicalWriteTransaction({ fixture, store }))
      .rejects.toMatchObject({ code: "INJECTED_AUDIT_FAILURE" });

    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
    expect(fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("PROOF 4: a competing concurrent first-write transaction cannot proceed in parallel", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);

    const first = await fixture.pool.connect();
    await first.query("BEGIN");
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]);
    await store.claimCanonicalWriteBoundary({ client: first, migrationOperationId, commandId: "command:first" });

    // A competing transaction must be serialized out, not allowed to establish a rival boundary.
    const second = await fixture.pool.connect();
    await second.query("BEGIN");
    await expect(second.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${ownerUserId}`]))
      .rejects.toMatchObject({ code: "FIXTURE_LOCK_CONFLICT" });
    await second.query("ROLLBACK");

    await first.query("COMMIT");
    const committed = fixture.committedAuthority(environment);
    expect(committed.firstProviderCommandId).toBe("command:first");
  });

  it("a second canonical write does not create a second first-write timestamp", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    await canonicalWriteTransaction({ fixture, store, recordId: "migration-smoke:0001" });
    const firstBoundary = fixture.committedAuthority(environment).firstProviderCanonicalWriteAt;
    const versionAfterFirst = fixture.committedAuthority(environment).version;

    await canonicalWriteTransaction({ fixture, store, recordId: "migration-smoke:0002" });
    const committed = fixture.committedAuthority(environment);
    expect(committed.firstProviderCanonicalWriteAt).toBe(firstBoundary);
    expect(committed.firstProviderCommandId).toBe("command:migration-smoke:0001");
    // already-recorded short-circuits before any further authority state transition
    expect(committed.version).toBe(versionAfterFirst);
    expect(fixture.committedCanonicalRecords()).toHaveLength(2);
  });

  it("records first-write audit evidence exactly once", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    await canonicalWriteTransaction({ fixture, store, recordId: "migration-smoke:0001" });
    await canonicalWriteTransaction({ fixture, store, recordId: "migration-smoke:0002" });

    const firstWriteAudits = fixture.committedAuditRows(environment)
      .filter((row) => row.action === RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE);
    expect(firstWriteAudits).toHaveLength(1);
  });

  it("keeps the authority audit trail append-only and ordered across the full sequence", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    await canonicalWriteTransaction({ fixture, store });

    const actions = fixture.committedAuditRows(environment).map((row) => row.action);
    expect(actions).toEqual([
      "initialized",
      RuntimeAuthorityAction.BEGIN_CUTOVER,
      RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER,
      RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
      RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE,
    ]);
  });

  it("forbids ABORT_TO_WINDOWS once the provider write boundary is committed", async () => {
    const { fixture, store } = await seededStore();
    await advanceToProviderAuthority(store);
    await canonicalWriteTransaction({ fixture, store });
    const state = (await store.read()).state;

    await expect(store.transition({
      action: RuntimeAuthorityAction.ABORT_TO_WINDOWS,
      expectedVersion: state.version,
      commandId: "synthetic:abort-after-boundary",
      migrationOperationId, authorizationFingerprint,
      reason: "Attempt legacy rollback after the irreversible boundary.",
    })).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_TRANSITION_REJECTED" });

    expect(fixture.committedAuthority(environment).authority).toBe(RuntimeAuthority.PROVIDER);
  });

  it("permits ABORT_TO_WINDOWS before the boundary, restoring Windows authority", async () => {
    const { fixture, store } = await seededStore();
    const state = await advanceToProviderAuthority(store);
    const restored = (await store.transition({
      action: RuntimeAuthorityAction.ABORT_TO_WINDOWS,
      expectedVersion: state.version,
      commandId: "synthetic:abort-before-boundary",
      migrationOperationId, authorizationFingerprint,
      reason: "Pre-boundary abort.",
    })).state;

    expect(restored.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(restored.publicRuntimeAuthority).toBe("windows");
    expect(restored.canonicalStoreEpoch).toBe("legacy-json");
    expect(fixture.committedAuthority(environment).authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
  });
});
