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
const DIAGNOSTIC_KEYS = Object.freeze([
  "ansiSequenceCount",
  "backspaceEventCount",
  "beginBeforeEnd",
  "beginContiguous",
  "beginSentinelCount",
  "carriageReturnEventCount",
  "chunkCount",
  "endBeforeMarker",
  "endContiguous",
  "endSentinelCount",
  "errorCode",
  "expectedFrameLinePosition",
  "markerOrderingValid",
  "normalizedByteCount",
  "normalizedLineCount",
  "parserStage",
  "rawByteCount",
  "successMarkerCount",
  "zeroExitMarkerCount",
]);
const DIAGNOSTIC_STAGES = new Set([
  "output_validation",
  "normalization",
  "sentinel_count",
  "frame_bounds",
  "frame_encoding",
  "json_parse",
  "outside_validation",
  "complete",
]);

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

export function validateSanitizedConsoleOutput(output, {
  marker,
  prefix = null,
  maxBytes = MAX_CONSOLE_OUTPUT_BYTES,
  structuralDiagnostics = false,
} = {}) {
  if (!SAFE_MARKER.test(marker ?? "")) throw coded("AUDIT_SUCCESS_MARKER_INVALID");
  const raw = reassembleConsoleOutput(output);
  if (Buffer.byteLength(raw) > maxBytes) throw diagnosticFailure("AUDIT_OUTPUT_TOO_LARGE", output, prefix, marker, "output_validation", structuralDiagnostics);
  if (CREDENTIAL_SHAPE.test(raw)) throw diagnosticFailure("AUDIT_OUTPUT_CREDENTIAL_SHAPE", output, prefix, marker, "output_validation", structuralDiagnostics);
  let text;
  try { text = normalizePtyOutput(raw); } catch (error) {
    throw diagnosticFailure(error?.code ?? "AUDIT_OUTPUT_NORMALIZATION_FAILED", output, prefix, marker, "normalization", structuralDiagnostics);
  }
  const markerCount = text.split("\n").filter((line) => line === marker).length;
  if (markerCount !== 1) throw diagnosticFailure("AUDIT_SUCCESS_MARKER_MISSING", output, prefix, marker, "output_validation", structuralDiagnostics);
  return raw;
}

export function parseFramedJson(output, prefix, {
  marker,
  maxBytes = MAX_SANITIZED_REPORT_BYTES,
  structuralDiagnostics = false,
} = {}) {
  if (!/^[A-Z0-9_]{12,120}$/.test(prefix ?? "")) throw coded("AUDIT_OUTPUT_PREFIX_INVALID");
  if (!SAFE_MARKER.test(marker ?? "")) throw coded("AUDIT_SUCCESS_MARKER_INVALID");
  let text;
  try { text = normalizePtyOutput(reassembleConsoleOutput(output)); } catch (error) {
    throw diagnosticFailure(error?.code ?? "AUDIT_OUTPUT_NORMALIZATION_FAILED", output, prefix, marker, "normalization", structuralDiagnostics);
  }
  const lines = text.split("\n");
  const beginPattern = new RegExp(`^${STRUCTURED_BEGIN}:${prefix}:(\\d{1,8})$`);
  const endLine = `${STRUCTURED_END}:${prefix}`;
  const begins = lines.map((line, index) => ({ index, match: line.match(beginPattern) })).filter((entry) => entry.match);
  const ends = lines.map((line, index) => ({ index, line })).filter((entry) => entry.line === endLine);
  if (begins.length === 0 || ends.length === 0) throw diagnosticFailure("AUDIT_JSON_MISSING", output, prefix, marker, "sentinel_count", structuralDiagnostics);
  if (begins.length !== 1 || ends.length !== 1) throw diagnosticFailure("AUDIT_JSON_DUPLICATE", output, prefix, marker, "sentinel_count", structuralDiagnostics);
  const begin = begins[0];
  const end = ends[0];
  if (end.index <= begin.index + 1) throw diagnosticFailure("AUDIT_JSON_FRAME_INVALID", output, prefix, marker, "frame_bounds", structuralDiagnostics);
  const encodedLines = lines.slice(begin.index + 1, end.index);
  if (encodedLines.some((line) => !/^[A-Za-z0-9+/]+={0,2}$/.test(line))) {
    throw diagnosticFailure("AUDIT_JSON_FRAME_INVALID", output, prefix, marker, "frame_encoding", structuralDiagnostics);
  }
  const encoded = encodedLines.join("");
  const declaredLength = Number(begin.match[1]);
  if (encoded.length !== declaredLength || encoded.length % 4 !== 0 || Buffer.from(encoded, "base64").toString("base64") !== encoded) {
    throw diagnosticFailure("AUDIT_JSON_FRAME_INVALID", output, prefix, marker, "frame_encoding", structuralDiagnostics);
  }
  const raw = Buffer.from(encoded, "base64").toString("utf8");
  if (Buffer.byteLength(raw) > maxBytes) throw diagnosticFailure("AUDIT_JSON_TOO_LARGE", output, prefix, marker, "frame_encoding", structuralDiagnostics);
  if (CREDENTIAL_SHAPE.test(raw)) throw diagnosticFailure("AUDIT_OUTPUT_CREDENTIAL_SHAPE", output, prefix, marker, "frame_encoding", structuralDiagnostics);
  let value;
  try { value = JSON.parse(raw); } catch { throw diagnosticFailure("AUDIT_JSON_INVALID", output, prefix, marker, "json_parse", structuralDiagnostics); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw diagnosticFailure("AUDIT_JSON_INVALID", output, prefix, marker, "json_parse", structuralDiagnostics);
  }
  const outside = [...lines.slice(0, begin.index), ...lines.slice(end.index + 1)];
  if (outside.filter((line) => line === marker).length !== 1 || outside.some((line) => !isAllowedPtyFramingLine(line, marker))) {
    throw diagnosticFailure("AUDIT_OUTPUT_UNEXPECTED", output, prefix, marker, "outside_validation", structuralDiagnostics);
  }
  return value;
}

export function collectStructuralDiagnostics(output, prefix, marker, {
  parserStage = "output_validation",
  errorCode = "AUDIT_DIAGNOSTIC",
} = {}) {
  const raw = reassembleConsoleOutput(output);
  const chunks = Array.isArray(output) ? output.length : 1;
  let normalized = "";
  let normalization = { ansiSequenceCount: 0, carriageReturnEventCount: 0, backspaceEventCount: 0 };
  try {
    const result = normalizePtyOutputWithStats(raw);
    normalized = result.text;
    normalization = result.stats;
  } catch {
    parserStage = "normalization";
  }
  const beginToken = `${STRUCTURED_BEGIN}:${prefix}:`;
  const endToken = `${STRUCTURED_END}:${prefix}`;
  const lines = normalized.split("\n");
  const beginIndexes = indexesMatching(lines, (line) => line.startsWith(beginToken));
  const exactBeginIndexes = indexesMatching(lines, (line) => new RegExp(`^${escapeRegExp(beginToken)}\\d{1,8}$`).test(line));
  const endIndexes = indexesMatching(lines, (line) => line === endToken);
  const markerIndexes = indexesMatching(lines, (line) => line === marker);
  const zeroExitIndexes = indexesMatching(lines, (line) => line === "__PHYSIQUEOS_REMOTE_EXIT__:0");
  const beginBeforeEnd = beginIndexes.length > 0 && endIndexes.length > 0 && beginIndexes[0] < endIndexes[0];
  const endBeforeMarker = endIndexes.length > 0 && markerIndexes.length > 0 && endIndexes[0] < markerIndexes[0];
  const diagnostics = {
    rawByteCount: boundedCount(Buffer.byteLength(raw)),
    normalizedByteCount: boundedCount(Buffer.byteLength(normalized)),
    chunkCount: boundedCount(chunks),
    normalizedLineCount: boundedCount(lines.length),
    beginSentinelCount: boundedCount(countOccurrences(normalized, beginToken)),
    endSentinelCount: boundedCount(countOccurrences(normalized, endToken)),
    successMarkerCount: boundedCount(markerIndexes.length),
    zeroExitMarkerCount: boundedCount(zeroExitIndexes.length),
    beginBeforeEnd,
    endBeforeMarker,
    markerOrderingValid: beginBeforeEnd && endBeforeMarker,
    beginContiguous: beginIndexes.length > 0 && beginIndexes.length === exactBeginIndexes.length,
    endContiguous: endIndexes.length === countOccurrences(normalized, endToken),
    expectedFrameLinePosition: exactBeginIndexes.length === 1 && endIndexes.length === 1 && endIndexes[0] === exactBeginIndexes[0] + 2,
    ansiSequenceCount: boundedCount(normalization.ansiSequenceCount),
    carriageReturnEventCount: boundedCount(normalization.carriageReturnEventCount),
    backspaceEventCount: boundedCount(normalization.backspaceEventCount),
    parserStage,
    errorCode: sanitizeDiagnosticCode(errorCode),
  };
  return validateStructuralDiagnostics(diagnostics);
}

export function validateStructuralDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw coded("AUDIT_DIAGNOSTICS_INVALID");
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...DIAGNOSTIC_KEYS].sort())) throw coded("AUDIT_DIAGNOSTICS_SCHEMA_INVALID");
  for (const [key, item] of Object.entries(value)) {
    if (key === "parserStage") {
      if (!DIAGNOSTIC_STAGES.has(item)) throw coded("AUDIT_DIAGNOSTICS_STAGE_INVALID");
    } else if (key === "errorCode") {
      if (!/^AUDIT_[A-Z0-9_]{1,100}$/.test(item)) throw coded("AUDIT_DIAGNOSTICS_CODE_INVALID");
    } else if (key.endsWith("Count")) {
      if (!Number.isInteger(item) || item < 0 || item > MAX_CONSOLE_OUTPUT_BYTES) throw coded("AUDIT_DIAGNOSTICS_COUNT_INVALID");
    } else if (typeof item !== "boolean") {
      throw coded("AUDIT_DIAGNOSTICS_VALUE_INVALID");
    }
  }
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 2_048 || CREDENTIAL_SHAPE.test(json)) throw coded("AUDIT_DIAGNOSTICS_OUTPUT_INVALID");
  return Object.freeze({ ...value });
}

export function normalizePtyOutput(output) {
  return normalizePtyOutputWithStats(output).text;
}

function normalizePtyOutputWithStats(output) {
  const strippedResult = stripTerminalSequences(String(output ?? ""));
  const stripped = strippedResult.text;
  let normalized = "";
  let line = "";
  let carriageReturnEventCount = 0;
  let backspaceEventCount = 0;
  for (let index = 0; index < stripped.length; index += 1) {
    const character = stripped[index];
    const code = stripped.charCodeAt(index);
    if (character === "\r") {
      carriageReturnEventCount += 1;
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
      backspaceEventCount += 1;
      line = line.slice(0, -1);
    } else if (character === "\t" || code >= 0x20) {
      line += character;
    } else {
      throw coded("AUDIT_OUTPUT_CONTROL_CHARACTER");
    }
  }
  return {
    text: normalized + line,
    stats: {
      ansiSequenceCount: strippedResult.removedCount,
      carriageReturnEventCount,
      backspaceEventCount,
    },
  };
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
  let removedCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 0x1b) {
      output += value[index];
      continue;
    }
    removedCount += 1;
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
  return { text: output, removedCount };
}

function isAllowedPtyFramingLine(line, marker) {
  if (line === "" || line === marker || /^__PHYSIQUEOS_REMOTE_EXIT__:0$/.test(line)) return true;
  if (/^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9._-]+:[^\n]{0,180}[#$>] ?$/.test(line)) return true;
  if (/^[#$>] ?$/.test(line)) return true;
  if (/^(?:Connecting(?: to)?|Connected(?: to)?|Welcome|Last login:)[^\n]{0,180}$/i.test(line)) return true;
  if (new Set(["stty -echo", "exit"]).has(line)) return true;
  return false;
}

function diagnosticFailure(code, output, prefix, marker, parserStage, enabled) {
  const error = coded(code);
  if (enabled && /^[A-Z0-9_]{12,120}$/.test(prefix ?? "") && SAFE_MARKER.test(marker ?? "")) {
    error.structuralDiagnostics = collectStructuralDiagnostics(output, prefix, marker, { parserStage, errorCode: code });
  }
  return error;
}

function countOccurrences(value, token) {
  if (!token) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(token, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + token.length;
  }
}

function indexesMatching(lines, predicate) {
  const indexes = [];
  for (let index = 0; index < lines.length; index += 1) if (predicate(lines[index])) indexes.push(index);
  return indexes;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeDiagnosticCode(value) {
  const code = String(value ?? "AUDIT_DIAGNOSTIC").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 106);
  return code.startsWith("AUDIT_") ? code : `AUDIT_${code}`;
}

function boundedCount(value) {
  return Math.min(MAX_CONSOLE_OUTPUT_BYTES, Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0));
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}
