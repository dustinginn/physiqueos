import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const LEADING_WHITESPACE_BOM = /^([ \t\r\n]*)\uFEFF/;

export class OperationalJsonError extends Error {
  constructor(message, { code, filePath, encoding, bomDetected, stage, cause } = {}) {
    super(message);
    this.name = "OperationalJsonError";
    this.code = code;
    this.details = Object.freeze({
      filePath: filePath ? path.resolve(filePath) : "<memory>",
      encoding,
      bomDetected: Boolean(bomDetected),
      stage,
      parserError: sanitizeUnderlyingError(code, cause),
    });
  }
}

export function readOperationalJsonFileSync(filePath, { stage = "read_and_parse" } = {}) {
  const resolved = path.resolve(filePath);
  let bytes;
  try {
    bytes = fs.readFileSync(resolved);
  } catch (cause) {
    throw operationalError("OPERATIONAL_JSON_READ_FAILED", resolved, stage,
      "not_detected", false, cause);
  }
  return parseOperationalJsonBytes(bytes, { filePath: resolved, stage });
}

export async function readOperationalJsonFile(filePath, { stage = "read_and_parse" } = {}) {
  const resolved = path.resolve(filePath);
  let bytes;
  try {
    bytes = await readFile(resolved);
  } catch (cause) {
    throw operationalError("OPERATIONAL_JSON_READ_FAILED", resolved, stage,
      "not_detected", false, cause);
  }
  return parseOperationalJsonBytes(bytes, { filePath: resolved, stage });
}

export function parseOperationalJsonBytes(value, {
  filePath = "<memory>", stage = "parse",
} = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const byteBom = bytes.length >= 3 && bytes.subarray(0, 3).equals(UTF8_BOM);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw operationalError("OPERATIONAL_JSON_INVALID_ENCODING", filePath, stage,
      "invalid_utf8", byteBom, cause);
  }
  const whitespaceBom = LEADING_WHITESPACE_BOM.test(text);
  const bomDetected = byteBom || whitespaceBom;
  const normalized = text.replace(LEADING_WHITESPACE_BOM, "$1");
  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw operationalError("OPERATIONAL_JSON_PARSE_FAILED", filePath, stage,
      "utf-8", bomDetected, cause);
  }
}

function operationalError(code, filePath, stage, encoding, bomDetected, cause) {
  const resolved = filePath === "<memory>" ? filePath : path.resolve(filePath);
  const parserError = sanitizeUnderlyingError(code, cause);
  return new OperationalJsonError(
    `Operational JSON failed at ${stage} for ${resolved}: ${parserError}`,
    { code, filePath: resolved, encoding, bomDetected, stage, cause });
}

function sanitizeUnderlyingError(code, cause) {
  const message = cause instanceof Error ? cause.message : String(cause ?? "unknown error");
  if (code !== "OPERATIONAL_JSON_PARSE_FAILED") return message;
  const position = message.match(/(?:position|at)\s+(\d+)/i)?.[1] ?? null;
  const lineColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  return `SyntaxError: invalid JSON${position ? ` at position ${position}` : ""}` +
    `${lineColumn ? ` (line ${lineColumn[1]} column ${lineColumn[2]})` : ""}`;
}
