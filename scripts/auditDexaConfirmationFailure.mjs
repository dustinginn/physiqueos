// One-time, strictly read-only forensic read for the Build 27 Sep 12 DEXA
// confirmation failure. Postgres-enforced REPEATABLE READ / READ ONLY: the
// engine itself refuses any write inside this transaction.
//
// Retrieves ONLY: review identity, status, version, commitError, and the
// commitProgress step names/statuses/errors. Never selects interpreted
// evidence payloads, media bytes, PDF contents, or any unrelated record.
import pg from "pg";

const OWNER = "user_founder_001";
const raw = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
if (!raw) {
  console.error("PHYSIQUEOS_DATABASE_URL is required (read-only use only).");
  process.exit(1);
}

// Strip only the query-string portion (never the userinfo, which carries
// the credential) so pg's sslmode=require -> verify-full aliasing cannot
// override the explicit ssl option below for DigitalOcean's self-signed CA.
let connectionString = raw;
const q = raw.indexOf("?");
if (q !== -1) {
  const params = new URLSearchParams(raw.slice(q + 1));
  for (const k of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) params.delete(k);
  const rest = params.toString();
  connectionString = rest ? `${raw.slice(0, q)}?${rest}` : raw.slice(0, q);
}

// Rewrite only the path segment (the database name). pg gives the
// connection string's own database precedence over an explicit `database`
// option, so the override must happen in the string itself.
const target = String(process.env.PHYSIQUEOS_DATABASE_NAME_OVERRIDE ?? "").trim();
if (target) connectionString = connectionString.slice(0, connectionString.lastIndexOf("/") + 1) + target;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  statement_timeout: 30_000,
  connectionTimeoutMillis: 15_000,
  allowExitOnIdle: true,
  application_name: "physiqueos-dexa-confirmation-forensic-readonly",
});

try {
  await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

  // Identity + lifecycle fields only — no interpreted evidence.
  const reviews = (await pool.query(
    `SELECT record_id,
            version,
            payload->>'status'       AS status,
            payload->>'createdAt'    AS created_at,
            payload->>'updatedAt'    AS updated_at,
            payload->>'commitError'  AS commit_error,
            payload->>'packageId'    AS package_id,
            jsonb_array_length(COALESCE(payload->'interpretedEvidence'->'evidence_objects','[]'::jsonb)) AS object_count
       FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id = $1
        AND collection_name = 'evidenceReviews'
        AND payload->>'status' IN ('pending','committing','partially_committed','commit_failed')
      ORDER BY record_id DESC
      LIMIT 5`,
    [OWNER],
  )).rows;

  const steps = (await pool.query(
    `SELECT r.record_id,
            s.key                AS step,
            s.value->>'status'   AS step_status,
            s.value->>'attempts' AS attempts,
            s.value->>'error'    AS step_error
       FROM physiqueos.canonical_evidence_records r,
            LATERAL jsonb_each(COALESCE(r.payload->'commitProgress','{}'::jsonb)) AS s
      WHERE r.owner_user_id = $1
        AND r.collection_name = 'evidenceReviews'
        AND r.payload->>'status' IN ('committing','partially_committed','commit_failed')`,
    [OWNER],
  )).rows;

  // Independent corroboration: how many canonical DEXA objects exist for
  // Sep 12 (duplicate check). Counts and dates only — no measurements.
  const dexa = (await pool.query(
    `SELECT record_id,
            COALESCE(payload#>>'{payload,observed_at}', payload->>'observed_at') AS observed_at,
            version
       FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id = $1
        AND collection_name = 'canonicalEvidenceObjects'
        AND COALESCE(payload#>>'{payload,evidence_type}', payload->>'evidence_type') IN ('dexa','dexa_scan')
      ORDER BY record_id DESC
      LIMIT 10`,
    [OWNER],
  )).rows;

  // Dead-lettered continuation message state (no payload contents).
  const outbox = (await pool.query(
    `SELECT id, topic, status, attempt_count, last_error_code, created_at, updated_at
       FROM physiqueos.outbox_messages
      WHERE user_id = $1 AND topic = 'evidence.review.continue'
      ORDER BY created_at DESC
      LIMIT 5`,
    [OWNER],
  )).rows;

  console.log(JSON.stringify({ reviews, steps, dexa, outbox, productionMutationPerformed: "NONE" }, null, 2));
  await pool.query("COMMIT");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  const message = String(error?.message ?? error);
  const safe = /:\/\/[^/\s]+:[^/\s]+@/.test(message)
    ? `${error?.code ?? "QUERY_FAILED"} (message withheld: may contain credentials)`
    : message;
  console.error(`Forensic read failed: ${safe}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
