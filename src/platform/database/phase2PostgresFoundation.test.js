import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { createPostgresTransactionRunner } from "./transaction";
import { createFoundationPostgresAdapters } from "./foundationPostgresComposition";
import { createPostgresCommandStore } from "./PostgresCommandStore";

const require = createRequire(import.meta.url);
const phase1 = require("../../../db/migrations/000001_shared_platform_foundation.cjs");
const phase2 = require("../../../db/migrations/000002_phase2_platform_operations.cjs");

describe("Phase 2 PostgreSQL foundation", () => {
  it("defines reversible security, ownership, worker, upload, and backup schema changes", () => {
    expect(phase1.FOUNDATION_UP_SQL).toContain("CREATE TABLE physiqueos.users");
    for (const required of [
      "sessions_device_owner_fk", "access_credentials_session_owner_fk", "refresh_credentials_session_owner_fk",
      "command_receipts_session_owner_fk", "upload_intents_object_owner_fk", "CREATE TABLE physiqueos.auth_challenges",
      "CREATE TABLE physiqueos.passkey_credentials", "CREATE TABLE physiqueos.pairing_credentials",
      "CREATE TABLE physiqueos.device_security_states", "CREATE TABLE physiqueos.security_events",
      "CREATE TABLE physiqueos.backup_runs", "completed_at timestamptz", "dead_at timestamptz",
    ]) expect(phase2.PHASE2_UP_SQL).toContain(required);
    expect(phase2.PHASE2_DOWN_SQL).toContain("DROP TABLE IF EXISTS physiqueos.backup_runs");
    expect(phase2.PHASE2_DOWN_SQL).toContain("DROP CONSTRAINT IF EXISTS sessions_device_owner_fk");
  });

  it("commits an augmented PostgreSQL transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() };
    const runner = createPostgresTransactionRunner({ pool: { connect: async () => client }, createContext: (base) => ({ ...base, marker: true }) });
    await expect(runner.run(async (transaction) => transaction.marker)).resolves.toBe(true);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases when a transaction fails", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() };
    const runner = createPostgresTransactionRunner({ pool: { connect: async () => client } });
    await expect(runner.run(async () => { throw new Error("synthetic"); })).rejects.toThrow("synthetic");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("exposes every required foundation adapter without contacting production", () => {
    const adapters = createFoundationPostgresAdapters({ query: vi.fn() });
    expect(Object.keys(adapters).sort()).toEqual(["commands", "control", "identity", "objects", "operations", "outbox", "passkeys"]);
  });

  it("maps PostgreSQL command receipts to the application replay contract", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: "user", device_id: "device", session_id: "session", command_id: "command", idempotency_key: "key", command_type: "synthetic", payload_hash: "a".repeat(64), operation_id: null, status: "committed" }] });
    const receipt = await createPostgresCommandStore({ query }).commandReceipts.find("user", "key");
    expect(receipt).toMatchObject({ userId: "user", commandId: "command", idempotencyKey: "key", payloadHash: "a".repeat(64), status: "committed" });
  });

  it("casts terminal outbox failure parameters for PostgreSQL", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "message", status: "dead" }] });
    const adapters = createFoundationPostgresAdapters({ query });
    await adapters.outbox.fail({ id: "message", workerId: "worker", at: new Date(), dueAt: new Date(), errorCode: "SYNTHETIC", errorDetail: "redacted", terminal: true });
    expect(query.mock.calls[0][0]).toContain("$3::timestamptz");
    expect(query.mock.calls[0][0]).toContain("$7::boolean");
  });
});
