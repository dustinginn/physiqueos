// Guarded recovery of the October 9 2026 DEXA confirmation continuation.
//
// Transported into the App Platform `web` component by the accepted console
// runner (bundled to one file by buildDexaContinuationRecoveryPayload.mjs). It
// follows the production-operations contract: identity gates before database
// access, one bounded connection, owner scoping, explicit transaction fencing,
// no secrets or media printed, and a success marker only after a clean
// ROLLBACK (preview, postflight) or COMMIT (apply).
//
//   preview     BEGIN REPEATABLE READ READ ONLY; transaction_read_only must be on.
//               Plans the single continuation insert and prints the seal. Writes nothing.
//   apply       Requires a Founder authorization reference AND the sealed preview,
//               both baked in at build time. READ COMMITTED, owner runtime lock,
//               locked re-read, re-plan with the sealed message id; the seal must
//               match exactly or nothing is written. One INSERT, COMMIT.
//   postflight  Read-only verification of where the resumed review is and, once
//               confirmed, of every expected effect against the seal.
//
// Executing any mode against production is a separate, explicitly authorized act.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  loadDexaContinuationRecoveryFacts,
  runDexaContinuationRecovery,
  verifyDexaContinuationRecoveryPostflight,
} from "../../src/platform/operations/DexaContinuationRecovery.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const MODE = typeof __MODE__ === "undefined" ? "preview" : __MODE__;
const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
const SEAL = typeof __SEAL__ === "undefined" ? null : __SEAL__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_DEXA_CONTINUATION_RECOVERY_SUCCESS" : __MARKER__;
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("RECOVERY_TIMEOUT", 3), 60_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_DEXA_CONTINUATION_RECOVERY_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "RECOVERY_ERROR");

if (!["preview", "apply", "postflight"].includes(MODE)) stop("MODE_INVALID");
if (MODE === "apply" && !AUTHORIZATION_REFERENCE.trim()) stop("AUTHORIZATION_REFERENCE_REQUIRED");
if ((MODE === "apply" || MODE === "postflight") && !SEAL?.sealDigest) stop("SEAL_REQUIRED");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
const OWNER = String(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? "").trim();
if (!OWNER) stop("OWNER_MISSING");
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
  application_name: "physiqueos-dexa-continuation-recovery",
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
    // The same owner lock every canonical review and runtime mutation takes.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`physiqueos:${OWNER}`]);
  }
  const query = (text, values) => client.query(text, values);
  if (MODE === "postflight") {
    const facts = await loadDexaContinuationRecoveryFacts({ query, ownerUserId: OWNER });
    result = { mode: MODE, ...verifyDexaContinuationRecoveryPostflight({ facts, seal: SEAL, ownerUserId: OWNER }) };
  } else {
    result = await runDexaContinuationRecovery({
      query, ownerUserId: OWNER, mode: MODE, seal: SEAL,
      authorizationReference: AUTHORIZATION_REFERENCE, createId: randomUUID,
    });
  }
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
// The preview's seal carries real identifiers for the operator's local apply
// build. It is printed here, captured only in local operator scratch, and must
// never be published.
process.stdout.write(`PHYSIQUEOS_DEXA_CONTINUATION_RECOVERY_JSON:${JSON.stringify({ authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
process.stdout.write(`${MARKER}\n`);
