// Bounded HealthKit canonical activation-policy operation (activate | deactivate).
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
import { runHealthKitActivationPolicy } from "../../src/platform/operations/HealthKitActivationPolicyRunner.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const ACTION = typeof __ACTION__ === "undefined" ? "" : __ACTION__;
const POLICY_KIND = typeof __POLICY_KIND__ === "undefined" ? "daily" : __POLICY_KIND__;
const DOMAINS = typeof __DOMAINS__ === "undefined" ? "" : __DOMAINS__;
const EFFECTIVE = typeof __EFFECTIVE__ === "undefined" ? "" : __EFFECTIVE__;
const END = typeof __END__ === "undefined" ? "" : __END__;
const OPEN_ENDED = typeof __OPEN_ENDED__ === "undefined" ? false : __OPEN_ENDED__;
// Workout policy only: comma-separated family scope (e.g. "strength"). Empty
// means the runner's default (every canonicalizable family).
const FAMILIES = typeof __FAMILIES__ === "undefined" ? "" : __FAMILIES__;
// The family restriction the authorization carries into the runner; absent
// means the runner's default (every canonicalizable family).
const AUTHORIZED_FAMILIES = FAMILIES ? FAMILIES.split(",").filter(Boolean) : undefined;
const LINK_AUTO_CONFIRM = typeof __LINK_AUTO_CONFIRM__ === "undefined" ? null : __LINK_AUTO_CONFIRM__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_ACTIVATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("ACTIVATION_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_ACTIVATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "ACTIVATION_ERROR");

if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
if (!["activate", "deactivate", "set-link-auto-confirm"].includes(ACTION)) stop("ACTION_INVALID");
if (!["daily", "workout"].includes(POLICY_KIND)) stop("POLICY_KIND_INVALID");
if (FAMILIES && POLICY_KIND !== "workout") stop("FAMILIES_NOT_SUPPORTED_FOR_POLICY_KIND");
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
  application_name: "physiqueos-healthkit-activation",
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
  result = await runHealthKitActivationPolicy({
    records,
    authorization: {
      ownerUserId: OWNER,
      domains: DOMAINS.split(",").filter(Boolean),
      effectiveLocalDate: EFFECTIVE,
      ...(OPEN_ENDED ? { openEnded: true } : { endLocalDate: END }),
      ...(AUTHORIZED_FAMILIES ? { families: AUTHORIZED_FAMILIES } : {}),
      ...(ACTION === "set-link-auto-confirm" ? { linkAutoConfirm: LINK_AUTO_CONFIRM } : {}),
      authorizationReference: AUTHORIZATION_REFERENCE,
    },
    action: ACTION,
    policyKind: POLICY_KIND,
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
if (failure || !result) stop(failure ?? "ACTIVATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_ACTIVATION_JSON:${JSON.stringify({ mode: MODE, action: ACTION, policyKind: POLICY_KIND, openEnded: OPEN_ENDED, families: FAMILIES || null, authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
// The success marker means the operation did what was asked: a dry run that
// planned, or an apply that committed. Refused, drifted, or otherwise
// rolled-back outcomes end non-zero with no marker.
const expectedOutcome = MODE === "apply" ? "applied" : "dry_run";
if (result.outcome !== expectedOutcome) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
process.stdout.write(`${MARKER}\n`);
