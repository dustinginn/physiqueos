// Bounded HealthKit graduation-policy operation (independent projection and evidence-eligibility
// scopes). The dry run is the graduation simulation and writes nothing.
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled to one file by buildHealthKitPayload.mjs). Production-operations contract: identity
// gates before any database access, one bounded connection, owner scoping, explicit transaction
// fencing, no secrets printed, and a success marker only after a clean COMMIT (apply) or
// ROLLBACK (dry-run).
//
//   dry-run  BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, transaction_read_only must be `on`,
//            predicts the exact effect, writes nothing, ROLLBACK.
//   apply    Requires a non-empty authorization reference and the `expected` facts of the
//            immediately preceding dry run, both baked in at build time. One READ COMMITTED
//            transaction under the owner advisory lock; writes exactly the policy record and one
//            audit row; in-transaction verification; any failure rolls back.
//
// Executing this is a separate, explicitly authorized act. Nothing here runs it.
import { createRequire } from "node:module";
import { runHealthKitGraduationPolicy } from "../../src/platform/operations/HealthKitGraduationPolicyRunner.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const DESIRED_JSON = typeof __DESIRED_JSON__ === "undefined" ? "" : __DESIRED_JSON__;
const INCLUDE_VALUES = typeof __INCLUDE_VALUES__ === "undefined" ? true : __INCLUDE_VALUES__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_GRADUATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("GRADUATION_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_GRADUATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "GRADUATION_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
let desired = null;
try { desired = JSON.parse(DESIRED_JSON); } catch { stop("DESIRED_POLICY_INVALID"); }
if (!desired || typeof desired !== "object" || Array.isArray(desired)) stop("DESIRED_POLICY_INVALID");
if (MODE === "apply" && !AUTHORIZATION_REFERENCE.trim()) stop("AUTHORIZATION_REFERENCE_REQUIRED");
if (MODE === "apply" && !EXPECTED_JSON) stop("EXPECTED_FACTS_REQUIRED");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let expected = null;
try { expected = EXPECTED_JSON ? JSON.parse(EXPECTED_JSON) : null; } catch { stop("EXPECTED_FACTS_INVALID"); }

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
  application_name: "physiqueos-healthkit-graduation",
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
  await client.query(apply ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  if (!apply) {
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  } else {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${OWNER}`]);
  }
  const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
  result = await runHealthKitGraduationPolicy({
    records,
    authorization: { ownerUserId: OWNER, authorizationReference: AUTHORIZATION_REFERENCE },
    desired,
    apply,
    expected,
    includeValues: INCLUDE_VALUES,
  });
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
if (failure || !result) stop(failure ?? "GRADUATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_GRADUATION_JSON:${JSON.stringify({ mode: MODE, desired, authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
// The success marker means the operation did what was asked: a dry run that
// planned, or an apply that committed. Refused, drifted, or otherwise
// rolled-back outcomes end non-zero with no marker.
const expectedOutcome = MODE === "apply" ? "applied" : "dry_run";
if (result.outcome !== expectedOutcome) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);
