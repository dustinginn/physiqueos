// One-time, strictly read-only forensic read for the Build 33 Training
// Library / Workout Logger catalog cleanup: for every canonical exercise
// ID, how many real Founder canonical TrainingSession occurrences actually
// reference it, and when was it most recently observed.
//
// Postgres-enforced REPEATABLE READ / READ ONLY: the engine itself refuses
// any write inside this transaction, matching the exact safety pattern
// established by scripts/auditDexaConfirmationFailure.mjs.
//
// Retrieves ONLY: canonicalExerciseId, an occurrence count, and the most
// recent observed_at per exercise. Never selects full evidence payloads,
// set/rep detail, media, or any unrelated record.
//
// NOT EXECUTED BY THIS SESSION — the read-only doctl context available here
// (`physiqueos-audit`) does not expose a database credential (confirmed via
// `doctl databases connection <id>`, which returns an empty password
// field), so PHYSIQUEOS_DATABASE_URL cannot be supplied from this
// environment. Run this with the Founder's own database credential:
//
//   PHYSIQUEOS_DATABASE_URL="<production Postgres URL>" node scripts/auditTrainingExerciseHistory.mjs
//
// This is UNTESTED against the live schema — I could not execute it here.
// If the JSONB path assumptions below don't match production (e.g. training
// evidence objects are nested under an extra `payload` wrapper the way the
// DEXA script defensively handles), adjust the COALESCE paths and re-run;
// nothing about this script can mutate data regardless.
import pg from "pg";

const OWNER = "user_founder_001";
const raw = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
if (!raw) {
  console.error("PHYSIQUEOS_DATABASE_URL is required (read-only use only).");
  process.exit(1);
}

let connectionString = raw;
const q = raw.indexOf("?");
if (q !== -1) {
  const params = new URLSearchParams(raw.slice(q + 1));
  for (const k of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) params.delete(k);
  const rest = params.toString();
  connectionString = rest ? `${raw.slice(0, q)}?${rest}` : raw.slice(0, q);
}

const target = String(process.env.PHYSIQUEOS_DATABASE_NAME_OVERRIDE ?? "").trim();
if (target) connectionString = connectionString.slice(0, connectionString.lastIndexOf("/") + 1) + target;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  statement_timeout: 30_000,
  connectionTimeoutMillis: 15_000,
  allowExitOnIdle: true,
  application_name: "physiqueos-training-exercise-history-forensic-readonly",
});

try {
  await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

  // Every real training occurrence, unnested to one row per exercise
  // reference. `payload` may or may not carry an extra wrapper depending
  // on how the record was written (see the DEXA script's own COALESCE
  // pattern for the same ambiguity) — both are attempted defensively.
  const usage = (await pool.query(
    `WITH training_records AS (
       SELECT record_id,
              COALESCE(payload->'payload', payload) AS body
         FROM physiqueos.canonical_evidence_records
        WHERE owner_user_id = $1
          AND collection_name = 'canonicalEvidenceObjects'
          AND COALESCE(payload#>>'{payload,evidence_type}', payload->>'evidence_type') = 'training'
          AND (payload->>'removed') IS DISTINCT FROM 'true'
          AND (payload#>>'{payload,removed}') IS DISTINCT FROM 'true'
     ),
     exercise_occurrences AS (
       SELECT tr.record_id,
              COALESCE(tr.body->>'observed_at', tr.body->>'observedAt') AS observed_at,
              ex->>'canonicalExerciseId' AS canonical_exercise_id
         FROM training_records tr,
              LATERAL jsonb_array_elements(COALESCE(tr.body->'exercises', '[]'::jsonb)) AS ex
        WHERE ex->>'canonicalExerciseId' IS NOT NULL
     )
     SELECT canonical_exercise_id,
            COUNT(DISTINCT record_id)   AS session_count,
            COUNT(*)                    AS occurrence_count,
            MAX(observed_at)            AS last_observed_at
       FROM exercise_occurrences
      GROUP BY canonical_exercise_id
      ORDER BY canonical_exercise_id`,
    [OWNER],
  )).rows;

  console.log(JSON.stringify({ owner: OWNER, usage, productionMutationPerformed: "NONE" }, null, 2));
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
