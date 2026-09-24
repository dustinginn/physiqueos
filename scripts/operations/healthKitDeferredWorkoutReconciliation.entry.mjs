// Bounded HealthKit deferred workout reconciliation (dry-run | apply).
// Reconciles exactly ONE already-stored, already-deferred (reconciliation.reason
// === family_not_in_activation_scope) HealthKit workout observation against the
// CURRENT Workout activation policy. There is no date-range or bulk parameter:
// the caller must state the single authorized observation identity.
// Dry-run is REPEATABLE READ READ ONLY. Apply runs under the per-owner advisory
// lock, requires fresh dry-run facts plus an authorization reference, and can
// create only the one canonical cardio workout (plus its read-only coexistence
// patch), patch the target observation's own reconciliation, and write one
// audit row. It never creates a link, a claim, a Logger session, or touches
// automatic confirmation or strategic eligibility.
import { createRequire } from "node:module";
import { runHealthKitDeferredWorkoutReconciliation } from "../../src/platform/operations/HealthKitDeferredWorkoutReconciliationRunner.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const OBSERVATION_ID = typeof __OBSERVATION_ID__ === "undefined" ? "" : __OBSERVATION_ID__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("RECONCILIATION_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,40}$/.test(String(error?.code ?? "")) ? String(error.code) : "RECONCILIATION_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
if (!OBSERVATION_ID.trim()) stop("OBSERVATION_ID_REQUIRED");
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
  application_name: "physiqueos-healthkit-deferred-workout-reconciliation",
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
  result = await runHealthKitDeferredWorkoutReconciliation({
    records,
    authorization: { ownerUserId: OWNER, observationId: OBSERVATION_ID, authorizationReference: AUTHORIZATION_REFERENCE },
    apply,
    expected,
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
if (failure || !result) stop(failure ?? "RECONCILIATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION_JSON:${JSON.stringify({ mode: MODE, observationId: OBSERVATION_ID, authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
const acceptable = MODE === "apply" ? ["applied", "already_reconciled"] : ["dry_run", "already_reconciled", "already_canonicalized"];
if (!acceptable.includes(result.outcome)) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);
