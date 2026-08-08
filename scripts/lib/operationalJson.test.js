import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OperationalJsonError, parseOperationalJsonBytes,
  readOperationalJsonFileSync } from "./operationalJson.mjs";

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("operational JSON reader", () => {
  it("parses identical objects with and without a UTF-8 BOM without changing bytes", () => {
    const plain = Buffer.from('{"value":42,"nested":{"ok":true}}', "utf8");
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain]);
    const before = Buffer.from(bom);
    expect(parseOperationalJsonBytes(plain)).toEqual({ value: 42, nested: { ok: true } });
    expect(parseOperationalJsonBytes(bom)).toEqual({ value: 42, nested: { ok: true } });
    expect(bom.equals(before)).toBe(true);
  });

  it("accepts JSON whitespace before a BOM", () => {
    expect(parseOperationalJsonBytes(Buffer.from(' \r\n\t\uFEFF{"ok":true}', "utf8")))
      .toEqual({ ok: true });
  });

  it.each([
    ["empty file", Buffer.alloc(0), "OPERATIONAL_JSON_PARSE_FAILED", false],
    ["malformed JSON", Buffer.from('{"secret":"not exposed",}'),
      "OPERATIONAL_JSON_PARSE_FAILED", false],
    ["invalid encoding", Buffer.from([0xff, 0xfe, 0x7b, 0x7d]),
      "OPERATIONAL_JSON_INVALID_ENCODING", false],
  ])("returns sanitized diagnostics for %s", (_label, bytes, code, bomDetected) => {
    let caught;
    try { parseOperationalJsonBytes(bytes, { filePath: "sensitive.json", stage: "fixture_parse" }); }
    catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(OperationalJsonError);
    expect(caught).toMatchObject({ code, details: {
      encoding: code === "OPERATIONAL_JSON_INVALID_ENCODING" ? "invalid_utf8" : "utf-8",
      bomDetected, stage: "fixture_parse" } });
    expect(caught.details.filePath).toBe(path.resolve("sensitive.json"));
    expect(caught.message).not.toContain("not exposed");
  });

  it("reports BOM detection and the underlying parser error", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{")]);
    expect(() => parseOperationalJsonBytes(bytes, { filePath: "bom.json", stage: "control" }))
      .toThrowError(expect.objectContaining({ code: "OPERATIONAL_JSON_PARSE_FAILED",
        details: expect.objectContaining({ encoding: "utf-8", bomDetected: true,
          stage: "control", parserError: expect.stringContaining("invalid JSON") }) }));
  });

  it("reports missing files without exposing content", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "operational-json-"));
    temporaryDirectories.push(directory);
    const missing = path.join(directory, "missing.json");
    expect(() => readOperationalJsonFileSync(missing, { stage: "manifest" }))
      .toThrowError(expect.objectContaining({ code: "OPERATIONAL_JSON_READ_FAILED",
        details: expect.objectContaining({ filePath: missing, encoding: "not_detected",
          bomDetected: false, stage: "manifest", parserError: expect.stringContaining("ENOENT") }) }));
  });
});
