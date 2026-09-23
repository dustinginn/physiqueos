// Bounded HealthKit Workout link-confirmation operation (dry-run | apply).
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled to one file by buildHealthKitPayload.mjs --kind link-confirm). Production-operations
// contract: identity gates before any database access, one bounded connection, owner scoping,
// explicit transaction fencing, no secrets printed, and a success marker only after a clean
// COMMIT (apply) or ROLLBACK (dry-run).
//
//   dry-run  BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, transaction_read_only must be `on`,
//            selects the single candidate strength link in the exact window, proves the
//            confirmation is allowed, predicts the exact writes, writes nothing, ROLLBACK.
//   apply    Requires a non-empty authorization reference and the `expected` facts of the
//            immediately preceding dry run, both baked in at build time. One READ COMMITTED
//            transaction under the per-owner advisory lock (the same lock every command holds,
//            so relationship writes are serialized); writes exactly one audit row plus the
//            confirmation's own link + claim rows through the guarded relationship service;
//            in-transaction verification; any failure rolls back.
//
// Executing this is a separate, explicitly authorized act. Nothing here runs it.
import { createRequire } from "node:module";
import { runHealthKitWorkoutLinkConfirmation } from "../../src/platform/operations/HealthKitWorkoutLinkConfirmationRunner.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const START = typeof __START__ === "undefined" ? "" : __START__;
const END = typeof __END__ === "undefined" ? "" : __END__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_LINK_CONFIRMATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("CONFIRMATION_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_LINK_CONFIRMATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,40}$/.test(String(error?.code ?? "")) ? String(error.code) : "CONFIRMATION_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
if (!/^\d{4}-\d{2}-\d{2}$/.test(START) || !/^\d{4}-\d{2}-\d{2}$/.test(END) || START > END) stop("WINDOW_INVALID");
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
  application_name: "physiqueos-healthkit-link-confirmation",
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
  result = await runHealthKitWorkoutLinkConfirmation({
    records,
    authorization: { ownerUserId: OWNER, startLocalDate: START, endLocalDate: END, authorizationReference: AUTHORIZATION_REFERENCE },
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
if (failure || !result) stop(failure ?? "CONFIRMATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_LINK_CONFIRMATION_JSON:${JSON.stringify({ mode: MODE, window: { startLocalDate: START, endLocalDate: END }, authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
// The success marker means the operation did what was asked: a dry run that
// planned, an apply that committed, or an apply replayed against an already
// confirmed relationship (idempotent, nothing written). Refused, drifted, or
// otherwise rolled-back outcomes end non-zero with no marker.
const acceptable = MODE === "apply" ? ["applied", "already_confirmed"] : ["dry_run"];
if (!acceptable.includes(result.outcome)) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);
