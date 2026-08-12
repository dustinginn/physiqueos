import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createFoundationPostgresAdapters } from "../src/platform/database/foundationPostgresComposition.js";
import { createPostgresPool } from "../src/platform/database/pool.js";

const mode = process.argv[2];
if (process.env.PHYSIQUEOS_PHASE5_PROVIDER_ACCEPTANCE !== "1") throw new Error("Phase 5 deployed restart acceptance is not explicitly enabled.");
if (!['seed', 'verify'].includes(mode)) throw new Error("Use seed or verify.");
const config = readDatabaseConfig();
const parsed = new URL(config.connectionString);
if (!parsed.hostname.endsWith(".ondigitalocean.com") || decodeURIComponent(parsed.pathname.slice(1)) !== "physiqueos_staging") {
  throw new Error("Refusing to exercise a database other than the approved provider staging database.");
}

const ids = Object.freeze({ queued: "phase5-deployed-queued-20260811", leased: "phase5-deployed-leased-20260811" });
const pool = createPostgresPool(config);
const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
try {
  if (mode === "seed") await seed();
  else await verify();
} finally {
  await pool.end();
}

async function seed() {
  await pool.query("DELETE FROM physiqueos.outbox_messages WHERE id = ANY($1::text[])", [Object.values(ids)]);
  const now = Date.now();
  await adapters.commands.outbox.insert({
    id: ids.queued, topic: "foundation.synthetic", dedupeKey: ids.queued, payloadVersion: "1",
    payload: { commandId: ids.queued }, dueAt: new Date(now + 30_000),
  });
  await pool.query(
    `INSERT INTO physiqueos.outbox_messages
      (id,topic,dedupe_key,payload_version,payload,due_at,status,claimed_by,claim_expires_at,attempt_count)
     VALUES ($1,'foundation.synthetic',$1,'1',$2::jsonb,$3,'processing','phase5-pre-restart-worker',$4,1)`,
    [ids.leased, JSON.stringify({ commandId: ids.leased }), new Date(now), new Date(now + 30_000)],
  );
  process.stdout.write("[phase5-deployed-restart] SEEDED queued-and-leased-synthetic-work\n");
}

async function verify() {
  const deadline = Date.now() + 150_000;
  let rows = [];
  while (Date.now() < deadline) {
    rows = (await pool.query(
      "SELECT id,status,attempt_count,last_error_code,last_error_detail,completed_at FROM physiqueos.outbox_messages WHERE id = ANY($1::text[]) ORDER BY id",
      [Object.values(ids)],
    )).rows;
    if (rows.length === 2 && rows.every((row) => row.status === "succeeded")) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert(rows.length === 2 && rows.every((row) => row.status === "succeeded"), "Deployed restart work did not reach durable success.");
  const queued = rows.find((row) => row.id === ids.queued);
  const leased = rows.find((row) => row.id === ids.leased);
  assert(queued?.attempt_count === 1 && leased?.attempt_count === 2, "Restart recovery used an unexpected durable claim count.");
  assert(rows.every((row) => row.completed_at && !row.last_error_code && !row.last_error_detail), "Restart recovery retained an error.");
  const heartbeat = await adapters.outbox.latestHeartbeat();
  assert(heartbeat?.status === "healthy" && Date.now() - new Date(heartbeat.observed_at).getTime() < 120_000, "Worker heartbeat did not recover after the platform restart.");
  process.stdout.write("[phase5-deployed-restart] PASS application-restart queued-work worker-restart expired-lease exact-once heartbeat\n");
}

function assert(condition, message) { if (!condition) throw new Error(message); }
