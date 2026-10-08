// Guarded one-time historical Super Set correction.
//
// preview: one REPEATABLE READ READ ONLY transaction, explicit read-only
// verification, bounded owner-scoped SELECTs, and ROLLBACK.
// apply: requires a separately authorized reference and intact sealed preview;
// one SERIALIZABLE transaction, owner advisory lock, exact expected versions,
// three-record mutation ceiling, in-transaction postconditions, and COMMIT.
//
// Building this payload never executes it. This source does not itself grant
// production mutation authority.
import { createRequire } from "node:module";
import { runHistoricalTrainingSupersetCorrection } from "../../src/platform/operations/HistoricalTrainingSupersetCorrectionRunner.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "preview" : __MODE__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HISTORICAL_SUPERSET_CORRECTION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("HISTORICAL_SUPERSET_CORRECTION_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HISTORICAL_SUPERSET_CORRECTION_FAILED:${String(code).replace(/[^A-Z0-9_]/gi, "_").slice(0, 80)}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,80}$/.test(String(error?.code ?? ""))
  ? String(error.code) : "HISTORICAL_SUPERSET_CORRECTION_ERROR");

if (!["preview", "apply"].includes(MODE)) stop("MODE_INVALID");
if (MODE === "apply" && !AUTHORIZATION_REFERENCE.trim()) stop("AUTHORIZATION_REFERENCE_REQUIRED");
if (MODE === "apply" && !EXPECTED_JSON) stop("EXPECTED_PREVIEW_REQUIRED");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let expected = null;
try { expected = EXPECTED_JSON ? JSON.parse(EXPECTED_JSON) : null; } catch { stop("EXPECTED_PREVIEW_INVALID"); }

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
  application_name: "physiqueos-historical-superset-correction",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  connectionTimeoutMillis: 8_000,
});
pool.on("error", () => {});

let client;
let open = false;
let failure = null;
let result = null;
try {
  client = await pool.connect();
  const apply = MODE === "apply";
  await client.query(apply
    ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
    : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  if (apply) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${OWNER}`]);
  } else {
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  }
  const store = createStore(client);
  result = await runHistoricalTrainingSupersetCorrection({
    store,
    authorization: { ownerUserId: OWNER, authorizationReference: AUTHORIZATION_REFERENCE },
    deployment: { expectedSha: EXPECTED_GIT_SHA, runtimeSha: process.env.PHYSIQUEOS_GIT_SHA },
    apply,
    expected,
  });
  if (apply && result.outcome === "applied" && store.getMutationCount() !== 3) {
    throw Object.assign(new Error("mutation count"), { code: "MUTATION_COUNT_MISMATCH" });
  }
  const mayCommit = apply && ["applied", "already_corrected"].includes(result.outcome);
  await client.query(mayCommit ? "COMMIT" : "ROLLBACK");
  open = false;
} catch (error) {
  failure = sanitizedCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !result) stop(failure ?? "HISTORICAL_SUPERSET_CORRECTION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HISTORICAL_SUPERSET_CORRECTION_JSON:${JSON.stringify({
  mode: MODE,
  authorizationReference: AUTHORIZATION_REFERENCE || null,
  transactionReadOnly: MODE === "preview" ? "on" : "off",
  rollbackVerified: MODE === "preview",
  ...result,
})}\n`);
const expectedOutcomes = MODE === "apply" ? ["applied", "already_corrected"] : ["preview"];
if (!expectedOutcomes.includes(result.outcome)) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);

function createStore(db) {
  let mutationCount = 0;
  const rows = (resultRows) => resultRows.map((row) => ({
    recordId: String(row.record_id),
    version: Number(row.version),
    payload: row.payload,
  }));
  return Object.freeze({
    getMutationCount: () => mutationCount,
    async listLegacyCandidates({ ownerUserId, limit }) {
      return rows((await db.query(
        `SELECT record_id,version,payload
           FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
            AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training'
            AND COALESCE(payload#>>'{quality,status}','active')<>'superseded'
            AND payload#>>'{quality,supersededBy}' IS NULL
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(COALESCE(payload#>'{payload,exercises}',payload->'exercises','[]'::jsonb)) exercise
               WHERE exercise#>>'{executionVariant,key}'='super_set'
            )
          ORDER BY record_id
          LIMIT $2`,
        [ownerUserId, limit],
      )).rows);
    },
    async listLineage({ ownerUserId, recordIds, limit }) {
      if (recordIds.length === 0) return [];
      return rows((await db.query(
        `SELECT record_id,version,payload
           FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name=ANY($2::text[]) AND record_id=ANY($3::text[])
          ORDER BY collection_name,record_id
          LIMIT $4`,
        [ownerUserId, ["evidencePackages", "evidenceReviews"], recordIds, limit],
      )).rows);
    },
    async listImpactTrainingSessions({ ownerUserId, targetCanonicalExerciseIds, limit }) {
      return rows((await db.query(
        `SELECT record_id,version,payload
           FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
            AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='training'
            AND COALESCE(payload#>>'{quality,status}','active')<>'superseded'
            AND payload#>>'{quality,supersededBy}' IS NULL
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(COALESCE(payload#>'{payload,exercises}',payload->'exercises','[]'::jsonb)) exercise
               WHERE exercise->>'canonicalExerciseId'=ANY($2::text[])
            )
          ORDER BY record_id
          LIMIT $3`,
        [ownerUserId, targetCanonicalExerciseIds, limit],
      )).rows);
    },
    async listPerformanceEvents({ ownerUserId, targetCanonicalExerciseIds, sourceCanonicalIds, sourceSessionIds, limit }) {
      return rows((await db.query(
        `SELECT record_id,version,payload
           FROM physiqueos.canonical_training_records
          WHERE owner_user_id=$1 AND collection_name='trainingPerformanceEvents'
            AND (
              payload->>'canonicalExerciseId'=ANY($2::text[])
              OR payload->>'sourceCanonicalTrainingId'=ANY($3::text[])
              OR payload->>'sourceSessionId'=ANY($4::text[])
            )
          ORDER BY record_id
          LIMIT $5`,
        [ownerUserId, targetCanonicalExerciseIds, sourceCanonicalIds, sourceSessionIds, limit],
      )).rows);
    },
    async listEvidenceMetadata({ ownerUserId, limit }) {
      return rows((await db.query(
        `SELECT record_id,version,'{}'::jsonb AS payload
           FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
          ORDER BY record_id
          LIMIT $2`,
        [ownerUserId, limit],
      )).rows).map(({ recordId, version }) => ({ recordId, version }));
    },
    async listVariantDefinitions({ ownerUserId, limit }) {
      return rows((await db.query(
        `SELECT record_id,version,payload
           FROM physiqueos.canonical_training_records
          WHERE owner_user_id=$1 AND collection_name='trainingExecutionVariants'
          ORDER BY record_id
          LIMIT $2`,
        [ownerUserId, limit],
      )).rows);
    },
    async getTrainingSessions({ ownerUserId, recordIds }) {
      if (recordIds.length === 0) return [];
      return rows((await db.query(
        `SELECT record_id,version,payload
           FROM physiqueos.canonical_evidence_records
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' AND record_id=ANY($2::text[])
          ORDER BY record_id`,
        [ownerUserId, recordIds],
      )).rows);
    },
    async updateTrainingSession({ ownerUserId, recordId, expectedVersion, payload }) {
      const nextVersion = Number(expectedVersion) + 1;
      const storedPayload = { ...structuredClone(payload), version: nextVersion };
      const updated = (await db.query(
        `UPDATE physiqueos.canonical_evidence_records
            SET payload=$4::jsonb,version=$5,updated_at=now()
          WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects' AND record_id=$2 AND version=$3
          RETURNING record_id,version,payload`,
        [ownerUserId, recordId, Number(expectedVersion), JSON.stringify(storedPayload), nextVersion],
      )).rows;
      if (updated.length !== 1) throw Object.assign(new Error("expected version"), { code: "EXPECTED_VERSION_CONFLICT" });
      mutationCount += 1;
      return rows(updated)[0];
    },
  });
}

