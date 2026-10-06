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
  collectStructuralDiagnostics,
  normalizePtyOutput,
  parseFramedJson,
  validateStructuralDiagnostics,
  validateSanitizedConsoleOutput,
} from "./productionAccessSafety.mjs";

const temporaryDirectories = [];
const SHA = "b7eb1e397f0238df9ae904fd182ddbb51602e8d8";
const MARKER = "PHYSIQUEOS_TEST_GUARDED_PAYLOAD_OK_1234";
const PREFIX = "PHYSIQUEOS_TEST_GUARDED_JSON";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("non-content structural diagnostics", () => {
  it("distinguishes missing, partial, malformed, duplicated, reversed, and marker-only structures", () => {
    const encoded = Buffer.from('{"passed":true}').toString("base64");
    const begin = `__PHYSIQUEOS_STRUCTURED_BEGIN__:${PREFIX}:${encoded.length}`;
    const end = `__PHYSIQUEOS_STRUCTURED_END__:${PREFIX}`;
    const cases = [
      { output: `${MARKER}\n`, code: "AUDIT_JSON_MISSING", begin: 0, end: 0, marker: 1 },
      { output: `${begin}\n${encoded}\n${MARKER}\n`, code: "AUDIT_JSON_MISSING", begin: 1, end: 0, marker: 1 },
      { output: `${begin}\n%%%\n${end}\n${MARKER}\n`, code: "AUDIT_JSON_FRAME_INVALID", begin: 1, end: 1, marker: 1 },
      { output: `${framed({ passed: true })}${framed({ passed: true })}`, code: "AUDIT_JSON_DUPLICATE", begin: 2, end: 2, marker: 2 },
      { output: `${end}\n${begin}\n${encoded}\n${MARKER}\n`, code: "AUDIT_JSON_FRAME_INVALID", begin: 1, end: 1, marker: 1, ordered: false },
    ];
    for (const fixture of cases) {
      const diagnostics = thrownDiagnostics(() => parseFramedJson(fixture.output, PREFIX, {
        marker: MARKER,
        structuralDiagnostics: true,
      }));
      assert.equal(diagnostics.errorCode, fixture.code);
      assert.equal(diagnostics.beginSentinelCount, fixture.begin);
      assert.equal(diagnostics.endSentinelCount, fixture.end);
      assert.equal(diagnostics.successMarkerCount, fixture.marker);
      if (fixture.ordered === false) assert.equal(diagnostics.beginBeforeEnd, false);
    }
  });

  it("reports full-frame-without-marker and unexpected payload without leaking either", () => {
    const withoutMarker = framed({ passed: true }).replace(`${MARKER}\n`, "");
    const markerDiagnostic = thrownDiagnostics(() => validateSanitizedConsoleOutput(withoutMarker, {
      marker: MARKER,
      prefix: PREFIX,
      structuralDiagnostics: true,
    }));
    assert.equal(markerDiagnostic.errorCode, "AUDIT_SUCCESS_MARKER_MISSING");
    assert.equal(markerDiagnostic.beginSentinelCount, 1);
    assert.equal(markerDiagnostic.endSentinelCount, 1);
    assert.equal(markerDiagnostic.successMarkerCount, 0);

    const unexpected = "synthetic application payload that must never appear in diagnostics";
    const unexpectedDiagnostic = thrownDiagnostics(() => parseFramedJson(`${unexpected}\n${framed({ passed: true })}`, PREFIX, {
      marker: MARKER,
      structuralDiagnostics: true,
    }));
    assert.equal(unexpectedDiagnostic.errorCode, "AUDIT_OUTPUT_UNEXPECTED");
    assert.equal(JSON.stringify(unexpectedDiagnostic).includes(unexpected), false);
  });

  it("counts only structure for ANSI, prompt, split chunks, and carriage overwrite", () => {
    const output = `\u001b[32mweb-host:/workspace#\u001b[0m\r\nprogress text\r${framed({ passed: true })}`;
    const markerIndex = output.indexOf(MARKER) + 7;
    const beginIndex = output.indexOf("STRUCTURED_BEGIN") + 5;
    const chunks = [output.slice(0, beginIndex), output.slice(beginIndex, markerIndex), output.slice(markerIndex)];
    const diagnostics = collectStructuralDiagnostics(chunks, PREFIX, MARKER, { parserStage: "complete", errorCode: "AUDIT_DIAGNOSTIC" });
    assert.equal(diagnostics.chunkCount, 3);
    assert.equal(diagnostics.beginSentinelCount, 1);
    assert.equal(diagnostics.endSentinelCount, 1);
    assert.equal(diagnostics.successMarkerCount, 1);
    assert.equal(diagnostics.zeroExitMarkerCount, 1);
    assert.equal(diagnostics.markerOrderingValid, true);
    assert.equal(diagnostics.expectedFrameLinePosition, true);
    assert.equal(diagnostics.ansiSequenceCount, 2);
    assert.equal(diagnostics.carriageReturnEventCount, 2);
  });

  it("proves diagnostics cannot contain fixture text, JSON, base64, credentials, or extra fields", () => {
    const sensitive = "postgresql://synthetic-user:synthetic-password@example.invalid/database";
    const rawJson = JSON.stringify({ sensitive, fixtureText: "NEVER_EXPOSE_THIS_FIXTURE_TEXT" });
    const encoded = Buffer.from(rawJson).toString("base64");
    const diagnostics = thrownDiagnostics(() => parseFramedJson(framedRaw(rawJson), PREFIX, {
      marker: MARKER,
      structuralDiagnostics: true,
    }));
    const serialized = JSON.stringify(diagnostics);
    for (const forbidden of [sensitive, rawJson, encoded, "NEVER_EXPOSE_THIS_FIXTURE_TEXT", "synthetic-password"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.deepEqual(validateStructuralDiagnostics(diagnostics), diagnostics);
    assert.throws(() => validateStructuralDiagnostics({ ...diagnostics, content: sensitive }),
      { code: "AUDIT_DIAGNOSTICS_SCHEMA_INVALID" });
  });
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

  it("isolates the begin sentinel after PTY carriage framing without accepting a same-line prefix", () => {
    const execution = runGeneratedPayload({ transactionReadOnly: "on" });
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(execution.stdout.startsWith("\n"), true);

    const prompt = "\u001b[32mweb-host:/workspace#\u001b[0m\rweb-host:/workspace#";
    const sameLineFrame = `${prompt}${execution.stdout.slice(1)}`;
    const sameLineDiagnostics = thrownDiagnostics(() => parseFramedJson(sameLineFrame, PREFIX, {
      marker: MARKER,
      structuralDiagnostics: true,
    }));
    assert.equal(sameLineDiagnostics.errorCode, "AUDIT_JSON_MISSING");
    assert.equal(sameLineDiagnostics.beginSentinelCount, 1);
    assert.equal(sameLineDiagnostics.endSentinelCount, 1);
    assert.equal(sameLineDiagnostics.successMarkerCount, 1);
    assert.equal(sameLineDiagnostics.beginBeforeEnd, false);
    assert.equal(sameLineDiagnostics.beginContiguous, false);
    assert.equal(sameLineDiagnostics.endContiguous, true);

    const isolatedFrame = `${prompt}${execution.stdout}`;
    const beginSplit = isolatedFrame.indexOf("STRUCTURED_BEGIN") + 9;
    const markerSplit = isolatedFrame.indexOf(MARKER) + 13;
    const chunks = [
      isolatedFrame.slice(0, beginSplit),
      isolatedFrame.slice(beginSplit, markerSplit),
      isolatedFrame.slice(markerSplit),
    ];
    assert.deepEqual(parseFramedJson(chunks, PREFIX, { marker: MARKER }), {
      bindingPresence: { databaseUrl: true, databaseCa: true },
      probe: { selectOne: true },
      runtime: { gitSha: SHA },
      transaction: { readOnly: "on" },
    });
    assert.equal(collectStructuralDiagnostics(chunks, PREFIX, MARKER, {
      parserStage: "complete",
      errorCode: "AUDIT_DIAGNOSTIC",
    }).beginContiguous, true);
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

function thrownDiagnostics(callback) {
  try {
    callback();
  } catch (error) {
    assert.ok(error.structuralDiagnostics, `missing structural diagnostics for ${error?.code ?? "unknown"}`);
    return error.structuralDiagnostics;
  }
  assert.fail("expected a fail-closed parser error");
}
