import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { runner as migrate } from "node-pg-migrate";
import { createFoundationPostgresAdapters, createFoundationPostgresTransactionRunner } from "../src/platform/database/foundationPostgresComposition.js";
import { createPostgresBackupTool } from "../src/platform/backup/PostgresBackupTool.js";
import { createFounderAuthService } from "../src/platform/auth/FounderAuthService.js";

const databaseUrl = String(process.env.PHYSIQUEOS_TEST_DATABASE_URL ?? "").trim();
assertIsolatedDatabase(databaseUrl);
requireExecutable("pg_dump");
requireExecutable("pg_restore");

const migrationOptions = {
  databaseUrl,
  dir: "db/migrations",
  migrationsTable: "physiqueos_schema_migrations",
  migrationsSchema: "physiqueos",
  schema: "physiqueos",
  createSchema: true,
  createMigrationsSchema: true,
  log: () => undefined,
};

await migrate({ ...migrationOptions, direction: "down", count: Number.POSITIVE_INFINITY }).catch((error) => {
  if (!/schema.*does not exist|relation.*does not exist/i.test(String(error?.message))) throw error;
});
await migrate({ ...migrationOptions, direction: "up" });

let pool = createPool();
try {
  await verifySchema(pool);
  await verifyConstraintsAndTransactions(pool);
  await verifyDurabilityAcrossRestart();
  await verifyBackupRestore();
} finally {
  await pool.end();
}

await migrate({ ...migrationOptions, direction: "down", count: Number.POSITIVE_INFINITY });
pool = createPool();
try {
  const removed = await pool.query("SELECT to_regclass('physiqueos.users') AS users");
  assert(removed.rows[0].users === null, "Migration down did not remove the foundation tables.");
} finally {
  await pool.end();
}
await migrate({ ...migrationOptions, direction: "up" });

process.stdout.write("[phase2-postgres] PASS fresh-up schema constraints transactions restart backup-restore down reapply\n");

async function verifySchema(database) {
  const result = await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'physiqueos' ORDER BY table_name");
  const names = new Set(result.rows.map((row) => row.table_name));
  for (const name of ["users", "user_profiles", "devices", "sessions", "access_credentials", "refresh_credentials", "recovery_credentials", "operations", "command_receipts", "outbox_messages", "stored_objects", "upload_intents", "worker_heartbeats", "feature_flags", "migration_runs", "auth_challenges", "passkey_credentials", "pairing_credentials", "device_security_states", "security_events", "backup_runs"]) {
    assert(names.has(name), `Missing migrated table ${name}.`);
  }
}

async function verifyConstraintsAndTransactions(database) {
  const transactionRunner = createFoundationPostgresTransactionRunner({ pool: database });
  await transactionRunner.run(async (transaction) => {
    await transaction.identity.createUserProfile({ userId: "synthetic-user-a", profileId: "synthetic-profile-a", displayName: "Synthetic A", timeZone: "UTC" });
    await transaction.identity.createUserProfile({ userId: "synthetic-user-b", profileId: "synthetic-profile-b", displayName: "Synthetic B", timeZone: "UTC" });
    await transaction.identity.createDevice({ id: "synthetic-device-a", userId: "synthetic-user-a", platform: "test", displayName: "A" });
    await transaction.identity.createDevice({ id: "synthetic-device-b", userId: "synthetic-user-b", platform: "test", displayName: "B" });
  });
  await expectDatabaseCode("23503", () => database.query(
    `INSERT INTO physiqueos.sessions (id,user_id,device_id,authenticated_at,idle_expires_at,absolute_expires_at)
     VALUES ('cross-owner-session','synthetic-user-a','synthetic-device-b',now(),now()+interval '1 day',now()+interval '2 days')`,
  ));
  await transactionRunner.run(async (transaction) => {
    await transaction.identity.createSession({ id: "synthetic-session-a", userId: "synthetic-user-a", deviceId: "synthetic-device-a", authenticatedAt: new Date(), idleExpiresAt: new Date(Date.now() + 86_400_000), absoluteExpiresAt: new Date(Date.now() + 172_800_000), refreshFamilyId: "synthetic-family-a" });
  });
  let authId = 0;
  let authSecret = 0;
  const auth = createFounderAuthService({
    transactionRunner,
    credentialPepper: "synthetic-phase2-pepper-which-is-never-production-000000000000",
    createId: () => `0198f100-0000-7000-8000-${String(++authId).padStart(12, "0")}`,
    createSecret: () => Buffer.alloc(32, ++authSecret).toString("base64url"),
  });
  const issuedSession = await auth.createSession({ userId: "synthetic-user-a", deviceId: "synthetic-device-a" });
  const authenticated = await auth.authenticateAccessToken(issuedSession.accessToken);
  assert(authenticated.userId === "synthetic-user-a", "A live opaque access token did not resolve its principal.");
  const rotated = await auth.rotateRefreshCredential(issuedSession.refreshCredential);
  assert(rotated.refreshCredential !== issuedSession.refreshCredential, "Refresh rotation did not issue a new credential.");
  try { await auth.rotateRefreshCredential(issuedSession.refreshCredential); throw new Error("Refresh replay was accepted."); }
  catch (error) { assert(error.code === "REFRESH_REUSE_DETECTED", "Refresh replay returned the wrong failure."); }
  const revokedFamily = await database.query("SELECT count(*)::integer AS count FROM physiqueos.sessions WHERE id = $1 AND status = 'revoked'", [issuedSession.sessionId]);
  assert(revokedFamily.rows[0].count === 1, "Refresh replay revocation did not survive its transaction.");
  try { await auth.authenticateAccessToken(rotated.accessToken); throw new Error("A revoked session token was accepted."); }
  catch (error) { assert(error.code === "ACCESS_TOKEN_REVOKED", "Revoked-session authentication returned the wrong failure."); }
  await expectRejects(async () => transactionRunner.run(async (transaction) => {
    await transaction.operations.create({ id: "rolled-back-operation", userId: "synthetic-user-a", operationType: "synthetic", status: "queued" });
    throw new Error("synthetic rollback");
  }));
  assert((await database.query("SELECT count(*)::integer AS count FROM physiqueos.operations WHERE id = 'rolled-back-operation'")).rows[0].count === 0, "Transaction rollback leaked a record.");

  await transactionRunner.run(async (transaction) => {
    await transaction.commandReceipts.insert({ id: "receipt-1", userId: "synthetic-user-a", deviceId: "synthetic-device-a", sessionId: "synthetic-session-a", commandId: "command-1", idempotencyKey: "idempotency-unique-1", commandType: "synthetic", payloadHash: "a".repeat(64), status: "processing" });
    await transaction.outbox.insert({ id: "outbox-1", userId: "synthetic-user-a", topic: "synthetic.test", dedupeKey: "dedupe-1", payloadVersion: "1", payload: { safe: true } });
  });
  await expectDatabaseCode("23505", () => database.query(
    `INSERT INTO physiqueos.command_receipts
      (id,user_id,device_id,session_id,command_id,idempotency_key,command_type,payload_hash,status)
     VALUES ('receipt-2','synthetic-user-a','synthetic-device-a','synthetic-session-a','command-2','idempotency-unique-1','synthetic',$1,'processing')`,
    ["b".repeat(64)],
  ));
  await expectRejects(async () => transactionRunner.run(async (transaction) => {
    await transaction.commandReceipts.insert({ id: "receipt-rollback", userId: "synthetic-user-a", deviceId: "synthetic-device-a", sessionId: "synthetic-session-a", commandId: "command-rollback", idempotencyKey: "idempotency-rollback", commandType: "synthetic", payloadHash: "c".repeat(64), status: "processing" });
    await transaction.outbox.insert({ id: "outbox-rollback", userId: "synthetic-user-a", topic: "synthetic.test", dedupeKey: "dedupe-rollback", payloadVersion: "1", payload: {} });
    throw new Error("synthetic atomic rollback");
  }));
  const atomic = await database.query("SELECT (SELECT count(*) FROM physiqueos.command_receipts WHERE id='receipt-rollback')::integer AS receipts, (SELECT count(*) FROM physiqueos.outbox_messages WHERE id='outbox-rollback')::integer AS outbox");
  assert(atomic.rows[0].receipts === 0 && atomic.rows[0].outbox === 0, "Receipt/outbox atomicity failed.");

  const adapters = createFoundationPostgresAdapters({ query: (text, values) => database.query(text, values) });
  await adapters.operations.create({ id: "operation-versioned", userId: "synthetic-user-a", operationType: "synthetic", status: "queued" });
  assert((await adapters.operations.update({ id: "operation-versioned", userId: "synthetic-user-a", expectedVersion: 1, status: "running" })).version === "2", "Optimistic update did not advance version.");
  assert(await adapters.operations.update({ id: "operation-versioned", userId: "synthetic-user-a", expectedVersion: 1, status: "failed" }) === null, "Stale optimistic update was not rejected.");

  await adapters.control.putFeatureFlag({ key: "synthetic.kill-switch", enabled: false });
  await adapters.objects.createObjectAndIntent({ object: { id: "synthetic-object", userId: "synthetic-user-a", bucket: "synthetic", objectKey: "private/a/object", contentType: "image/jpeg", byteLength: 10, sha256: "d".repeat(64) }, intent: { id: "synthetic-upload", expiresAt: new Date(Date.now() + 60_000), providerUploadId: "synthetic-provider" } });
  await database.query(
    `INSERT INTO physiqueos.stored_objects (id,user_id,state,bucket,object_key,content_type,byte_length)
     VALUES ('synthetic-object-owner-check','synthetic-user-a','created','synthetic','private/a/owner-check','image/jpeg',10)`,
  );
  await expectDatabaseCode("23503", () => database.query(
    `INSERT INTO physiqueos.upload_intents (id,user_id,object_id,state,expected_byte_length,expires_at)
     VALUES ('cross-owner-upload','synthetic-user-b','synthetic-object-owner-check','created',10,now()+interval '1 hour')`,
  ));
}

async function verifyDurabilityAcrossRestart() {
  const beforeRestart = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
  const claimed = await beforeRestart.outbox.claimNext({ workerId: "synthetic-crashed-worker", now: new Date(), leaseExpiresAt: new Date(Date.now() + 1_000) });
  assert(claimed?.id === "outbox-1", "Synthetic worker did not claim durable work.");
  await pool.end();
  pool = createPool();
  const result = await pool.query("SELECT (SELECT count(*) FROM physiqueos.sessions WHERE id='synthetic-session-a')::integer AS sessions, (SELECT count(*) FROM physiqueos.feature_flags WHERE key='synthetic.kill-switch')::integer AS flags, (SELECT count(*) FROM physiqueos.stored_objects WHERE id='synthetic-object')::integer AS objects, (SELECT count(*) FROM physiqueos.command_receipts WHERE id='receipt-1')::integer AS receipts, (SELECT count(*) FROM physiqueos.outbox_messages WHERE id='outbox-1')::integer AS outbox");
  assert(Object.values(result.rows[0]).every((value) => value === 1), "Foundation records did not survive a pool restart.");
  const migrations = await pool.query("SELECT count(*)::integer AS count FROM physiqueos.physiqueos_schema_migrations");
  assert(migrations.rows[0].count === 2, "Migration state did not survive restart.");
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  const afterRestart = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
  const recovered = await afterRestart.outbox.claimNext({ workerId: "synthetic-replacement-worker", now: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000) });
  assert(recovered?.id === "outbox-1", "Outbox work did not recover after lease expiration and restart.");
  assert(await afterRestart.outbox.acknowledge({ id: recovered.id, workerId: "synthetic-replacement-worker", at: new Date() }), "Recovered outbox work was not acknowledged.");
  assert(await afterRestart.outbox.claimNext({ workerId: "synthetic-third-worker", now: new Date(Date.now() + 120_000), leaseExpiresAt: new Date(Date.now() + 180_000) }) === null, "Completed outbox work was repeated.");
}

async function verifyBackupRestore() {
  const backupDirectory = path.join(process.cwd(), ".tmp", "phase2-postgres");
  const backupPath = path.join(backupDirectory, "foundation.dump");
  await fs.mkdir(backupDirectory, { recursive: true });
  const tool = createPostgresBackupTool();
  try {
    const backup = await tool.createBackup({ connectionString: databaseUrl, outputPath: backupPath });
    assert(backup.byteLength > 0 && /^[a-f0-9]{64}$/.test(backup.sha256), "Database backup verification failed.");
    await pool.query("DELETE FROM physiqueos.feature_flags WHERE key='synthetic.kill-switch'");
    await pool.end();
    await tool.restoreBackup({ connectionString: databaseUrl, inputPath: backupPath });
    pool = createPool();
    assert((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.feature_flags WHERE key='synthetic.kill-switch'")).rows[0].count === 1, "Restored database did not contain the durable feature flag.");
  } finally {
    await fs.rm(backupDirectory, { recursive: true, force: true });
  }
}

function createPool() { return new pg.Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true }); }
function assertIsolatedDatabase(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("PHYSIQUEOS_TEST_DATABASE_URL must identify an isolated PostgreSQL database."); }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/^physiqueos_phase2_test(?:_|$)/.test(database)) throw new Error("Refusing to mutate a database whose name does not begin with physiqueos_phase2_test.");
}
function requireExecutable(name) {
  const result = spawnSync("where.exe", [name], { windowsHide: true, stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${name} is required for the Phase 2 backup/restore proof.`);
}
async function expectDatabaseCode(code, work) {
  try { await work(); } catch (error) { if (error.code === code) return; throw error; }
  throw new Error(`Expected PostgreSQL error ${code}.`);
}
async function expectRejects(work) {
  try { await work(); } catch { return; }
  throw new Error("Expected work to reject.");
}
function assert(condition, message) { if (!condition) throw new Error(message); }
