import { createHash } from "node:crypto";

export const APPROVED_READ_CONTEXT = "physiqueos-final-cutover-config";
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
export const MAX_CONSOLE_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_SANITIZED_REPORT_BYTES = 64 * 1024;

const SAFE_MARKER = /^[A-Za-z0-9_.:-]{16,160}$/;
const SAFE_SHA = /^[a-f0-9]{40}$/;
const SAFE_APPLICATION_NAME = /^[a-z0-9][a-z0-9-]{2,62}$/;
const FORBIDDEN_CONTEXT = /(?:deploy|migration|migrate|write)/i;
const FORBIDDEN_SQL = /\b(?:insert|update|delete|merge|upsert|alter|create|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|reindex|cluster|comment|lock|set|reset|listen|notify|unlisten|discard|prepare|execute|deallocate)\b/i;
const SIDE_EFFECTING_SELECT = /\b(?:nextval|setval|pg_advisory|pg_notify|dblink|lo_(?:create|import|export|unlink)|set_config)\s*\(/i;
const CREDENTIAL_SHAPE = /(?:postgres(?:ql)?:\/\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|-----BEGIN CERTIFICATE-----|\bBearer\s+[A-Za-z0-9._~-]+|\bdop_v1_[A-Za-z0-9]+|\bdoo_v1_[A-Za-z0-9]+)/i;
const STRUCTURED_BEGIN = "__PHYSIQUEOS_STRUCTURED_BEGIN__";
const STRUCTURED_END = "__PHYSIQUEOS_STRUCTURED_END__";

export function assertApprovedReadContext(context) {
  if (context !== APPROVED_READ_CONTEXT || FORBIDDEN_CONTEXT.test(String(context))) {
    throw coded("DOCTL_CONTEXT_NOT_APPROVED");
  }
  return context;
}

export function assertSelectOnlySql(text) {
  const sql = String(text ?? "").trim();
  if (!/^select\b/i.test(sql)) throw coded("SQL_NOT_SELECT_ONLY");
  if (/;\s*\S/.test(sql.replace(/;\s*$/, "")) || (sql.match(/;/g) ?? []).length > 1) {
    throw coded("SQL_MULTIPLE_STATEMENTS");
  }
  if (FORBIDDEN_SQL.test(sql) || SIDE_EFFECTING_SELECT.test(sql)) {
    throw coded("SQL_FORBIDDEN_OPERATION");
  }
  return sql.replace(/;\s*$/, "");
}

export function validateSanitizedConsoleOutput(output, { marker, maxBytes = MAX_CONSOLE_OUTPUT_BYTES } = {}) {
  if (!SAFE_MARKER.test(marker ?? "")) throw coded("AUDIT_SUCCESS_MARKER_INVALID");
  const raw = reassembleConsoleOutput(output);
  if (Buffer.byteLength(raw) > maxBytes) throw coded("AUDIT_OUTPUT_TOO_LARGE");
  if (CREDENTIAL_SHAPE.test(raw)) throw coded("AUDIT_OUTPUT_CREDENTIAL_SHAPE");
  const text = normalizePtyOutput(raw);
  const markerCount = text.split("\n").filter((line) => line === marker).length;
  if (markerCount !== 1) throw coded("AUDIT_SUCCESS_MARKER_MISSING");
  return raw;
}

export function parseFramedJson(output, prefix, { marker, maxBytes = MAX_SANITIZED_REPORT_BYTES } = {}) {
  if (!/^[A-Z0-9_]{12,120}$/.test(prefix ?? "")) throw coded("AUDIT_OUTPUT_PREFIX_INVALID");
  if (!SAFE_MARKER.test(marker ?? "")) throw coded("AUDIT_SUCCESS_MARKER_INVALID");
  const text = normalizePtyOutput(reassembleConsoleOutput(output));
  const lines = text.split("\n");
  const beginPattern = new RegExp(`^${STRUCTURED_BEGIN}:${prefix}:(\\d{1,8})$`);
  const endLine = `${STRUCTURED_END}:${prefix}`;
  const begins = lines.map((line, index) => ({ index, match: line.match(beginPattern) })).filter((entry) => entry.match);
  const ends = lines.map((line, index) => ({ index, line })).filter((entry) => entry.line === endLine);
  if (begins.length === 0 || ends.length === 0) throw coded("AUDIT_JSON_MISSING");
  if (begins.length !== 1 || ends.length !== 1) throw coded("AUDIT_JSON_DUPLICATE");
  const begin = begins[0];
  const end = ends[0];
  if (end.index <= begin.index + 1) throw coded("AUDIT_JSON_FRAME_INVALID");
  const encodedLines = lines.slice(begin.index + 1, end.index);
  if (encodedLines.some((line) => !/^[A-Za-z0-9+/]+={0,2}$/.test(line))) throw coded("AUDIT_JSON_FRAME_INVALID");
  const encoded = encodedLines.join("");
  const declaredLength = Number(begin.match[1]);
  if (encoded.length !== declaredLength || encoded.length % 4 !== 0 || Buffer.from(encoded, "base64").toString("base64") !== encoded) {
    throw coded("AUDIT_JSON_FRAME_INVALID");
  }
  const raw = Buffer.from(encoded, "base64").toString("utf8");
  if (Buffer.byteLength(raw) > maxBytes) throw coded("AUDIT_JSON_TOO_LARGE");
  if (CREDENTIAL_SHAPE.test(raw)) throw coded("AUDIT_OUTPUT_CREDENTIAL_SHAPE");
  let value;
  try { value = JSON.parse(raw); } catch { throw coded("AUDIT_JSON_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw coded("AUDIT_JSON_INVALID");
  const outside = [...lines.slice(0, begin.index), ...lines.slice(end.index + 1)];
  if (outside.filter((line) => line === marker).length !== 1 || outside.some((line) => !isAllowedPtyFramingLine(line, marker))) {
    throw coded("AUDIT_OUTPUT_UNEXPECTED");
  }
  return value;
}

export function normalizePtyOutput(output) {
  const stripped = stripTerminalSequences(String(output ?? ""));
  let normalized = "";
  let line = "";
  for (let index = 0; index < stripped.length; index += 1) {
    const character = stripped[index];
    const code = stripped.charCodeAt(index);
    if (character === "\r") {
      if (stripped[index + 1] === "\n") {
        normalized += `${line}\n`;
        line = "";
        index += 1;
      } else {
        line = "";
      }
    } else if (character === "\n") {
      normalized += `${line}\n`;
      line = "";
    } else if (character === "\b") {
      line = line.slice(0, -1);
    } else if (character === "\t" || code >= 0x20) {
      line += character;
    } else {
      throw coded("AUDIT_OUTPUT_CONTROL_CHARACTER");
    }
  }
  return normalized + line;
}

export function reassembleConsoleOutput(output) {
  if (Array.isArray(output)) return output.map((chunk) => String(chunk)).join("");
  return String(output ?? "");
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function buildGuardedReadOnlyPayload({
  marker,
  outputPrefix,
  expectedGitSha,
  applicationName,
  auditBody,
  allowedReportKeys,
  ownerUserId = null,
  statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS,
  maximumRows = 200,
} = {}) {
  if (!SAFE_MARKER.test(marker ?? "")) throw coded("AUDIT_SUCCESS_MARKER_INVALID");
  if (!/^[A-Z0-9_]{12,120}$/.test(outputPrefix ?? "")) throw coded("AUDIT_OUTPUT_PREFIX_INVALID");
  if (!SAFE_SHA.test(expectedGitSha ?? "")) throw coded("EXPECTED_GIT_SHA_INVALID");
  if (!SAFE_APPLICATION_NAME.test(applicationName ?? "")) throw coded("AUDIT_APPLICATION_NAME_INVALID");
  if (typeof auditBody !== "string" || !auditBody.trim()) throw coded("AUDIT_BODY_INVALID");
  if (!Array.isArray(allowedReportKeys) || allowedReportKeys.length === 0 ||
      allowedReportKeys.some((key) => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))) {
    throw coded("AUDIT_REPORT_SCHEMA_INVALID");
  }
  if (ownerUserId !== null && (typeof ownerUserId !== "string" || ownerUserId.length < 4 || ownerUserId.length > 128)) {
    throw coded("AUDIT_OWNER_INVALID");
  }
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1_000 || statementTimeoutMs > 60_000) {
    throw coded("AUDIT_STATEMENT_TIMEOUT_INVALID");
  }
  if (!Number.isInteger(maximumRows) || maximumRows < 1 || maximumRows > 500) throw coded("AUDIT_ROW_BOUND_INVALID");

  const configuration = JSON.stringify({
    marker,
    outputPrefix,
    expectedGitSha,
    applicationName,
    auditBody,
    allowedReportKeys,
    ownerUserId,
    statementTimeoutMs,
    maximumRows,
    maximumReportBytes: MAX_SANITIZED_REPORT_BYTES,
  });

  return `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}
import { createRequire } from "node:module";

const CONFIG = Object.freeze(${configuration});
const SSL_KEYS = ["sslmode", "sslcert", "sslkey", "sslrootcert", "sslcrl"];
const FORBIDDEN_SQL = /\\b(?:insert|update|delete|merge|upsert|alter|create|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|reindex|cluster|comment|lock|set|reset|listen|notify|unlisten|discard|prepare|execute|deallocate)\\b/i;
const SIDE_EFFECTING_SELECT = /\\b(?:nextval|setval|pg_advisory|pg_notify|dblink|lo_(?:create|import|export|unlink)|set_config)\\s*\\(/i;
const CREDENTIAL_SHAPE = /(?:postgres(?:ql)?:\\/\\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|-----BEGIN CERTIFICATE-----|\\bBearer\\s+[A-Za-z0-9._~-]+|\\bdop_v1_[A-Za-z0-9]+|\\bdoo_v1_[A-Za-z0-9]+)/i;

function fail(code) { return String(code ?? "AUDIT_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120); }
function requireValue(condition, code) { if (!condition) throw Object.assign(new Error(code), { code }); }
function selectOnly(text) {
  const sql = String(text ?? "").trim();
  requireValue(/^select\\b/i.test(sql), "SQL_NOT_SELECT_ONLY");
  requireValue(!/;\\s*\\S/.test(sql.replace(/;\\s*$/, "")) && (sql.match(/;/g) ?? []).length <= 1, "SQL_MULTIPLE_STATEMENTS");
  requireValue(!FORBIDDEN_SQL.test(sql) && !SIDE_EFFECTING_SELECT.test(sql), "SQL_FORBIDDEN_OPERATION");
  return sql.replace(/;\\s*$/, "");
}
function validateReport(report, forbiddenValues) {
  requireValue(report && typeof report === "object" && !Array.isArray(report), "REPORT_INVALID");
  const keys = Object.keys(report).sort();
  const expected = [...CONFIG.allowedReportKeys].sort();
  requireValue(JSON.stringify(keys) === JSON.stringify(expected), "REPORT_SCHEMA_MISMATCH");
  const json = JSON.stringify(report);
  requireValue(Buffer.byteLength(json) <= CONFIG.maximumReportBytes, "REPORT_TOO_LARGE");
  requireValue(!CREDENTIAL_SHAPE.test(json), "REPORT_CREDENTIAL_SHAPE");
  for (const value of forbiddenValues) requireValue(!value || !json.includes(value), "REPORT_FORBIDDEN_VALUE");
  return json;
}

let failure = null;
let report = null;
let client = null;
let transactionOpen = false;
let transactionReadOnly = null;
let rolledBack = false;
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
const bindingPresence = Object.freeze({ databaseUrl: Boolean(rawUrl), databaseCa: certificate.includes("-----BEGIN CERTIFICATE-----") });
let pool = null;
try {
  requireValue(String(process.env.PHYSIQUEOS_GIT_SHA ?? "") === CONFIG.expectedGitSha, "RUNTIME_SHA_MISMATCH");
  if (CONFIG.ownerUserId !== null) requireValue(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID === CONFIG.ownerUserId, "OWNER_SCOPE_MISMATCH");
  requireValue(bindingPresence.databaseUrl, "DATABASE_BINDING_MISSING");
  requireValue(bindingPresence.databaseCa, "DATABASE_CA_MISSING");
  const url = new URL(rawUrl);
  for (const key of SSL_KEYS) url.searchParams.delete(key);
  const pg = createRequire(process.cwd() + "/package.json")("pg");
  pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: { ca: certificate, rejectUnauthorized: true },
    max: 1,
    application_name: CONFIG.applicationName,
    statement_timeout: CONFIG.statementTimeoutMs,
    idle_in_transaction_session_timeout: CONFIG.statementTimeoutMs * 2,
    connectionTimeoutMillis: 8_000,
  });
  pool.on("error", () => {});
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  transactionOpen = true;
  transactionReadOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only ?? null;
  requireValue(transactionReadOnly === "on", "TRANSACTION_NOT_READ_ONLY");
  const select = async (text, values = [], options = {}) => {
    const sql = selectOnly(text);
    requireValue(Array.isArray(values), "SQL_VALUES_INVALID");
    const maxRows = Number(options.maxRows ?? CONFIG.maximumRows);
    requireValue(Number.isInteger(maxRows) && maxRows >= 1 && maxRows <= CONFIG.maximumRows, "SQL_ROW_BOUND_INVALID");
    const result = await client.query(sql, values);
    requireValue(result.command === "SELECT", "SQL_COMMAND_NOT_SELECT");
    requireValue(result.rows.length <= maxRows, "SQL_ROW_BOUND_EXCEEDED");
    return result.rows;
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const audit = new AsyncFunction("select", "ownerUserId", "bindingPresence", "transactionReadOnly", CONFIG.auditBody);
  report = await audit(select, CONFIG.ownerUserId, bindingPresence, transactionReadOnly);
  await client.query("ROLLBACK");
  transactionOpen = false;
  rolledBack = true;
} catch (error) {
  failure = fail(error?.code ?? error?.message ?? "AUDIT_FAILED");
} finally {
  if (transactionOpen && client) {
    try { await client.query("ROLLBACK"); transactionOpen = false; } catch { failure ??= "ROLLBACK_FAILED"; }
  }
  try { client?.release(); } catch { failure ??= "CLIENT_RELEASE_FAILED"; }
  try { await pool?.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
}

if (!rolledBack && !failure) failure = "ROLLBACK_NOT_VERIFIED";
if (failure || !report) {
  process.stderr.write("PHYSIQUEOS_AUDIT_FAILED:" + fail(failure ?? "AUDIT_INCOMPLETE") + "\\n");
  process.exitCode = 1;
} else {
  try {
    const json = validateReport(report, [rawUrl, certificate, CONFIG.ownerUserId]);
    const encoded = Buffer.from(json).toString("base64");
    process.stdout.write("${STRUCTURED_BEGIN}:" + CONFIG.outputPrefix + ":" + encoded.length + "\\n");
    process.stdout.write(encoded + "\\n");
    process.stdout.write("${STRUCTURED_END}:" + CONFIG.outputPrefix + "\\n");
    process.stdout.write(CONFIG.marker + "\\n");
  } catch (error) {
    process.stderr.write("PHYSIQUEOS_AUDIT_FAILED:" + fail(error?.code ?? error?.message) + "\\n");
    process.exitCode = 1;
  }
}

`;
}

function stripTerminalSequences(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 0x1b) {
      output += value[index];
      continue;
    }
    const next = value[index + 1];
    if (next === "[") {
      index += 2;
      while (index < value.length && !(value.charCodeAt(index) >= 0x40 && value.charCodeAt(index) <= 0x7e)) index += 1;
      if (index >= value.length) throw coded("AUDIT_OUTPUT_ANSI_INCOMPLETE");
    } else if (next === "]") {
      index += 2;
      let terminated = false;
      for (; index < value.length; index += 1) {
        if (value.charCodeAt(index) === 0x07) { terminated = true; break; }
        if (value.charCodeAt(index) === 0x1b && value[index + 1] === "\\") { index += 1; terminated = true; break; }
      }
      if (!terminated) throw coded("AUDIT_OUTPUT_ANSI_INCOMPLETE");
    } else if (next && next.charCodeAt(0) >= 0x40 && next.charCodeAt(0) <= 0x5f) {
      index += 1;
    } else {
      throw coded("AUDIT_OUTPUT_ANSI_INVALID");
    }
  }
  return output;
}

function isAllowedPtyFramingLine(line, marker) {
  if (line === "" || line === marker || /^__PHYSIQUEOS_REMOTE_EXIT__:0$/.test(line)) return true;
  if (/^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9._-]+:[^\n]{0,180}[#$>] ?$/.test(line)) return true;
  if (/^[#$>] ?$/.test(line)) return true;
  if (/^(?:Connecting(?: to)?|Connected(?: to)?|Welcome|Last login:)[^\n]{0,180}$/i.test(line)) return true;
  if (new Set(["stty -echo", "exit"]).has(line)) return true;
  return false;
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}
