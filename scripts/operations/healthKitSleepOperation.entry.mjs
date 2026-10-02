// Bounded HealthKit Sleep production operation: the guarded Sleep policy runner
// (activate-prospective | deactivate-prospective | set-source-preference |
// open-historical-validation | close-historical-validation), the zero-write
// Sleep audit (dormancy | historical-shape), and the bounded prospective-only
// sleep-canon-v3 activation (canon-v3: dry-run | apply).
//
// Transported into the App Platform `web` component by the accepted console runner
// (bundled by buildHealthKitPayload.mjs --kind sleep-policy|sleep-audit). Same contract as
// healthKitActivationPolicy.entry.mjs: identity gates before any database access, one
// bounded connection, owner scoping, explicit transaction fencing, no secrets printed,
// success marker only after a clean COMMIT (apply) or ROLLBACK (dry-run / audit).
//
//   audit / dry-run  BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, transaction_read_only
//                    must be `on`, writes nothing, ROLLBACK.
//   apply            Requires an authorization reference and the `expected` facts of the
//                    immediately preceding dry run (baked in at build time). One READ COMMITTED
//                    transaction under the owner advisory lock.
//
// Executing this is a separate, explicitly authorized act. Nothing here runs it.
import { createRequire } from "node:module";
import { runHealthKitSleepPolicy } from "../../src/platform/operations/HealthKitSleepPolicyRunner.js";
import { auditHealthKitSleep } from "../../src/platform/operations/HealthKitSleepAudit.js";
import { runHealthKitSleepCanonV3Activation } from "../../src/platform/operations/HealthKitSleepCanonV3Activation.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const OPERATION = typeof __OPERATION__ === "undefined" ? "" : __OPERATION__; // "policy" | "audit" | "canon-v3"
const MAX_DAYS = typeof __MAX_DAYS__ === "undefined" ? 7 : __MAX_DAYS__;
const MODE = typeof __MODE__ === "undefined" ? "dry-run" : __MODE__;
const ACTION = typeof __ACTION__ === "undefined" ? "" : __ACTION__;
const AUDIT_KIND = typeof __AUDIT_KIND__ === "undefined" ? "dormancy" : __AUDIT_KIND__;
const EFFECTIVE = typeof __EFFECTIVE__ === "undefined" ? "" : __EFFECTIVE__;
const TIME_ZONE = typeof __TIME_ZONE__ === "undefined" ? "America/Los_Angeles" : __TIME_ZONE__;
const SLEEP_MODE = typeof __SLEEP_MODE__ === "undefined" ? "validation_only" : __SLEEP_MODE__;
const FAMILIES = typeof __FAMILIES__ === "undefined" ? "oura" : __FAMILIES__;
const HISTORICAL_DAYS = typeof __HISTORICAL_DAYS__ === "undefined" ? 30 : __HISTORICAL_DAYS__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const EXPECTED_JSON = typeof __EXPECTED_JSON__ === "undefined" ? "" : __EXPECTED_JSON__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_SLEEP_OPERATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("SLEEP_OPERATION_TIMEOUT", 3), 90_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_SLEEP_OPERATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "SLEEP_OPERATION_ERROR");

if (!["policy", "audit", "canon-v3"].includes(OPERATION)) stop("OPERATION_INVALID");
if (OPERATION === "audit" && MODE !== "dry-run") stop("AUDIT_IS_READ_ONLY");
if (!["dry-run", "apply"].includes(MODE)) stop("MODE_INVALID");
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
  application_name: "physiqueos-healthkit-sleep-operation",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  connectionTimeoutMillis: 8_000,
});
pool.on("error", () => {});

let client;
let open = false;
let failure = null;
let result = null;
const apply = (OPERATION === "policy" || OPERATION === "canon-v3") && MODE === "apply";
try {
  client = await pool.connect();
  await client.query(apply ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  if (!apply) {
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  } else {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${OWNER}`]);
  }
  const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
  result = OPERATION === "audit"
    ? await auditHealthKitSleep({ records, ownerUserId: OWNER, kind: AUDIT_KIND })
    : OPERATION === "canon-v3"
      ? await runHealthKitSleepCanonV3Activation({
        records,
        authorization: {
          ownerUserId: OWNER,
          effectiveSleepDay: EFFECTIVE,
          maxDays: Number(MAX_DAYS),
          authorizationReference: AUTHORIZATION_REFERENCE,
        },
        apply,
        expected,
      })
      : await runHealthKitSleepPolicy({
      records,
      authorization: {
        ownerUserId: OWNER,
        effectiveSleepDay: EFFECTIVE || undefined,
        timeZone: TIME_ZONE,
        mode: SLEEP_MODE,
        preferredSourceFamilies: FAMILIES.split(",").filter(Boolean),
        historicalDays: Number(HISTORICAL_DAYS),
        authorizationReference: AUTHORIZATION_REFERENCE,
      },
      action: ACTION,
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
if (failure || !result) stop(failure ?? "SLEEP_OPERATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_SLEEP_OPERATION_JSON:${JSON.stringify({ operation: OPERATION, mode: MODE, action: ACTION || null, auditKind: OPERATION === "audit" ? AUDIT_KIND : null, ...result })}\n`);
if (OPERATION === "policy" || OPERATION === "canon-v3") {
  const acceptable = MODE === "apply" ? ["applied", "already_applied"] : ["dry_run", "already_applied"];
  if (!acceptable.includes(result.outcome)) stop(`OUTCOME_${String(result.outcome).toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, 2);
}
process.stdout.write(`${MARKER}\n`);
