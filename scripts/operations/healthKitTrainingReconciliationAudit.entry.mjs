// Zero-write same-event Training reconciliation audit (one local date).
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled by buildHealthKitPayload.mjs --kind training-audit). Contract: identity gates before any
// database access, one bounded connection, BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, SHOW
// transaction_read_only must be `on`, owner-scoped reads only, explicit ROLLBACK, success marker only
// after a successful rollback. Output carries hashed identifiers, counts, enum states and presence
// booleans only -- never exercise names, loads, notes, or telemetry values.
import { createRequire } from "node:module";
import { summarizeHealthKitTrainingReconciliation } from "../../src/platform/operations/HealthKitTrainingReconciliationAudit.js";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const LOCAL_DATE = typeof __START__ === "undefined" ? "" : __START__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_TRAINING_AUDIT_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("AUDIT_TIMEOUT", 3), 150_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_TRAINING_AUDIT_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,40}$/.test(String(error?.code ?? "")) ? String(error.code) : "AUDIT_ERROR");

if (!/^\d{4}-\d{2}-\d{2}$/.test(LOCAL_DATE)) stop("DATE_INVALID");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
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
  application_name: "physiqueos-healthkit-training-reconciliation-audit",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  connectionTimeoutMillis: 8_000,
});
pool.on("error", () => {});

let client;
let open = false;
let failure = null;
let report = null;
try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
  if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
  const list = (collection) => records.list({ ownerUserId: OWNER, collection });
  const [canonicalEvidenceObjects, evidenceReviews, evidencePackages, trainingPerformanceEvents, canonicalWorkouts, links, claims] = await Promise.all([
    list("canonicalEvidenceObjects"), list("evidenceReviews"), list("evidencePackages"), list("trainingPerformanceEvents"),
    list("healthKitCanonicalWorkouts"), list("healthKitWorkoutLinks"), list("healthKitWorkoutLinkClaims"),
  ]);
  const summary = summarizeHealthKitTrainingReconciliation({
    canonicalEvidenceObjects, evidenceReviews, evidencePackages, trainingPerformanceEvents, canonicalWorkouts, links, claims, localDate: LOCAL_DATE,
  });
  await client.query("ROLLBACK");
  open = false;
  report = { runtime: { gitSha: String(process.env.PHYSIQUEOS_GIT_SHA), buildId: String(process.env.PHYSIQUEOS_BUILD_ID ?? "") }, summary };
} catch (error) {
  failure = sanitizedCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !report) stop(failure ?? "AUDIT_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_TRAINING_AUDIT_JSON:${JSON.stringify(report)}\n`);
process.stdout.write(`${MARKER}\n`);
