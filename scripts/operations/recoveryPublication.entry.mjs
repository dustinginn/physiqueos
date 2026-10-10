// Recovery Briefing V1 publication operations: the authority runner
// (preview / apply / postverify / disable-preview / disable) and the zero-write
// publication preview / eligibility checkpoint.
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled to one file by buildRecoveryPublicationPayload.mjs). Production-operations
// contract: identity gates before any database access, one bounded connection, owner scoping,
// explicit transaction fencing, no secrets printed, sanitized output only (no Sleep values),
// and a success marker only after a clean COMMIT (apply/disable) or ROLLBACK (all others).
//
//   read-only  preview, postverify, disable-preview, checkpoint, card preview:
//              BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, transaction_read_only must be
//              `on`, ROLLBACK.
//   write      apply / disable: require a non-empty authorization reference and the seal of the
//              immediately preceding preview, both baked in at build time. One READ COMMITTED
//              transaction under the owner advisory lock; writes exactly one record; in-transaction
//              verification; any failure rolls back.
//
// Executing apply or disable is a separate, explicitly Founder-authorized act. Nothing here runs it.
import { createRequire } from "node:module";
import { runRecoveryPublicationAuthority } from "../../src/platform/operations/RecoveryPublicationAuthorityRunner.js";
import { runRecoveryPublicationPreview } from "../../src/platform/operations/RecoveryPublicationPreview.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const OPERATION = typeof __OPERATION__ === "undefined" ? "" : __OPERATION__;
const ACTION = typeof __ACTION__ === "undefined" ? "" : __ACTION__;
const DESIRED_JSON = typeof __DESIRED_JSON__ === "undefined" ? "" : __DESIRED_JSON__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_SEAL = typeof __EXPECTED_SEAL__ === "undefined" ? "" : __EXPECTED_SEAL__;
const EXPECTED_RECORD_DIGEST = typeof __EXPECTED_RECORD_DIGEST__ === "undefined" ? "" : __EXPECTED_RECORD_DIGEST__;
const PREVIEW_JSON = typeof __PREVIEW_JSON__ === "undefined" ? "" : __PREVIEW_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_RECOVERY_PUBLICATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const AUTHORITY_ID_PATTERN = "%recovery_briefing_publication%";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const WRITE_ACTIONS = Object.freeze(["apply", "disable"]);
const watchdog = setTimeout(() => stop("RECOVERY_PUBLICATION_TIMEOUT", 3), 120_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_RECOVERY_PUBLICATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "RECOVERY_PUBLICATION_ERROR");

if (!["authority", "preview"].includes(OPERATION)) stop("OPERATION_INVALID");
const writes = OPERATION === "authority" && WRITE_ACTIONS.includes(ACTION);
if (writes && (!AUTHORIZATION_REFERENCE.trim() || !EXPECTED_SEAL)) stop("AUTHORIZATION_AND_SEAL_REQUIRED");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let desired = null;
let previewRequest = null;
try {
  desired = DESIRED_JSON ? JSON.parse(DESIRED_JSON) : undefined;
  previewRequest = PREVIEW_JSON ? JSON.parse(PREVIEW_JSON) : null;
} catch { stop("BUILD_PARAMETERS_INVALID"); }

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
  application_name: "physiqueos-recovery-publication",
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
  await client.query(writes ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  if (!writes) {
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  } else {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${OWNER}`]);
  }
  const query = (text, values) => client.query(text, values);
  const records = createPhase4CanonicalRecordStore({ query });
  if (OPERATION === "authority") {
    // Every owner row, in every canonical table, whose id names the authority.
    const censusAuthorityRows = async () => {
      const tables = (await query(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'physiqueos' AND table_name LIKE 'canonical\\_%'
           AND column_name IN ('owner_user_id','record_id','collection_name')
         GROUP BY table_name HAVING count(DISTINCT column_name) = 3 ORDER BY table_name LIMIT 80`, [])).rows
        .map((row) => row.table_name).filter((name) => /^canonical_[a-z_]+$/.test(name));
      const rows = [];
      for (const table of tables) {
        const found = await query(
          `SELECT collection_name, record_id FROM physiqueos.${table} WHERE owner_user_id = $1 AND record_id LIKE $2 LIMIT 10`,
          [OWNER, AUTHORITY_ID_PATTERN]);
        for (const row of found.rows) rows.push({ table, collection: row.collection_name, recordId: row.record_id });
      }
      return rows;
    };
    result = await runRecoveryPublicationAuthority({
      records,
      authorization: { ownerUserId: OWNER, authorizationReference: AUTHORIZATION_REFERENCE },
      censusAuthorityRows,
      runtimeSha: EXPECTED_GIT_SHA,
      action: ACTION,
      desired,
      expectedSeal: EXPECTED_SEAL || null,
      expectedRecordDigest: EXPECTED_RECORD_DIGEST || null,
    });
  } else {
    result = await runRecoveryPublicationPreview({ records, ownerUserId: OWNER, ...previewRequest });
  }
  const commit = writes && ["applied", "disabled"].includes(result.outcome);
  await client.query(commit ? "COMMIT" : "ROLLBACK");
  open = false;
} catch (error) {
  failure = sanitizedCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !result) stop(failure ?? "RECOVERY_PUBLICATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_RECOVERY_PUBLICATION_JSON:${JSON.stringify({ operation: OPERATION, action: ACTION || null, ...result })}\n`);
const expectedOutcomes = OPERATION === "preview"
  ? ["checkpoint", "card", "no_card"]
  : ({ preview: ["preview"], apply: ["applied"], postverify: ["verified"], "disable-preview": ["disable_preview"], disable: ["disabled"] })[ACTION] ?? [];
if (!expectedOutcomes.includes(result.outcome)) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);
