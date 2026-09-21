// Zero-write HealthKit Workout canary audit (proving window).
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled by buildHealthKitPayload.mjs). Contract: identity gates before any database access,
// one bounded connection, BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, SHOW
// transaction_read_only must be `on`, owner-scoped parameterized SELECTs only, explicit ROLLBACK,
// success marker only after a successful rollback. Strategic collections are reported as digests
// so a later run can prove nothing strategic changed.
import { createRequire } from "node:module";
import { summarizeHealthKitWorkoutCanary } from "../../src/platform/operations/HealthKitWorkoutCanaryAudit.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const START = typeof __START__ === "undefined" ? "" : __START__;
const END = typeof __END__ === "undefined" ? "" : __END__;
const INCLUDE_VALUES = typeof __INCLUDE_VALUES__ === "undefined" ? true : __INCLUDE_VALUES__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_WORKOUT_AUDIT_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const STRATEGIC_TABLES = Object.freeze([
  "canonical_goal_records", "canonical_confidence_records", "canonical_briefing_records",
  "canonical_plan_records", "canonical_protocol_records", "canonical_evidence_records", "canonical_training_records",
]);
const watchdog = setTimeout(() => stop("AUDIT_TIMEOUT", 3), 150_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_WORKOUT_AUDIT_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,40}$/.test(String(error?.code ?? "")) ? String(error.code) : "AUDIT_ERROR");

if (!/^\d{4}-\d{2}-\d{2}$/.test(START) || !/^\d{4}-\d{2}-\d{2}$/.test(END) || START > END) stop("WINDOW_INVALID");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let pg;
try { pg = createRequire(REQUIRE_ROOT)("pg"); } catch { stop("PG_UNAVAILABLE"); }
let connectionString;
try {
  const url = new URL(rawUrl);
  for (const key of SSL_URL_PARAMETERS) url.searchParams.delete(key);
  connectionString = url.toString();
} catch { stop("DATABASE_BINDING_INVALID"); }

const pool = new pg.Pool({
  connectionString,
  ssl: { ca: certificate, rejectUnauthorized: true },
  max: 1,
  application_name: "physiqueos-healthkit-acceptance-audit",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  connectionTimeoutMillis: 8_000,
});
pool.on("error", () => {});

let client;
let open = false;
let failure = null;
let report = null;
try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
  if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
  const [policyRecord, observations, canonicalWorkouts, links, claims, canonicalEvidenceObjects] = await Promise.all([
    records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: "healthkit_workout_canonical_activation_policy" }),
    records.list({ ownerUserId: OWNER, collection: "healthKitObservations" }),
    records.list({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts" }),
    records.list({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks" }),
    records.list({ ownerUserId: OWNER, collection: "healthKitWorkoutLinkClaims" }),
    records.list({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects" }),
  ]);
  const summary = summarizeHealthKitWorkoutCanary({
    policyRecord, observations, canonicalWorkouts, links, claims, canonicalEvidenceObjects,
    startLocalDate: START, endLocalDate: END, includeValues: INCLUDE_VALUES,
  });
  const digests = {};
  for (const table of STRATEGIC_TABLES) {
    if (!/^canonical_[a-z_]+_records$/.test(table)) throw Object.assign(new Error("table"), { code: "TABLE_NAME_INVALID" });
    const rows = (await client.query(
      `SELECT collection_name, count(*)::int AS rows,
              md5(string_agg(record_id || ':' || md5(payload::text), ',' ORDER BY record_id)) AS digest
         FROM physiqueos.${table}
        WHERE owner_user_id = $1
        GROUP BY collection_name ORDER BY collection_name`,
      [OWNER],
    )).rows;
    for (const row of rows) digests[`${table}/${row.collection_name}`] = { rows: row.rows, digest: row.digest };
  }
  const migrations = (await client.query("SELECT count(*)::int AS n, max(name) AS last FROM physiqueos.physiqueos_schema_migrations").catch(() => ({ rows: [{ n: null, last: null }] }))).rows[0];
  await client.query("ROLLBACK");
  open = false;
  report = { runtime: { gitSha: String(process.env.PHYSIQUEOS_GIT_SHA), buildId: String(process.env.PHYSIQUEOS_BUILD_ID ?? "") }, summary, strategicDigests: digests, migrations };
} catch (error) {
  failure = sanitizedCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !report) stop(failure ?? "AUDIT_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_WORKOUT_AUDIT_JSON:${JSON.stringify(report)}\n`);
process.stdout.write(`${MARKER}\n`);
