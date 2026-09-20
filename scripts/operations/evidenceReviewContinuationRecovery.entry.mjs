// Bounded recovery of the real Build 46 Progress Photos continuation message.
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled to one file by buildEvidenceReviewContinuationRecoveryPayload.mjs). It follows the
// production-operations contract: identity gates before any database access, one bounded
// connection, owner scoping, explicit transaction fencing, no secrets or media printed, and a
// success marker only after a clean COMMIT (apply) or ROLLBACK (dry-run).
//
//   dry-run  BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, transaction_read_only must be `on`,
//            plans the recovery from read facts, writes nothing, ROLLBACK.
//   apply    Requires a non-empty authorization reference baked in at build time. One transaction:
//            owner runtime lock, locked re-read, re-plan, one fenced outbox UPDATE, COMMIT.
//
// Executing this is a separate, explicitly authorized act. Nothing here runs it.
import { createRequire } from "node:module";
import { runEvidenceReviewContinuationRecovery } from "../../src/platform/operations/EvidenceReviewContinuationRecovery.js";
import {
  BUILD46_PHOTO_BRIEFING_RECOVERY_AUTHORIZATION,
  BUILD46_PHOTO_CONTINUATION_RECOVERY_AUTHORIZATION,
} from "../../src/platform/operations/build46PhotoContinuationRecoveryAuthorization.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const AUTHORIZATION_NAME = typeof __AUTHORIZATION_NAME__ === "undefined" ? "analysis" : __AUTHORIZATION_NAME__;
const AUTHORIZATION = AUTHORIZATION_NAME === "briefing"
  ? BUILD46_PHOTO_BRIEFING_RECOVERY_AUTHORIZATION
  : BUILD46_PHOTO_CONTINUATION_RECOVERY_AUTHORIZATION;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_CONTINUATION_RECOVERY_SUCCESS" : __MARKER__;
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("RECOVERY_TIMEOUT", 3), 60_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_CONTINUATION_RECOVERY_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "RECOVERY_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
if (!["analysis", "briefing"].includes(AUTHORIZATION_NAME)) stop("AUTHORIZATION_NAME_INVALID");
if (MODE === "apply" && !AUTHORIZATION_REFERENCE.trim()) stop("AUTHORIZATION_REFERENCE_REQUIRED");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== AUTHORIZATION.ownerUserId) stop("OWNER_MISMATCH");
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
  application_name: "physiqueos-continuation-recovery",
  statement_timeout: 20_000,
  idle_in_transaction_session_timeout: 45_000,
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
  await client.query(apply ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  if (!apply) {
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  } else {
    // The same owner lock every canonical review mutation takes, so nothing interleaves.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${AUTHORIZATION.ownerUserId}`]);
  }
  result = await runEvidenceReviewContinuationRecovery({ query: (text, values) => client.query(text, values), authorization: AUTHORIZATION, apply });
  await client.query(apply && result.outcome === "applied" ? "COMMIT" : "ROLLBACK");
  open = false;
} catch (error) {
  failure = sanitizedCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !result) stop(failure ?? "RECOVERY_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_CONTINUATION_RECOVERY_JSON:${JSON.stringify({ mode: MODE, authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
process.stdout.write(`${MARKER}\n`);
