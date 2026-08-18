// Transaction-faithful in-memory PostgreSQL fixture for the combined-cutover authority boundary.
//
// PURPOSE. The combined cutover's central safety claim is that the provider first-write marker
// (`combined_runtime_authority.first_provider_canonical_write_at`) and the canonical mutation it
// authorizes commit or roll back TOGETHER, in one transaction. A fixture that recognizes SQL
// strings and mutates shared state immediately cannot prove that: it would report success for a
// transaction that never committed. This fixture therefore models real transaction staging.
//
// MODEL. Committed state is a table->rows map. `pool.connect()` returns a client. On BEGIN the
// client takes a snapshot of committed state and performs every subsequent read and write against
// that private working copy, so a transaction sees its own writes while nothing outside sees them.
// COMMIT publishes the working copy atomically; ROLLBACK discards it entirely. Reads issued
// through the pool (no client) always observe committed state only.
//
// WHAT IS MODELED
//   - BEGIN / COMMIT / ROLLBACK with atomic publish and full discard
//   - transaction-local reads and writes; committed-only reads outside a transaction
//   - SELECT ... FOR UPDATE exclusive row ownership, scoped to the transaction
//   - pg_advisory_xact_lock(...) transaction-scoped ownership, reentrant within one transaction
//   - lock release on both COMMIT and ROLLBACK
//   - optimistic UPDATE ... WHERE version=$n returning rowCount (the store's version guard)
//   - append-only audit inserts
//   - canonical record upsert with ON CONFLICT ... RETURNING payload,version
//   - deterministic error injection keyed on SQL text
//
// WHAT IS NOT MODELED (explicit limitations)
//   - Real MVCC. Isolation here is snapshot-at-BEGIN plus explicit locking, which is stricter in
//     some cases and looser in others than PostgreSQL READ COMMITTED. It is sufficient to prove
//     the boundary invariants and nothing more.
//   - Blocking. A conflicting lock raises FIXTURE_LOCK_CONFLICT immediately instead of waiting,
//     deliberately, so tests stay deterministic and never depend on wall-clock timing.
//   - Constraints, types, triggers, sequences, planner behavior, and `now()` semantics beyond what
//     the modeled statements require.
//   - Any SQL not explicitly modeled: unmatched statements THROW rather than returning an empty
//     result, so a silent no-op can never be mistaken for a passing proof.

const AUTHORITY_TABLE = "physiqueos.combined_runtime_authority";
const AUTHORITY_AUDIT_TABLE = "physiqueos.combined_runtime_authority_audit";
const TRANSFER_RECEIPTS_TABLE = "physiqueos.combined_transfer_receipts";

export function createTransactionalPostgresFixture({
  existingTables = [AUTHORITY_TABLE, AUTHORITY_AUDIT_TABLE, TRANSFER_RECEIPTS_TABLE],
  now = () => new Date("2026-08-18T00:00:00.000Z"),
} = {}) {
  let committed = { authority: [], authorityAudit: [], transferReceipts: [], canonicalRecords: [] };
  const rowLocks = new Map();     // lockKey -> transactionId
  const advisoryLocks = new Map();// advisoryKey -> transactionId
  const injections = [];
  const statements = [];
  let nextTransactionId = 1;

  function cloneState(state) {
    return {
      authority: state.authority.map((row) => ({ ...row })),
      authorityAudit: state.authorityAudit.map((row) => ({ ...row })),
      transferReceipts: state.transferReceipts.map((row) => ({ ...row })),
      canonicalRecords: state.canonicalRecords.map((row) => ({ ...row })),
    };
  }

  function releaseLocks(transactionId) {
    for (const [key, owner] of [...rowLocks]) if (owner === transactionId) rowLocks.delete(key);
    for (const [key, owner] of [...advisoryLocks]) if (owner === transactionId) advisoryLocks.delete(key);
  }

  function acquire(registry, key, transactionId, kind) {
    const owner = registry.get(key);
    if (owner != null && owner !== transactionId) {
      throw fixtureError("FIXTURE_LOCK_CONFLICT", `${kind} ${key} is held by another active transaction.`);
    }
    registry.set(key, transactionId);
  }

  function applyInjections(normalized, values) {
    for (const injection of injections) {
      if (injection.consumed || !injection.match(normalized, values)) continue;
      if (injection.once) injection.consumed = true;
      throw injection.error;
    }
  }

  function createClient() {
    const transactionId = nextTransactionId++;
    let working = null; // non-null only inside a transaction

    async function query(sql, values = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      statements.push({ transactionId, sql: normalized, values });
      applyInjections(normalized, values);

      if (normalized === "BEGIN") { working = cloneState(committed); return result([]); }
      if (normalized === "COMMIT") {
        if (working) committed = working;
        working = null;
        releaseLocks(transactionId);
        return result([]);
      }
      if (normalized === "ROLLBACK") { working = null; releaseLocks(transactionId); return result([]); }

      // Reads and writes see the transaction's working copy when one exists, committed otherwise.
      const view = working ?? committed;
      const inTransaction = working != null;

      if (normalized.startsWith("SELECT pg_advisory_xact_lock")) {
        if (!inTransaction) throw fixtureError("FIXTURE_ADVISORY_LOCK_OUTSIDE_TRANSACTION", "pg_advisory_xact_lock requires a transaction.");
        acquire(advisoryLocks, String(values[0]), transactionId, "advisory lock");
        return result([{ pg_advisory_xact_lock: "" }]);
      }

      if (normalized.startsWith("SELECT to_regclass")) {
        return result([{ relation: existingTables.includes(values[0]) ? values[0] : null }]);
      }

      if (normalized.startsWith(`SELECT migration_operation_id FROM ${TRANSFER_RECEIPTS_TABLE}`)) {
        return result(view.transferReceipts.map((row) => ({ migration_operation_id: row.migrationOperationId })));
      }

      if (normalized.startsWith(`SELECT state FROM ${AUTHORITY_TABLE}`)) {
        if (normalized.endsWith("FOR UPDATE")) {
          if (!inTransaction) throw fixtureError("FIXTURE_ROW_LOCK_OUTSIDE_TRANSACTION", "SELECT ... FOR UPDATE requires a transaction.");
          acquire(rowLocks, `${AUTHORITY_TABLE}:${values[0]}`, transactionId, "row lock");
        }
        const row = view.authority.find((entry) => entry.environment === values[0]);
        return result(row ? [{ state: row.state }] : []);
      }

      if (normalized.startsWith(`SELECT command_fingerprint,state FROM ${AUTHORITY_AUDIT_TABLE}`)) {
        const row = view.authorityAudit.find((entry) => entry.environment === values[0] && entry.commandId === values[1]);
        return result(row ? [{ command_fingerprint: row.commandFingerprint, state: row.state }] : []);
      }

      if (normalized.startsWith(`INSERT INTO ${AUTHORITY_AUDIT_TABLE}`)) {
        if (!inTransaction) throw fixtureError("FIXTURE_WRITE_OUTSIDE_TRANSACTION", "Audit insert requires a transaction.");
        view.authorityAudit.push({
          sequence: view.authorityAudit.length + 1,
          environment: values[0], stateVersion: values[1], commandId: values[2], commandFingerprint: values[3],
          migrationOperationId: values[4], action: values[5], previousAuthority: values[6],
          nextAuthority: values[7], result: values[8], errorCode: values[9], state: JSON.parse(values[10]),
        });
        return result([], 1);
      }

      if (normalized.startsWith(`UPDATE ${AUTHORITY_TABLE} SET`)) {
        if (!inTransaction) throw fixtureError("FIXTURE_WRITE_OUTSIDE_TRANSACTION", "Authority update requires a transaction.");
        const environment = values[0];
        const expectedVersion = values[18];
        const index = view.authority.findIndex((entry) => entry.environment === environment && entry.state.version === expectedVersion);
        if (index === -1) return result([], 0); // drives RUNTIME_AUTHORITY_VERSION_CONFLICT
        view.authority[index] = { environment, state: JSON.parse(values[15]) };
        return result([], 1);
      }

      if (normalized.startsWith(`INSERT INTO ${AUTHORITY_TABLE}`)) {
        if (!inTransaction) throw fixtureError("FIXTURE_WRITE_OUTSIDE_TRANSACTION", "Authority insert requires a transaction.");
        if (view.authority.some((entry) => entry.environment === values[0])) {
          throw fixtureError("FIXTURE_UNIQUE_VIOLATION", "combined_runtime_authority.environment already exists.");
        }
        view.authority.push({ environment: values[0], state: JSON.parse(values[15]) });
        return result([], 1);
      }

      const canonicalSelect = /^SELECT payload,version FROM physiqueos\.(\w+) WHERE owner_user_id=\$1 AND collection_name=\$2 AND record_id=\$3$/.exec(normalized);
      if (canonicalSelect) {
        const row = view.canonicalRecords.find((entry) =>
          entry.table === canonicalSelect[1] && entry.ownerUserId === values[0] && entry.collection === values[1] && entry.recordId === values[2]);
        return result(row ? [{ payload: row.payload, version: row.version }] : []);
      }

      const canonicalInsert = /^INSERT INTO physiqueos\.(\w+) \(owner_user_id,collection_name,record_id/.exec(normalized);
      if (canonicalInsert) {
        if (!inTransaction) throw fixtureError("FIXTURE_WRITE_OUTSIDE_TRANSACTION", "Canonical record write requires a transaction.");
        const table = canonicalInsert[1];
        const [ownerUserId, collection, recordId, version] = values;
        const payload = JSON.parse(values[values.length - 1]);
        const existing = view.canonicalRecords.find((entry) =>
          entry.table === table && entry.ownerUserId === ownerUserId && entry.collection === collection && entry.recordId === recordId);
        if (existing) {
          existing.payload = payload;
          existing.version = existing.version + 1;
          existing.updatedAt = now().toISOString();
          return result([{ payload: existing.payload, version: existing.version }], 1);
        }
        const row = { table, ownerUserId, collection, recordId, payload, version: Number(version), updatedAt: now().toISOString() };
        view.canonicalRecords.push(row);
        return result([{ payload: row.payload, version: row.version }], 1);
      }

      throw fixtureError("FIXTURE_UNMODELED_SQL", `Unmodeled SQL reached the transactional fixture: ${normalized}`);
    }

    return {
      transactionId,
      query,
      release: () => { if (working) { working = null; releaseLocks(transactionId); } },
      get inTransaction() { return working != null; },
    };
  }

  const pool = {
    connect: async () => createClient(),
    query: async (sql, values) => {
      // Pool-level queries are autocommit reads against committed state only.
      const client = createClient();
      return client.query(sql, values);
    },
    end: async () => undefined,
  };

  return {
    pool,
    // Test-only inspection of COMMITTED state. Production code never uses these; tests must not
    // mutate fixture state through them, only observe it.
    committedAuthority: (environment) => committed.authority.find((entry) => entry.environment === environment)?.state ?? null,
    committedAuditRows: (environment) => committed.authorityAudit.filter((entry) => entry.environment === environment).map((entry) => ({ ...entry })),
    committedCanonicalRecords: () => committed.canonicalRecords.map((entry) => ({ ...entry })),
    seedTransferReceipt: (migrationOperationId) => { committed.transferReceipts.push({ migrationOperationId }); },
    statements: () => statements.map((entry) => ({ ...entry })),
    heldRowLocks: () => [...rowLocks.keys()],
    heldAdvisoryLocks: () => [...advisoryLocks.keys()],
    injectFailure: ({ match, error, once = true }) => {
      injections.push({ match, error, once, consumed: false });
    },
  };
}

function result(rows, rowCount = rows.length) {
  return { rows, rowCount };
}

function fixtureError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
