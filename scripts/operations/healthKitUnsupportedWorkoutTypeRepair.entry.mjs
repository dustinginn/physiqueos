// Bounded one-time repair of the two 2026-10-02 Founder Apple Watch workouts
// (Stair Stepper 44, Cooldown 80) stored as source_only / unsupported_workout_type
// (dry-run | apply). The scope (owner, date, types, state) is fixed in the runner;
// the selection must be exactly those two observations or it refuses.
// Dry-run is REPEATABLE READ READ ONLY and prints the exact canonical records it
// would create. Apply runs under the per-owner advisory lock and requires BOTH
// observation ids named explicitly, the expected deployed SHA (== runtime SHA),
// an authorization reference and the immediately preceding dry run's facts. It
// writes only the two canonical workouts (+ coexistence patch), the two
// observations' own reconciliation, and one fixed audit row; a replay is the
// explicit no-op `already_repaired`. It never creates a link, a claim, a Logger
// session, Evidence, a briefing or a Confidence artifact, and never touches a
// policy, Activity totals, or strategic eligibility.
import { createRequire } from "node:module";
import { runHealthKitUnsupportedWorkoutTypeRepair } from "../../src/platform/operations/HealthKitUnsupportedWorkoutTypeRepairRunner.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const OBSERVATION_IDS = typeof __OBSERVATION_IDS__ === "undefined" ? "" : __OBSERVATION_IDS__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("REPAIR_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,40}$/.test(String(error?.code ?? "")) ? String(error.code) : "REPAIR_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
const observationIds = OBSERVATION_IDS.split(",").map((value) => value.trim()).filter(Boolean);
if (OBSERVATION_IDS && observationIds.length !== 2) stop("OBSERVATION_IDS_INVALID");
if (MODE === "apply" && observationIds.length !== 2) stop("OBSERVATION_IDS_REQUIRED");
if (MODE === "apply" && !AUTHORIZATION_REFERENCE.trim()) stop("AUTHORIZATION_REFERENCE_REQUIRED");
if (MODE === "apply" && !EXPECTED_JSON) stop("EXPECTED_FACTS_REQUIRED");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
const RUNTIME_SHA = String(process.env.PHYSIQUEOS_GIT_SHA ?? "");
if (RUNTIME_SHA !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
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
  application_name: "physiqueos-healthkit-unsupported-workout-repair",
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
  result = await runHealthKitUnsupportedWorkoutTypeRepair({
    records,
    authorization: {
      ownerUserId: OWNER,
      observationIds: observationIds.length === 2 ? observationIds : null,
      authorizationReference: AUTHORIZATION_REFERENCE,
    },
    deployment: { expectedSha: EXPECTED_GIT_SHA, runtimeSha: RUNTIME_SHA },
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
if (failure || !result) stop(failure ?? "REPAIR_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_JSON:${JSON.stringify({ mode: MODE, authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
const acceptable = MODE === "apply" ? ["applied", "already_repaired"] : ["dry_run", "already_repaired"];
if (!acceptable.includes(result.outcome)) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);
