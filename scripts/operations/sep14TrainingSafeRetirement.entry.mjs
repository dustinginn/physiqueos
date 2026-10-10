// One exact historical Evidence Review retirement. Dry-run is a bounded
// REPEATABLE READ / READ ONLY proof. Apply holds the owner advisory lock,
// re-runs the same preservation proof, and updates only the sealed review row.
// The canonical workout, performance events, Goals, Briefings, and dead
// continuation audit row are read and sealed but never mutated.
import { createRequire } from "node:module";
import { runHistoricalEvidenceReviewRetirement } from "../../src/platform/operations/HistoricalEvidenceReviewRetirement.js";
import { SEP14_TRAINING_RETIREMENT_AUTHORIZATION as AUTHORIZATION } from "../../src/platform/operations/sep14TrainingRetirementAuthorization.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_SEP14_TRAINING_RETIREMENT_SUCCESS" : __MARKER__;
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("RETIREMENT_TIMEOUT", 3), 60_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_SEP14_RETIREMENT_FAILED:${String(code).replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120)}\n`);
  process.exit(status);
}
const safeCode = (error) => (/^[A-Za-z0-9_:-]{3,120}$/.test(String(error?.code ?? "")) ? String(error.code) : "RETIREMENT_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (MODE === "apply" && AUTHORIZATION_REFERENCE !== AUTHORIZATION.authorizationReference) stop("AUTHORIZATION_REFERENCE_MISMATCH");
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
  application_name: "physiqueos-sep14-training-retirement",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 50_000,
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
  await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  if (apply) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${AUTHORIZATION.ownerUserId}`]);
  } else {
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  }
  const retirementTime = new Date();
  result = await runHistoricalEvidenceReviewRetirement({
    query: (text, values) => client.query(text, values),
    authorization: AUTHORIZATION,
    apply,
    now: () => retirementTime,
  });
  const expected = apply ? "applied" : "ready";
  if (result.outcome !== expected) throw Object.assign(new Error(result.code ?? "RETIREMENT_NOT_READY"), { code: result.code ?? "RETIREMENT_NOT_READY" });
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  open = false;
} catch (error) {
  failure = safeCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !result) stop(failure ?? "RETIREMENT_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_SEP14_RETIREMENT_JSON:${JSON.stringify({ authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
process.stdout.write(`${MARKER}\n`);
