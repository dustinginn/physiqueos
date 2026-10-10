// Shared gates for the October 9 DEXA Event presentation republication
// payloads (dexaPresentationRepublication.readonly.entry.mjs and
// dexaPresentationRepublication.apply.entry.mjs). Identity gates run before any
// database access; the pool is one bounded, verified-TLS connection.
import { createRequire } from "node:module";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
export const MODE = typeof __MODE__ === "undefined" ? "preview" : __MODE__;
export const AUTHORIZATION_REFERENCE = typeof __AUTHORIZATION_REFERENCE__ === "undefined" ? "" : __AUTHORIZATION_REFERENCE__;
export const SEAL = typeof __SEAL__ === "undefined" ? null : __SEAL__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_DEXA_PRESENTATION_REPUBLICATION_SUCCESS" : __MARKER__;
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);

export function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_DEXA_PRESENTATION_REPUBLICATION_FAILED:${code}\n`);
  process.exit(status);
}
export const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,60}$/.test(String(error?.code ?? "")) ? String(error.code) : "REPUBLICATION_ERROR");

/** Gates, then one bounded pool. `modes` are the modes this entry may run. */
export function openGatedRuntime(modes) {
  if (!modes.includes(MODE)) stop("MODE_INVALID");
  if (MODE === "apply" && !AUTHORIZATION_REFERENCE.trim()) stop("AUTHORIZATION_REFERENCE_REQUIRED");
  if ((MODE === "apply" || MODE === "postflight") && !SEAL?.sealDigest) stop("SEAL_REQUIRED");
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
  if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
  const owner = String(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? "").trim();
  if (!owner) stop("OWNER_MISSING");
  const authorityEnvironment = String(process.env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT ?? "").trim();
  if (!authorityEnvironment) stop("RUNTIME_AUTHORITY_ENVIRONMENT_MISSING");
  const migrationOperationId = process.env.PHYSIQUEOS_MIGRATION_OPERATION_ID ?? null;
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
    application_name: "physiqueos-dexa-presentation-republication",
    statement_timeout: 20_000,
    idle_in_transaction_session_timeout: 45_000,
    connectionTimeoutMillis: 8_000,
  });
  pool.on("error", () => {});
  return { owner, authorityEnvironment, migrationOperationId, pool };
}

/**
 * Runs `work` in its own process-level watchdog, closes the pool, then prints
 * the result and the success marker. The result can carry real identifiers
 * and scan values for the operator's local review and apply build: it is
 * captured only in local operator scratch and must never be published.
 */
export async function runAndReport(pool, work) {
  const watchdog = setTimeout(() => stop("REPUBLICATION_TIMEOUT", 3), 60_000);
  let failure = null;
  let result = null;
  try {
    result = await work();
  } catch (error) {
    failure = sanitizedCode(error);
  } finally {
    try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
    clearTimeout(watchdog);
  }
  if (failure || !result) stop(failure ?? "REPUBLICATION_INCOMPLETE");
  process.stdout.write(`PHYSIQUEOS_DEXA_PRESENTATION_REPUBLICATION_JSON:${JSON.stringify({ authorizationReference: AUTHORIZATION_REFERENCE || null, ...result })}\n`);
  process.stdout.write(`${MARKER}\n`);
}
