import fs from "node:fs/promises";
import path from "node:path";

const FIELDS = Object.freeze([
  "schemaVersion", "authorized", "runId", "step", "expectedCoordinatorVersion",
  "authorizationId", "authorizedAt", "expiresAt", "priorStateDigest",
]);

/** Loads one non-secret Founder decision from a fixed directory; callers cannot supply a path. */
export function createProductionCoordinatorAuthorizationProvider({ authorizationRoot, maximumBytes = 32 * 1024 } = {}) {
  const root = path.resolve(required(authorizationRoot, "authorizationRoot"));
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1024 || maximumBytes > 128 * 1024) throw new Error("Authorization maximumBytes is invalid.");
  return Object.freeze({ loadAuthorization });

  async function loadAuthorization({ authorizationRef, runId, step, expectedCoordinatorVersion } = {}) {
    const reference = required(authorizationRef, "authorizationRef");
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(reference)) throw authError("PHASE7B_AUTHORIZATION_REFERENCE_INVALID", "Authorization reference is invalid.");
    const file = path.resolve(root, `${reference}.json`);
    if (path.dirname(file) !== root) throw authError("PHASE7B_AUTHORIZATION_REFERENCE_INVALID", "Authorization reference escaped its fixed root.");
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size < 2 || stat.size > maximumBytes) throw authError("PHASE7B_AUTHORIZATION_RECORD_INVALID", "Authorization record size/type is invalid.");
    const bytes = await fs.readFile(file);
    if (bytes.length !== stat.size || bytes.includes(0)) throw authError("PHASE7B_AUTHORIZATION_RECORD_INVALID", "Authorization record changed or contains invalid bytes.");
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { throw authError("PHASE7B_AUTHORIZATION_RECORD_INVALID", "Authorization record is not valid JSON."); }
    if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1 || Object.keys(value).some((key) => !FIELDS.includes(key))) {
      throw authError("PHASE7B_AUTHORIZATION_RECORD_INVALID", "Authorization record has an unsupported shape.");
    }
    if (value.authorized !== true || value.runId !== runId || value.step !== step || Number(value.expectedCoordinatorVersion) !== Number(expectedCoordinatorVersion)) {
      throw authError("PHASE7B_AUTHORIZATION_IDENTITY_MISMATCH", "Authorization record does not match the exact run, step, and coordinator version.");
    }
    for (const field of ["authorizationId", "authorizedAt", "expiresAt", "priorStateDigest"]) required(value[field], field);
    return Object.freeze(Object.fromEntries(FIELDS.filter((field) => field !== "schemaVersion").map((field) => [field, value[field]])));
  }
}

function required(value, field) { if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw authError("PHASE7B_AUTHORIZATION_INPUT_INVALID", `${field} is required without surrounding whitespace.`); return value; }
function authError(code, message) { return Object.assign(new Error(message), { code }); }
