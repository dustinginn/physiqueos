import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import {
  APPROVED_READ_CONTEXT,
  assertApprovedReadContext,
  assertSelectOnlySql,
  buildGuardedReadOnlyPayload,
  normalizePtyOutput,
  parseFramedJson,
  validateSanitizedConsoleOutput,
} from "./productionAccessSafety.mjs";

const temporaryDirectories = [];
const SHA = "b7eb1e397f0238df9ae904fd182ddbb51602e8d8";
const MARKER = "PHYSIQUEOS_TEST_GUARDED_PAYLOAD_OK_1234";
const PREFIX = "PHYSIQUEOS_TEST_GUARDED_JSON";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("production access safety primitives", () => {
  it("allows only the exact approved read context", () => {
    assert.equal(assertApprovedReadContext(APPROVED_READ_CONTEXT), APPROVED_READ_CONTEXT);
    for (const context of ["physiqueos-production-deploy", "physiqueos-production-migrate", "another-context"]) {
      assert.throws(() => assertApprovedReadContext(context), { code: "DOCTL_CONTEXT_NOT_APPROVED" });
    }
  });

  it("allows one SELECT and rejects mutations and side-effecting SELECT functions", () => {
    assert.equal(assertSelectOnlySql("SELECT value FROM sample WHERE id = $1;"), "SELECT value FROM sample WHERE id = $1");
    for (const sql of [
      "UPDATE sample SET value = 1",
      "SELECT value FROM sample; DELETE FROM sample",
      "SELECT nextval('sequence')",
      "WITH changed AS (DELETE FROM sample RETURNING *) SELECT * FROM changed",
    ]) assert.throws(() => assertSelectOnlySql(sql));
  });

  it("normalizes bounded ANSI, CRLF, carriage overwrite, and prompt framing", () => {
    const output = `\u001b[32mweb-host:/workspace#\u001b[0m\r\nprogress 99%\r${framed({ passed: true }, { lineEnding: "\r\n" })}\u001b[?25h`;
    assert.equal(validateSanitizedConsoleOutput(output, { marker: MARKER }), output);
    assert.deepEqual(parseFramedJson(output, PREFIX, { marker: MARKER }), { passed: true });
    assert.doesNotMatch(normalizePtyOutput(output), /progress 99%|\u001b/);
  });

  it("reassembles a structured prefix and exact marker split across chunks", () => {
    const output = framed({ passed: true });
    const prefixSplit = output.indexOf("STRUCTURED_BEGIN") + 7;
    const markerSplit = output.indexOf(MARKER) + 11;
    const chunks = [output.slice(0, prefixSplit), output.slice(prefixSplit, markerSplit), output.slice(markerSplit)];
    assert.equal(validateSanitizedConsoleOutput(chunks, { marker: MARKER }), output);
    assert.deepEqual(parseFramedJson(chunks, PREFIX, { marker: MARKER }), { passed: true });
  });

  it("rejects duplicate, missing, malformed, credential-bearing, and unexpectedly surrounded frames", () => {
    const valid = framed({ passed: true });
    assert.throws(() => parseFramedJson(`${valid}${valid}`, PREFIX, { marker: MARKER }), { code: "AUDIT_JSON_DUPLICATE" });
    assert.throws(() => parseFramedJson(`${MARKER}\n`, PREFIX, { marker: MARKER }), { code: "AUDIT_JSON_MISSING" });
    assert.throws(() => parseFramedJson(framedRaw("not-json"), PREFIX, { marker: MARKER }), { code: "AUDIT_JSON_INVALID" });
    assert.throws(() => parseFramedJson(framed({ url: "postgresql://user:password@example/db" }), PREFIX, { marker: MARKER }),
      { code: "AUDIT_OUTPUT_CREDENTIAL_SHAPE" });
    assert.throws(() => parseFramedJson(`unexpected application payload\n${valid}`, PREFIX, { marker: MARKER }),
      { code: "AUDIT_OUTPUT_UNEXPECTED" });
    assert.throws(() => parseFramedJson(valid.replace(/:(\d+)\n/, ":999999\n"), PREFIX, { marker: MARKER }),
      { code: "AUDIT_JSON_FRAME_INVALID" });
  });

  it("requires one marker and rejects raw credential-shaped output", () => {
    assert.throws(() => validateSanitizedConsoleOutput(`${MARKER}\n${MARKER}\n`, { marker: MARKER }));
    assert.throws(() => validateSanitizedConsoleOutput(`postgresql://user:password@example/db\n${MARKER}\n`, { marker: MARKER }));
  });
});

describe("generated read-only payload", () => {
  it("executes SELECT 1 inside a verified read-only transaction and rolls back before output", () => {
    const execution = runGeneratedPayload({ transactionReadOnly: "on" });
    assert.equal(execution.status, 0, execution.stderr);
    assert.match(execution.stdout, new RegExp(`${PREFIX}:`));
    assert.match(execution.stdout, new RegExp(`${MARKER}\\n$`));
    assert.deepEqual(execution.events, ["connect", "begin", "show", "select", "rollback", "release", "pool_end"]);
    const report = parseFramedJson(execution.stdout, PREFIX, { marker: MARKER });
    assert.deepEqual(report, {
      bindingPresence: { databaseUrl: true, databaseCa: true },
      probe: { selectOne: true },
      runtime: { gitSha: SHA },
      transaction: { readOnly: "on" },
    });
  });

  it("fails closed and rolls back when transaction_read_only is not on", () => {
    const execution = runGeneratedPayload({ transactionReadOnly: "off" });
    assert.equal(execution.status, 1);
    assert.match(execution.stderr, /TRANSACTION_NOT_READ_ONLY/);
    assert.doesNotMatch(execution.stdout, new RegExp(MARKER));
    assert.deepEqual(execution.events, ["connect", "begin", "show", "rollback", "release", "pool_end"]);
  });
});

function runGeneratedPayload({ transactionReadOnly }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-guarded-payload-test-"));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, "node_modules", "pg"), { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), '{"type":"module"}\n');
  fs.writeFileSync(path.join(directory, "node_modules", "pg", "package.json"), '{"main":"index.cjs"}\n');
  fs.writeFileSync(path.join(directory, "node_modules", "pg", "index.cjs"), `
const fs = require("node:fs");
const events = [];
function record(value) { events.push(value); fs.writeFileSync(process.env.TEST_EVENT_PATH, JSON.stringify(events)); }
class Pool {
  on() {}
  async connect() {
    record("connect");
    return {
      query: async (text) => {
        if (text.startsWith("BEGIN")) { record("begin"); return { command: "BEGIN", rows: [] }; }
        if (text === "SHOW transaction_read_only") { record("show"); return { command: "SHOW", rows: [{ transaction_read_only: ${JSON.stringify(transactionReadOnly)} }] }; }
        if (text.startsWith("SELECT")) { record("select"); return { command: "SELECT", rows: [{ value: 1 }] }; }
        if (text === "ROLLBACK") { record("rollback"); return { command: "ROLLBACK", rows: [] }; }
        throw new Error("UNEXPECTED_QUERY");
      },
      release: () => record("release"),
    };
  }
  async end() { record("pool_end"); }
}
module.exports = { Pool };
`);
  const eventPath = path.join(directory, "events.json");
  const source = buildGuardedReadOnlyPayload({
    marker: MARKER,
    outputPrefix: PREFIX,
    expectedGitSha: SHA,
    applicationName: "physiqueos-safety-test",
    allowedReportKeys: ["bindingPresence", "probe", "runtime", "transaction"],
    auditBody: `
const rows = await select("SELECT $1::int AS value", [1], { maxRows: 1 });
return {
  bindingPresence,
  probe: { selectOne: rows[0]?.value === 1 },
  runtime: { gitSha: String(process.env.PHYSIQUEOS_GIT_SHA ?? "") },
  transaction: { readOnly: transactionReadOnly },
};`,
  });
  const result = spawnSync(process.execPath, ["--input-type=module"], {
    cwd: directory,
    input: source,
    encoding: "utf8",
    env: {
      ...process.env,
      TEST_EVENT_PATH: eventPath,
      PHYSIQUEOS_GIT_SHA: SHA,
      PHYSIQUEOS_DATABASE_URL: "postgresql://synthetic.invalid/test",
      PHYSIQUEOS_DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----synthetic-----END CERTIFICATE-----",
    },
  });
  return {
    ...result,
    events: fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, "utf8")) : [],
  };
}

function framed(value, { lineEnding = "\n" } = {}) {
  return framedRaw(JSON.stringify(value), { lineEnding });
}

function framedRaw(raw, { lineEnding = "\n" } = {}) {
  const encoded = Buffer.from(raw).toString("base64");
  return [
    `__PHYSIQUEOS_STRUCTURED_BEGIN__:${PREFIX}:${encoded.length}`,
    encoded,
    `__PHYSIQUEOS_STRUCTURED_END__:${PREFIX}`,
    MARKER,
    "__PHYSIQUEOS_REMOTE_EXIT__:0",
    "",
  ].join(lineEnding);
}
