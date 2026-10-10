// Zero-write benchmark for the PostgreSQL reads performed before HealthKit
// observation reconciliation. It compares the former full-collection shape
// with the bounded candidate shape inside one repeatable-read transaction.
// Output contains aggregate counts and timings only: no record IDs, dates, or payloads.
import { createRequire } from "node:module";

const EXPECTED_GIT_SHA = __EXPECTED_GIT_SHA__;
const MARKER = __MARKER__;
const OWNER = "user_founder_001";
const REPETITIONS = 10;
const stop = (code, status = 1) => { process.stdout.write(`PHYSIQUEOS_HEALTHKIT_LOAD_BENCH_FAILED:${code}\n`); process.exit(status); };
const watchdog = setTimeout(() => stop("TIMEOUT", 3), 280_000);
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let pg; try { pg = createRequire("/app/server.js")("pg"); } catch { stop("PG_UNAVAILABLE"); }
let connectionString;
try {
  const url = new URL(rawUrl);
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) url.searchParams.delete(key);
  connectionString = url.toString();
} catch { stop("DATABASE_BINDING_INVALID"); }
const pool = new pg.Pool({
  connectionString,
  ssl: { ca: certificate, rejectUnauthorized: true },
  application_name: "physiqueos-healthkit-load-benchmark",
  max: 1,
  connectionTimeoutMillis: 8_000,
  statement_timeout: 20_000,
  allowExitOnIdle: true,
});
const READ_ONLY_STATEMENT = /^\s*(SELECT|WITH)\b/i;
const round = (value) => Math.round(value * 10) / 10;
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
};
const median = (values) => percentile(values, 0.5);
let client;
let began = false;

async function select(text, values) {
  if (!READ_ONLY_STATEMENT.test(String(text))) throw Object.assign(new Error("NON_SELECT_STATEMENT_REFUSED"), { code: "NON_SELECT_STATEMENT_REFUSED" });
  if (/;\s*\S/.test(String(text).replace(/'[^']*'/g, ""))) throw Object.assign(new Error("MULTI_STATEMENT_REFUSED"), { code: "MULTI_STATEMENT_REFUSED" });
  return client.query(text, values);
}

async function measure(statements) {
  const startedAt = performance.now();
  let rows = 0;
  let payloadBytes = 0;
  for (const [text, values] of statements) {
    const result = await select(text, values);
    rows += result.rows.length;
    payloadBytes += Buffer.byteLength(JSON.stringify(result.rows));
  }
  return { elapsedMs: performance.now() - startedAt, rows, payloadBytes, queries: statements.length };
}

try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  began = true;
  const readOnly = await client.query("SHOW transaction_read_only");
  if (readOnly.rows[0]?.transaction_read_only !== "on") stop("NOT_READ_ONLY");

  const recentObservations = await select(
    `SELECT record_id FROM physiqueos.canonical_training_records
      WHERE owner_user_id=$1 AND collection_name='healthKitObservations'
      ORDER BY updated_at DESC,record_id DESC LIMIT 2`, [OWNER]
  );
  const workoutSources = await select(
    `SELECT payload#>>'{current,sourceObservationId}' AS source_id
       FROM physiqueos.canonical_training_records
      WHERE owner_user_id=$1 AND collection_name='healthKitCanonicalWorkouts'
        AND NULLIF(payload#>>'{current,sourceObservationId}','') IS NOT NULL
      ORDER BY record_id`, [OWNER]
  );
  const recentDays = await select(
    `SELECT record_id FROM physiqueos.canonical_training_records
      WHERE owner_user_id=$1 AND collection_name='healthKitCanonicalDays'
      ORDER BY updated_at DESC,record_id DESC LIMIT 2`, [OWNER]
  );
  const observationIds = [...new Set([
    ...recentObservations.rows.map((row) => row.record_id),
    ...workoutSources.rows.map((row) => row.source_id),
  ].filter(Boolean))];
  const canonicalDayIds = recentDays.rows.map((row) => row.record_id);
  const configIds = [
    "healthkit_canonical_daily_activation_policy",
    "healthkit_workout_activation_policy",
    "healthkit_trusted_watch_workout_correlation_policy",
  ];
  const relationshipCollections = ["healthKitCanonicalWorkouts", "healthKitWorkoutLinks", "healthKitWorkoutLinkClaims"];

  const baseline = [
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitObservations' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' ORDER BY record_id`, [OWNER]],
    [`SELECT record_id,created_at,updated_at FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitConfiguration' AND record_id=$2`, [OWNER, configIds[0]]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitCanonicalDays' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitConfiguration' AND record_id=$2`, [OWNER, configIds[1]]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitCanonicalWorkouts' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitWorkoutLinks' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitWorkoutLinkClaims' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitConfiguration' AND record_id=$2`, [OWNER, configIds[2]]],
  ];
  const candidate = [
    [`SELECT payload,version FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' ORDER BY record_id`, [OWNER]],
    [`SELECT record_id,created_at,updated_at FROM physiqueos.canonical_evidence_records WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' ORDER BY record_id`, [OWNER]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitConfiguration' AND record_id=ANY($2::text[]) ORDER BY record_id`, [OWNER, configIds]],
    [`SELECT collection_name,payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name=ANY($2::text[]) ORDER BY collection_name,record_id`, [OWNER, relationshipCollections]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitObservations' AND record_id=ANY($2::text[]) ORDER BY record_id`, [OWNER, observationIds]],
    [`SELECT payload,version FROM physiqueos.canonical_training_records WHERE owner_user_id=$1 AND collection_name='healthKitCanonicalDays' AND record_id=ANY($2::text[]) ORDER BY record_id`, [OWNER, canonicalDayIds]],
  ];

  const samples = { baseline: [], candidate: [] };
  for (let index = 0; index < REPETITIONS; index += 1) {
    const order = index % 2 === 0 ? [["baseline", baseline], ["candidate", candidate]] : [["candidate", candidate], ["baseline", baseline]];
    for (const [label, statements] of order) samples[label].push(await measure(statements));
  }
  const results = ["baseline", "candidate"].map((label) => ({
    label,
    failure: null,
    warmMedianMs: round(median(samples[label].map((sample) => sample.elapsedMs))),
    warmP95Ms: round(percentile(samples[label].map((sample) => sample.elapsedMs), 0.95)),
    warmMaxMs: round(Math.max(...samples[label].map((sample) => sample.elapsedMs))),
    queries: samples[label][0].queries,
    dbRows: samples[label][0].rows,
    sourcePayloadBytes: samples[label][0].payloadBytes,
  }));
  await client.query("ROLLBACK");
  began = false;
  const tail = await client.query("SELECT 1 AS ok");
  if (tail.rows[0]?.ok !== 1) stop("POST_ROLLBACK_CHECK_FAILED");
  process.stdout.write(`${JSON.stringify({
    gitSha: EXPECTED_GIT_SHA.slice(0, 12),
    group: "healthkit-ingest-load",
    codeLabel: "baseline-vs-bounded-candidate",
    commandGate: "COMMANDS_DISABLED",
    repetitions: REPETITIONS,
    selectionCounts: { observationIds: observationIds.length, canonicalDayIds: canonicalDayIds.length },
    results,
  })}\n`);
} catch (error) {
  if (began) { try { await client.query("ROLLBACK"); } catch {} }
  stop(`UNEXPECTED:${String(error?.code ?? error?.name ?? "unknown").slice(0, 40)}`);
} finally {
  client?.release();
}
await pool.end();
clearTimeout(watchdog);
process.stdout.write(`${MARKER}\n`);
