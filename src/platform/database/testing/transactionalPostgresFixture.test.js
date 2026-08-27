import { describe, expect, it } from "vitest";
import { createTransactionalPostgresFixture } from "./transactionalPostgresFixture.js";

// These tests prove the FIXTURE itself before any production code is allowed to rely on it.
// If transaction staging here were wrong, every downstream atomicity proof would be worthless.

const environment = "production-combined-cutover";

function authorityState(overrides = {}) {
  return {
    schemaVersion: "combined-runtime-authority-v1",
    version: 1,
    environment,
    authority: "windows-legacy-authoritative",
    firstProviderCanonicalWriteAt: null,
    ...overrides,
  };
}

function insertAuthority(client, state) {
  return client.query(
    `INSERT INTO physiqueos.combined_runtime_authority
      (environment,version,authority,migration_operation_id,authorization_fingerprint,fence_id,
       canonical_store_epoch,composition_mode,public_runtime_authority,migration_control_authority,
       worker_authority,writes_enabled,reads_enabled,first_provider_canonical_write_at,
       first_provider_command_id,state,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18)`,
    [state.environment, state.version, state.authority, null, null, null, "legacy-json", "legacy-json",
      "windows", "windows", "windows", true, true, state.firstProviderCanonicalWriteAt, null,
      JSON.stringify(state), "2026-08-18T00:00:00.000Z", "2026-08-18T00:00:00.000Z"],
  );
}

function selectAuthority(client, { forUpdate = false } = {}) {
  return client.query(
    `SELECT state FROM physiqueos.combined_runtime_authority WHERE environment=$1${forUpdate ? " FOR UPDATE" : ""}`,
    [environment],
  );
}

function insertAudit(client, state, commandId) {
  return client.query(
    `INSERT INTO physiqueos.combined_runtime_authority_audit
      (environment,state_version,command_id,command_fingerprint,migration_operation_id,action,
       previous_authority,next_authority,result,error_code,state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [environment, state.version, commandId, "f".repeat(64), null, "test-action",
      null, state.authority, "committed", null, JSON.stringify(state)],
  );
}

function insertCanonicalRecord(client, { recordId = "record-1", version = 1, payload = { id: "record-1" } } = {}) {
  return client.query(
    `INSERT INTO physiqueos.canonical_confidence_records
      (owner_user_id,collection_name,record_id,source_ordinal,legacy_id,version,status,occurrence_date,observed_at,source_identity,provenance,payload)
     VALUES ($1,$2,$3,
       (SELECT COALESCE(MAX(source_ordinal)+1,0) FROM physiqueos.canonical_confidence_records WHERE owner_user_id=$1 AND collection_name=$2),
       $3,$4,$5,$6::date,$7::timestamptz,$8,$9::jsonb,$10::jsonb)
     ON CONFLICT (owner_user_id,collection_name,record_id) DO UPDATE SET
       payload=EXCLUDED.payload,version=physiqueos.canonical_confidence_records.version+1,updated_at=now()
     RETURNING payload,version`,
    ["owner", "migrationMarkers", recordId, version, null, null, null, null, "{}", JSON.stringify(payload)],
  );
}

describe("transactional fixture — staging and visibility", () => {
  it("keeps a staged INSERT invisible outside the transaction before COMMIT", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await insertAuthority(client, authorityState());
    expect(fixture.committedAuthority(environment)).toBeNull();
  });

  it("lets the transaction read its own staged INSERT", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await insertAuthority(client, authorityState());
    const seen = await selectAuthority(client);
    expect(seen.rows[0].state.authority).toBe("windows-legacy-authoritative");
  });

  it("hides uncommitted mutations from an independent client", async () => {
    const fixture = createTransactionalPostgresFixture();
    const writer = await fixture.pool.connect();
    await writer.query("BEGIN");
    await insertAuthority(writer, authorityState());
    const reader = await fixture.pool.connect();
    const seen = await selectAuthority(reader);
    expect(seen.rows).toHaveLength(0);
  });

  it("makes every staged mutation visible together on COMMIT", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    const state = authorityState();
    await insertAuthority(client, state);
    await insertAudit(client, state, "command-1");
    await insertCanonicalRecord(client);
    expect(fixture.committedAuthority(environment)).toBeNull();
    await client.query("COMMIT");
    expect(fixture.committedAuthority(environment).authority).toBe("windows-legacy-authoritative");
    expect(fixture.committedAuditRows(environment)).toHaveLength(1);
    expect(fixture.committedCanonicalRecords()).toHaveLength(1);
  });

  it("discards every staged mutation on ROLLBACK", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    const state = authorityState();
    await insertAuthority(client, state);
    await insertAudit(client, state, "command-1");
    await insertCanonicalRecord(client);
    await client.query("ROLLBACK");
    expect(fixture.committedAuthority(environment)).toBeNull();
    expect(fixture.committedAuditRows(environment)).toHaveLength(0);
    expect(fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("leaves committed state unchanged when a failure occurs before COMMIT", async () => {
    const fixture = createTransactionalPostgresFixture();
    const seed = await fixture.pool.connect();
    await seed.query("BEGIN");
    await insertAuthority(seed, authorityState());
    await seed.query("COMMIT");

    const before = fixture.committedAuthority(environment);
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await insertCanonicalRecord(client);
    await client.query("ROLLBACK");
    expect(fixture.committedAuthority(environment)).toEqual(before);
    expect(fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("rolls back an authority UPDATE, restoring the previously committed version", async () => {
    const fixture = createTransactionalPostgresFixture();
    const seed = await fixture.pool.connect();
    await seed.query("BEGIN");
    await insertAuthority(seed, authorityState({ version: 1 }));
    await seed.query("COMMIT");

    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    const next = authorityState({ version: 2, firstProviderCanonicalWriteAt: "2026-08-18T01:00:00.000Z" });
    const updated = await client.query(
      `UPDATE physiqueos.combined_runtime_authority SET
         version=$2,authority=$3,migration_operation_id=$4,authorization_fingerprint=$5,fence_id=$6,
         canonical_store_epoch=$7,composition_mode=$8,public_runtime_authority=$9,migration_control_authority=$10,
         worker_authority=$11,writes_enabled=$12,reads_enabled=$13,first_provider_canonical_write_at=$14,
         first_provider_command_id=$15,state=$16::jsonb,updated_at=$17
       WHERE environment=$1 AND version=$18`,
      [environment, 2, next.authority, null, null, null, "postgres-canonical", "postgres", "provider",
        "provider", "provider", true, true, next.firstProviderCanonicalWriteAt, null,
        JSON.stringify(next), "2026-08-18T01:00:00.000Z", 1],
    );
    expect(updated.rowCount).toBe(1);
    await client.query("ROLLBACK");
    expect(fixture.committedAuthority(environment).version).toBe(1);
    expect(fixture.committedAuthority(environment).firstProviderCanonicalWriteAt).toBeNull();
  });

  it("reports rowCount 0 for a stale optimistic version guard", async () => {
    const fixture = createTransactionalPostgresFixture();
    const seed = await fixture.pool.connect();
    await seed.query("BEGIN");
    await insertAuthority(seed, authorityState({ version: 5 }));
    await seed.query("COMMIT");

    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    const stale = await client.query(
      `UPDATE physiqueos.combined_runtime_authority SET
         version=$2,authority=$3,migration_operation_id=$4,authorization_fingerprint=$5,fence_id=$6,
         canonical_store_epoch=$7,composition_mode=$8,public_runtime_authority=$9,migration_control_authority=$10,
         worker_authority=$11,writes_enabled=$12,reads_enabled=$13,first_provider_canonical_write_at=$14,
         first_provider_command_id=$15,state=$16::jsonb,updated_at=$18
       WHERE environment=$1 AND version=$19`,
      [environment, 6, "windows-legacy-authoritative", null, null, null, "legacy-json", "legacy-json",
        "windows", "windows", "windows", true, true, null, null,
        JSON.stringify(authorityState({ version: 6 })), "x", "y", 1],
    );
    expect(stale.rowCount).toBe(0);
  });
});

describe("transactional fixture — locking", () => {
  it("prevents two concurrent transactions from owning the same SELECT ... FOR UPDATE row", async () => {
    const fixture = createTransactionalPostgresFixture();
    const seed = await fixture.pool.connect();
    await seed.query("BEGIN");
    await insertAuthority(seed, authorityState());
    await seed.query("COMMIT");

    const first = await fixture.pool.connect();
    const second = await fixture.pool.connect();
    await first.query("BEGIN");
    await second.query("BEGIN");
    await selectAuthority(first, { forUpdate: true });
    await expect(selectAuthority(second, { forUpdate: true }))
      .rejects.toMatchObject({ code: "FIXTURE_LOCK_CONFLICT" });
  });

  it("prevents two concurrent transactions from owning the same advisory lock", async () => {
    const fixture = createTransactionalPostgresFixture();
    const first = await fixture.pool.connect();
    const second = await fixture.pool.connect();
    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner"]);
    await expect(second.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner"]))
      .rejects.toMatchObject({ code: "FIXTURE_LOCK_CONFLICT" });
  });

  it("allows the same transaction to reacquire its own advisory lock", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner"]);
    await expect(client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner"]))
      .resolves.toBeTruthy();
  });

  it("releases transaction-scoped locks on COMMIT", async () => {
    const fixture = createTransactionalPostgresFixture();
    const first = await fixture.pool.connect();
    await first.query("BEGIN");
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner"]);
    expect(fixture.heldAdvisoryLocks()).toHaveLength(1);
    await first.query("COMMIT");
    expect(fixture.heldAdvisoryLocks()).toHaveLength(0);

    const second = await fixture.pool.connect();
    await second.query("BEGIN");
    await expect(second.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner"]))
      .resolves.toBeTruthy();
  });

  it("releases transaction-scoped locks on ROLLBACK", async () => {
    const fixture = createTransactionalPostgresFixture();
    const seed = await fixture.pool.connect();
    await seed.query("BEGIN");
    await insertAuthority(seed, authorityState());
    await seed.query("COMMIT");

    const first = await fixture.pool.connect();
    await first.query("BEGIN");
    await selectAuthority(first, { forUpdate: true });
    expect(fixture.heldRowLocks()).toHaveLength(1);
    await first.query("ROLLBACK");
    expect(fixture.heldRowLocks()).toHaveLength(0);

    const second = await fixture.pool.connect();
    await second.query("BEGIN");
    await expect(selectAuthority(second, { forUpdate: true })).resolves.toBeTruthy();
  });
});

describe("transactional fixture — safety rails", () => {
  it("throws on unmodeled SQL instead of silently returning an empty result", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await expect(client.query("SELECT * FROM physiqueos.some_other_table"))
      .rejects.toMatchObject({ code: "FIXTURE_UNMODELED_SQL" });
  });

  it("rejects writes attempted outside a transaction", async () => {
    const fixture = createTransactionalPostgresFixture();
    const client = await fixture.pool.connect();
    await expect(insertAuthority(client, authorityState()))
      .rejects.toMatchObject({ code: "FIXTURE_WRITE_OUTSIDE_TRANSACTION" });
  });

  it("injects a deterministic failure on a matching statement exactly once", async () => {
    const fixture = createTransactionalPostgresFixture();
    fixture.injectFailure({
      match: (sql) => sql.startsWith("INSERT INTO physiqueos.combined_runtime_authority_audit"),
      error: Object.assign(new Error("injected audit failure"), { code: "INJECTED" }),
    });
    const client = await fixture.pool.connect();
    await client.query("BEGIN");
    const state = authorityState();
    await insertAuthority(client, state);
    await expect(insertAudit(client, state, "command-1")).rejects.toMatchObject({ code: "INJECTED" });
    await client.query("ROLLBACK");
    expect(fixture.committedAuthority(environment)).toBeNull();
  });
});
