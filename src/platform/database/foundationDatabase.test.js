import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { readDatabaseConfig } from "./config";
import { createPostgresPool } from "./pool";
import { createPostgresTransactionRunner } from "./transaction";
import { assertExpectedVersion, nextAggregateVersion } from "./optimisticConcurrency";

const require = createRequire(import.meta.url);
const migration = require("../../../db/migrations/000001_shared_platform_foundation.cjs");

describe("PostgreSQL foundation", () => {
  it("is disabled and connection-free by default", () => {
    const config = readDatabaseConfig({});
    expect(config).toMatchObject({ enabled: false, connectionString: null, maximumPoolSize: 5 });
    expect(() => createPostgresPool(config)).toThrow("PostgreSQL is inactive");
  });

  it("requires explicit enablement and a database URL", () => {
    expect(() => readDatabaseConfig({ PHYSIQUEOS_DATABASE_ENABLED: "1" })).toThrow("PHYSIQUEOS_DATABASE_URL");
    expect(readDatabaseConfig({ PHYSIQUEOS_DATABASE_ENABLED: "1", PHYSIQUEOS_DATABASE_URL: "postgresql://synthetic.invalid/db" })).toMatchObject({ enabled: true, connectionString: "postgresql://synthetic.invalid/db" });
  });

  it("configures an explicit provider CA with certificate verification", async () => {
    const certificate = "-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----";
    const config = readDatabaseConfig({
      PHYSIQUEOS_DATABASE_ENABLED: "1",
      PHYSIQUEOS_DATABASE_URL: "postgresql://synthetic.invalid/db?sslmode=require&application_name=synthetic",
      PHYSIQUEOS_DATABASE_CA_CERT: certificate,
    });
    const pool = createPostgresPool(config);
    expect(pool.options.ssl).toEqual({ ca: certificate, rejectUnauthorized: true });
    expect(pool.options.connectionString).not.toContain("sslmode");
    expect(pool.options.connectionString).toContain("application_name=synthetic");
    await pool.end();
    expect(() => readDatabaseConfig({
      PHYSIQUEOS_DATABASE_ENABLED: "1",
      PHYSIQUEOS_DATABASE_URL: "postgresql://synthetic.invalid/db",
      PHYSIQUEOS_DATABASE_CA_CERT: "not-a-certificate",
    })).toThrow("CA certificate");
  });

  it("commits or rolls back transaction work", async () => {
    const client = { query: vi.fn(async () => ({})), release: vi.fn() };
    const runner = createPostgresTransactionRunner({ pool: { connect: vi.fn(async () => client) } });
    await expect(runner.run(async (transaction) => { await transaction.query("SELECT 1"); return "ok"; })).resolves.toBe("ok");
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    client.query.mockClear();
    await expect(runner.run(async () => { throw new Error("synthetic failure"); })).rejects.toThrow("synthetic failure");
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it("enforces optimistic versions without numeric precision loss", () => {
    expect(assertExpectedVersion({ expectedVersion: "9007199254740993", actualVersion: 9007199254740993n })).toBe("9007199254740993");
    expect(nextAggregateVersion("9007199254740993")).toBe("9007199254740994");
    expect(() => assertExpectedVersion({ expectedVersion: "4", actualVersion: "5", resource: { id: "synthetic" } })).toThrow(/Refresh the canonical state/);
  });

  it("defines explicit reversible SQL for every Phase 1 primitive", () => {
    const upCalls = [];
    const downCalls = [];
    migration.up({ sql: (value) => upCalls.push(value) });
    migration.down({ sql: (value) => downCalls.push(value) });
    expect(upCalls).toHaveLength(1);
    expect(downCalls).toHaveLength(1);
    for (const table of ["users", "devices", "sessions", "access_credentials", "refresh_credentials", "recovery_credentials", "command_receipts", "outbox_messages", "stored_objects", "upload_intents", "operations", "worker_heartbeats", "feature_flags", "migration_runs"]) {
      expect(upCalls[0]).toContain(`CREATE TABLE physiqueos.${table}`);
      expect(downCalls[0]).toContain(`DROP TABLE IF EXISTS physiqueos.${table}`);
    }
    expect(upCalls[0]).toContain("UNIQUE (user_id, idempotency_key)");
    expect(upCalls[0]).toContain("UNIQUE (topic, dedupe_key)");
    expect(upCalls[0]).toContain("version bigint NOT NULL DEFAULT 1 CHECK (version > 0)");
  });
});
