import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createFoundationPostgresAdapters } from "../src/platform/database/foundationPostgresComposition.js";
import { createPostgresPool } from "../src/platform/database/pool.js";

const mode = process.argv[2];
if (process.env.PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE !== "1") throw new Error("Deployed worker acceptance requires PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE=1.");
if (!['seed', 'verify-restart'].includes(mode)) throw new Error("Use seed or verify-restart.");
const config = readDatabaseConfig();
const parsed = new URL(config.connectionString);
if (parsed.hostname.endsWith(".ondigitalocean.com") === false || decodeURIComponent(parsed.pathname.slice(1)) !== "physiqueos_staging") {
  throw new Error("Refusing to exercise a database other than the approved provider staging database.");
}

const ids = Object.freeze({ success: "phase2-deployed-success-20260811", failure: "phase2-deployed-failure-20260811", restart: "phase2-deployed-restart-20260811" });
const pool = createPostgresPool(config);
const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
try {
  if (mode === 'seed') await seed();
  else await verifyRestart();
} finally {
  await pool.end();
}

async function seed() {
  await pool.query("DELETE FROM physiqueos.outbox_messages WHERE id = ANY($1::text[])", [Object.values(ids)]);
  await adapters.commands.outbox.insert({ id: ids.success, topic: "foundation.synthetic", dedupeKey: ids.success, payloadVersion: "1", payload: { commandId: "phase2-provider-acceptance" } });
  await adapters.commands.outbox.insert({ id: ids.failure, topic: "foundation.synthetic.failure", dedupeKey: ids.failure, payloadVersion: "1", payload: { commandId: "phase2-provider-acceptance" } });
  await adapters.commands.outbox.insert({ id: ids.restart, topic: "foundation.synthetic", dedupeKey: ids.restart, payloadVersion: "1", payload: { commandId: "phase2-provider-restart" }, dueAt: new Date(Date.now() + 90_000) });
  const success = await waitFor(ids.success, (row) => row.status === "succeeded", 60_000);
  const failure = await waitFor(ids.failure, (row) => row.status === "dead", 60_000);
  assert(success.attempt_count === 1, "The deployed worker repeated successful work.");
  assert(failure.attempt_count === 3 && failure.last_error_code === "SYNTHETIC_FAILURE" && failure.dead_at && !failure.last_error_detail.includes("Synthetic staging failure requested"), "The deployed worker did not persist a bounded redacted terminal failure.");
  process.stdout.write("[phase2-deployed-worker] PASS success bounded-retry dead-letter restart-message-seeded\n");
}

async function verifyRestart() {
  const restart = await waitFor(ids.restart, (row) => row.status === "succeeded", 150_000);
  const success = await rowFor(ids.success);
  const failure = await rowFor(ids.failure);
  const heartbeat = await adapters.outbox.latestHeartbeat();
  assert(restart.attempt_count === 1, "Restart-surviving work was repeated.");
  assert(success.status === "succeeded" && success.attempt_count === 1, "Previously completed work changed after restart.");
  assert(failure.status === "dead" && failure.attempt_count === 3, "Dead-letter state changed after restart.");
  assert(heartbeat?.status === "healthy" && Date.now() - new Date(heartbeat.observed_at).getTime() < 120_000, "Worker heartbeat did not recover after restart.");
  process.stdout.write("[phase2-deployed-worker] PASS restart recovery heartbeat durable-terminal-state no-repeat\n");
}

async function waitFor(id, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await rowFor(id);
    if (row && predicate(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for deployed worker fixture ${id}.`);
}
async function rowFor(id) {
  return (await pool.query("SELECT id, status, attempt_count, last_error_code, last_error_detail, dead_at, completed_at FROM physiqueos.outbox_messages WHERE id = $1", [id])).rows[0] ?? null;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
