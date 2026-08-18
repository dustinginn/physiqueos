import { describe, expect, it, vi } from "vitest";
import {
  assertCombinedCutoverPreCutoverAuthorityState,
  initializeCombinedCutoverAuthority,
  REQUIRED_COMBINED_CUTOVER_TABLES,
} from "./CombinedCutoverAuthorityInitializer.js";
import {
  RuntimeAuthority,
  applyCombinedRuntimeAuthorityTransition,
  createCompatibilityRuntimeAuthorityState,
  createInitialCombinedRuntimeAuthorityState,
  RuntimeAuthorityAction,
} from "./CombinedRuntimeAuthorityState.js";

const environment = "production-combined-cutover";
const windowsSource = { commit: "1".repeat(40), buildId: "nfxfS6GI84-CQl6ONFOQW" };
const now = "2026-08-18T00:00:00.000Z";

function windowsLegacyState(overrides = {}) {
  return { ...createInitialCombinedRuntimeAuthorityState({ environment, windowsSource, now }), ...overrides };
}

// Richer than the minimal stub in PostgresCombinedRuntimeAuthorityStore.test.js: this one has to
// serve to_regclass probes, the transfer-receipt probe, SELECT ... FOR UPDATE, INSERT of the
// state row, and the audit insert, so the real store code path executes end to end.
function fakeDatabase({ existing = null, tables = REQUIRED_COMBINED_CUTOVER_TABLES, receipts = [] } = {}) {
  const queries = [];
  const inserted = { states: [], audits: [] };
  let row = existing;
  const query = vi.fn(async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    queries.push(normalized);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.startsWith("SELECT to_regclass")) {
      return { rows: [{ relation: tables.includes(values[0]) ? values[0] : null }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT migration_operation_id FROM physiqueos.combined_transfer_receipts")) {
      return { rows: receipts, rowCount: receipts.length };
    }
    if (normalized.startsWith("SELECT state FROM physiqueos.combined_runtime_authority")) {
      return { rows: row ? [{ state: row }] : [], rowCount: row ? 1 : 0 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.combined_runtime_authority_audit")) {
      inserted.audits.push(values);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.combined_runtime_authority")) {
      inserted.states.push(values);
      row = JSON.parse(values[15]);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  });
  const client = { query, release: vi.fn() };
  return { queries, inserted, client, pool: { connect: async () => client, query } };
}

describe("combined cutover authority initialization", () => {
  it("seeds a windows-legacy-authoritative record when none exists", async () => {
    const database = fakeDatabase();
    const result = await initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now });
    expect(result.outcome).toBe("initialized");
    expect(result.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(result.environment).toBe(environment);
    expect(result.publicRuntimeAuthority).toBe("windows");
    expect(result.canonicalStoreEpoch).toBe("legacy-json");
    expect(result.compositionMode).toBe("legacy-json");
    expect(result.firstProviderCanonicalWriteAt).toBeNull();
    expect(database.queries).toContain("COMMIT");
  });

  it("writes append-only audit evidence for the initialization", async () => {
    const database = fakeDatabase();
    await initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now });
    expect(database.inserted.audits).toHaveLength(1);
    expect(database.inserted.states).toHaveLength(1);
  });

  it("is idempotent for an identical existing tuple", async () => {
    const database = fakeDatabase({ existing: windowsLegacyState() });
    const result = await initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now });
    expect(result.outcome).toBe("already-initialized");
    expect(database.inserted.states).toHaveLength(0);
  });

  it("refuses to repurpose a compatibility-shaped environment key", async () => {
    const database = fakeDatabase();
    for (const candidate of ["compatibility", "compatibility-nonproduction", "compatibility/staging", "COMPATIBILITY-x"]) {
      await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment: candidate, windowsSource, now }))
        .rejects.toMatchObject({ code: "COMBINED_CUTOVER_ENVIRONMENT_REJECTED" });
    }
    expect(database.queries).toHaveLength(0);
  });

  it("cannot collide with a compatibility tuple, because compatibility state is unconstructible outside a compatibility environment", () => {
    // Defense in depth: even before this initializer's own environment guard, the state machine
    // refuses to mint a compatibility tuple for a production environment key. The compatibility
    // record therefore always lives under its own PRIMARY KEY and is never a candidate for
    // repurposing by the combined cutover record.
    expect(() => createCompatibilityRuntimeAuthorityState({
      environment,
      providerSource: { commit: "a".repeat(40), buildId: "gate7-access-9068df92" },
      target: { databaseClusterId: "cluster", databaseName: "physiqueos_phase5_test_provider_20260811", spacesBucket: "bucket" },
      now,
    })).toThrow(/requires an explicit compatibility environment/);

    const compatibility = createCompatibilityRuntimeAuthorityState({
      environment: "compatibility-nonproduction",
      providerSource: { commit: "a".repeat(40), buildId: "gate7-access-9068df92" },
      target: { databaseClusterId: "cluster", databaseName: "physiqueos_phase5_test_provider_20260811", spacesBucket: "bucket" },
      now,
    });
    expect(compatibility.environment).not.toBe(environment);
    expect(compatibility.authority).toBe(RuntimeAuthority.COMPATIBILITY);
  });

  it("fails closed rather than overwriting a divergent existing record under this key", async () => {
    const divergent = windowsLegacyState({ windowsSource: { commit: "9".repeat(40), buildId: "other-build" } });
    const database = fakeDatabase({ existing: divergent });
    await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now }))
      .rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_INITIALIZATION_CONFLICT" });
    expect(database.inserted.states).toHaveLength(0);
  });

  it("fails closed when an existing record is already provider-authoritative", async () => {
    const prepared = windowsLegacyState({
      authority: RuntimeAuthority.PROVIDER,
      publicRuntimeAuthority: "provider",
      migrationControlAuthority: "provider",
      workerAuthority: "provider",
      canonicalStoreEpoch: "postgres-canonical",
      compositionMode: "postgres",
    });
    const database = fakeDatabase({ existing: prepared });
    await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now }))
      .rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_INITIALIZATION_CONFLICT" });
    expect(database.inserted.states).toHaveLength(0);
  });

  it("fails closed when the combined cutover schema is missing", async () => {
    const database = fakeDatabase({ tables: ["physiqueos.combined_runtime_authority"] });
    await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now }))
      .rejects.toMatchObject({ code: "COMBINED_CUTOVER_SCHEMA_UNAVAILABLE" });
  });

  it("fails closed when a combined transfer operation already exists", async () => {
    const database = fakeDatabase({ receipts: [{ migration_operation_id: "prior-operation" }] });
    await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now }))
      .rejects.toMatchObject({ code: "COMBINED_CUTOVER_OPERATION_CONFLICT" });
    expect(database.inserted.states).toHaveLength(0);
  });

  it("requires PostgreSQL and an environment", async () => {
    await expect(initializeCombinedCutoverAuthority({ environment, windowsSource }))
      .rejects.toMatchObject({ code: "COMBINED_CUTOVER_DATABASE_REQUIRED" });
    const database = fakeDatabase();
    await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment: "  ", windowsSource }))
      .rejects.toMatchObject({ code: "COMBINED_CUTOVER_ENVIRONMENT_REQUIRED" });
  });

  it("requires a Windows source identity and never invents one", async () => {
    const database = fakeDatabase();
    await expect(initializeCombinedCutoverAuthority({ pool: database.pool, environment, now }))
      .rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_INPUT_INVALID" });
    expect(database.inserted.states).toHaveLength(0);
  });

  it("cannot produce provider authority, a fence, an operation, or a write boundary", async () => {
    const database = fakeDatabase();
    const result = await initializeCombinedCutoverAuthority({ pool: database.pool, environment, windowsSource, now });
    const persisted = JSON.parse(database.inserted.states[0][15]);
    expect(result.authority).not.toBe(RuntimeAuthority.PROVIDER);
    expect(persisted.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(persisted.publicRuntimeAuthority).toBe("windows");
    expect(persisted.migrationOperationId).toBeNull();
    expect(persisted.authorizationFingerprint).toBeNull();
    expect(persisted.fenceId).toBeNull();
    expect(persisted.firstProviderCanonicalWriteAt).toBeNull();
    expect(persisted.firstProviderCommandId).toBeNull();
  });

  it("leaves authority transfer exclusively to TRANSFER_TO_PROVIDER", async () => {
    // The seeded state is deliberately several transitions away from provider authority:
    // TRANSFER_TO_PROVIDER requires PROVIDER_PREPARED, which requires ACKNOWLEDGE_PROVIDER,
    // which requires BEGIN_CUTOVER. Attempting the transfer directly must be rejected.
    const seeded = createInitialCombinedRuntimeAuthorityState({ environment, windowsSource, now });
    expect(() => applyCombinedRuntimeAuthorityTransition(seeded, {
      action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
      expectedVersion: seeded.version,
      reason: "attempt direct transfer",
      routingTarget: "provider",
    })).toThrow(/requires an acknowledged provider runtime/);
  });
});

describe("assertCombinedCutoverPreCutoverAuthorityState", () => {
  it("accepts the seeded pre-cutover state", () => {
    expect(assertCombinedCutoverPreCutoverAuthorityState(windowsLegacyState(), { environment })).toBeTruthy();
  });

  it("rejects a mismatched environment", () => {
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(windowsLegacyState(), { environment: "other" }))
      .toThrow(/environment does not match/);
  });

  it("rejects an in-progress cutover operation", () => {
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(windowsLegacyState({ migrationOperationId: "op-1" }), { environment }))
      .toThrow(/cutover operation is in progress/);
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(windowsLegacyState({ fenceId: "fence-1" }), { environment }))
      .toThrow(/cutover operation is in progress/);
  });

  it("rejects a state whose provider write boundary was already crossed", () => {
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(
      windowsLegacyState({ firstProviderCanonicalWriteAt: "2026-08-18T00:00:01.000Z" }), { environment },
    )).toThrow(/boundary has already been crossed/);
  });

  it("rejects provider-side authority and non-legacy persistence", () => {
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(
      windowsLegacyState({ authority: RuntimeAuthority.PROVIDER }), { environment },
    )).toThrow(/not in the expected pre-cutover state/);
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(
      windowsLegacyState({ canonicalStoreEpoch: "postgres-canonical" }), { environment },
    )).toThrow(/not in the expected pre-cutover state/);
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(
      windowsLegacyState({ publicRuntimeAuthority: "provider" }), { environment },
    )).toThrow(/not in the expected pre-cutover state/);
  });

  it("rejects a missing state", () => {
    expect(() => assertCombinedCutoverPreCutoverAuthorityState(null, { environment })).toThrow(/unavailable/);
  });
});
