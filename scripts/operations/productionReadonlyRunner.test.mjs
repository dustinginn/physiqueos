import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  formatPrimaryFailure,
  loadNamedDoctlToken,
  parsePrimaryArguments,
  requestExecUrl,
  resolveDoctlConfigPath,
  runPrimaryRunner,
  runRemoteConsole,
} from "./runAppConsoleContextGzipSourceOnOpen.mjs";
import {
  hasExactSuccessMarker,
  readRequiredSuccessMarker,
  runGzipFileWrapper,
} from "./runAppConsoleContextGzipFile.mjs";

const temporaryDirectories = [];
const VALID_PAYLOAD = Buffer.from("export {};\n").toString("base64");
const FAKE_TOKEN = "fake_test_token_never_real_1234567890";
const SUCCESS_MARKER = "PHYSIQUEOS_TEST_AUDIT_SUCCESS_1234";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("cross-platform doctl configuration discovery", () => {
  it("resolves the established Windows configuration location", () => {
    const home = path.resolve("C:/fake-user");
    const expected = path.resolve(home, "AppData", "Roaming", "doctl", "config.yaml");
    assert.equal(resolveDoctlConfigPath({
      platform: "win32",
      homeDir: home,
      appData: path.resolve(home, "AppData", "Roaming"),
      existsSync: (candidate) => candidate.toLowerCase() === expected.toLowerCase(),
    }), expected);
  });

  it("resolves the macOS Library/Application Support location", () => {
    const home = path.resolve("fake-mac-home");
    const expected = path.resolve(home, "Library", "Application Support", "doctl", "config.yaml");
    assert.equal(resolveDoctlConfigPath({
      platform: "darwin",
      homeDir: home,
      existsSync: (candidate) => candidate === expected,
    }), expected);
  });

  it("resolves the macOS .config location", () => {
    const home = path.resolve("fake-mac-home");
    const expected = path.resolve(home, ".config", "doctl", "config.yaml");
    assert.equal(resolveDoctlConfigPath({
      platform: "darwin",
      homeDir: home,
      existsSync: (candidate) => candidate === expected,
    }), expected);
  });

  it("uses an explicit non-secret configuration path deterministically", () => {
    const explicitPath = path.resolve("operator-config", "config.yaml");
    assert.equal(resolveDoctlConfigPath({
      explicitPath,
      existsSync: (candidate) => candidate === explicitPath,
    }), explicitPath);
  });

  it("fails closed when no configuration exists", () => {
    assert.throws(
      () => resolveDoctlConfigPath({ platform: "darwin", homeDir: "/missing", existsSync: () => false }),
      { code: "DOCTL_CONFIG_NOT_FOUND" },
    );
  });

  it("fails closed when both macOS configuration locations exist", () => {
    assert.throws(
      () => resolveDoctlConfigPath({ platform: "darwin", homeDir: "/ambiguous", existsSync: () => true }),
      { code: "DOCTL_CONFIG_AMBIGUOUS" },
    );
  });
});

describe("named doctl context isolation", () => {
  it("fails closed when the exact named context is absent", () => {
    const configPath = writeConfig("auth-contexts:\n  another-context: fake-token-that-is-long-enough\n");
    assert.throws(
      () => loadNamedDoctlToken({ configPath, context: "physiqueos-final-cutover-config" }),
      { code: "DOCTL_CONTEXT_NOT_FOUND" },
    );
  });

  it("selects only the exact named context", () => {
    const configPath = writeConfig(
      `auth-contexts:\n  physiqueos-final-cutover-config: ${FAKE_TOKEN}\n  physiqueos-production-deploy: fake-deploy-token-never-selected\n`,
    );
    assert.equal(loadNamedDoctlToken({ configPath, context: "physiqueos-final-cutover-config" }), FAKE_TOKEN);
  });

  it("does not emit the token to output or error text", async () => {
    const configPath = writeConfig(`auth-contexts:\n  physiqueos-final-cutover-config: ${FAKE_TOKEN}\n`);
    let authorization = null;
    let output = "";
    await runPrimaryRunner({
      args: [
        "physiqueos-final-cutover-config",
        "test-app-id",
        "web",
        VALID_PAYLOAD,
        "--doctl-config",
        configPath,
      ],
      fetchImpl: async (_url, options) => {
        authorization = options.headers.authorization;
        return { ok: true, status: 200, json: async () => ({ url: "wss://fake.invalid/exec" }) };
      },
      WebSocketImpl: SuccessfulWebSocket,
      stdout: { write: (value) => { output += value; } },
      timeoutMs: 100,
      delays: zeroDelays(),
    });
    assert.equal(authorization, `Bearer ${FAKE_TOKEN}`);
    assert.equal(output.includes(FAKE_TOKEN), false);

    const denied = await requestExecUrl({
      token: FAKE_TOKEN,
      appId: "app",
      componentName: "web",
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }).catch((error) => error);
    assert.equal(denied.code, "DIGITALOCEAN_EXEC_HTTP_403");
    assert.equal(String(denied.message).includes(FAKE_TOKEN), false);
    const formattedFailure = formatPrimaryFailure(Object.assign(new Error(FAKE_TOKEN), { code: "SAFE_FAILURE" }));
    assert.equal(formattedFailure, "PHYSIQUEOS_READONLY_RUNNER_FAILED:SAFE_FAILURE\n");
    assert.equal(formattedFailure.includes(FAKE_TOKEN), false);
  });
});

describe("primary runner fail-closed transport", () => {
  it("rejects invalid payloads before any request", () => {
    assert.throws(
      () => parsePrimaryArguments(["context", "app", "web", "not base64"]),
      { code: "PAYLOAD_INVALID" },
    );
  });

  it("rejects an invalid or non-wss exec URL", async () => {
    await assert.rejects(
      requestExecUrl({
        token: FAKE_TOKEN,
        appId: "app",
        componentName: "web",
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ url: "https://invalid.example" }) }),
      }),
      { code: "DIGITALOCEAN_EXEC_URL_INVALID" },
    );
  });

  it("fails on bounded timeout", async () => {
    await assert.rejects(
      runRemoteConsole({
        url: "wss://fake.invalid/exec",
        encodedSource: VALID_PAYLOAD,
        WebSocketImpl: SilentWebSocket,
        stdout: { write: () => {} },
        timeoutMs: 10,
        delays: zeroDelays(),
      }),
      { code: "REMOTE_CONSOLE_TIMEOUT" },
    );
  });

  it("fails on WebSocket error", async () => {
    await assert.rejects(
      runRemoteConsole({
        url: "wss://fake.invalid/exec",
        encodedSource: VALID_PAYLOAD,
        WebSocketImpl: ErrorWebSocket,
        stdout: { write: () => {} },
        timeoutMs: 100,
        delays: zeroDelays(),
      }),
      { code: "WEBSOCKET_ERROR" },
    );
  });

  it("fails when the remote Node process reports an error", async () => {
    await assert.rejects(
      runRemoteConsole({
        url: "wss://fake.invalid/exec",
        encodedSource: VALID_PAYLOAD,
        WebSocketImpl: NonzeroWebSocket,
        stdout: { write: () => {} },
        timeoutMs: 100,
        delays: zeroDelays(),
      }),
      { code: "REMOTE_PROCESS_EXIT_7" },
    );
  });

  it("fails on unexpected closure before remote exit", async () => {
    await assert.rejects(
      runRemoteConsole({
        url: "wss://fake.invalid/exec",
        encodedSource: VALID_PAYLOAD,
        WebSocketImpl: EarlyCloseWebSocket,
        stdout: { write: () => {} },
        timeoutMs: 100,
        delays: zeroDelays(),
      }),
      { code: "WEBSOCKET_UNEXPECTED_CLOSE" },
    );
  });
});

describe("gzip-file wrapper success-marker contract", () => {
  it("requires exactly one task-declared marker", () => {
    assert.equal(
      readRequiredSuccessMarker(`// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${SUCCESS_MARKER}\n`),
      SUCCESS_MARKER,
    );
    assert.throws(() => readRequiredSuccessMarker("export {};\n"), { code: "AUDIT_SUCCESS_MARKER_DIRECTIVE_INVALID" });
  });

  it("accepts exactly one standalone success marker", () => {
    assert.equal(hasExactSuccessMarker(`before\n${SUCCESS_MARKER}\nafter\n`, SUCCESS_MARKER), true);
    assert.equal(hasExactSuccessMarker(`${SUCCESS_MARKER}\n${SUCCESS_MARKER}\n`, SUCCESS_MARKER), false);
    assert.equal(hasExactSuccessMarker(`prefix-${SUCCESS_MARKER}\n`, SUCCESS_MARKER), false);
  });

  it("fails when the success marker is missing", () => {
    const sourcePath = writeAuditSource();
    assert.throws(
      () => runGzipFileWrapper({
        args: ["context", "app", "web", sourcePath],
        spawnSyncImpl: () => ({ status: 0, stdout: "remote completed without proof\n", stderr: "" }),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
      { code: "AUDIT_SUCCESS_MARKER_MISSING" },
    );
  });

  it("accepts the exact marker after runner success", () => {
    const sourcePath = writeAuditSource();
    assert.deepEqual(
      runGzipFileWrapper({
        args: ["context", "app", "web", sourcePath],
        spawnSyncImpl: () => ({ status: 0, stdout: `sanitized\n${SUCCESS_MARKER}\n`, stderr: "" }),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
      { successMarker: SUCCESS_MARKER },
    );
  });

  it("propagates runner failure", () => {
    const sourcePath = writeAuditSource();
    assert.throws(
      () => runGzipFileWrapper({
        args: ["context", "app", "web", sourcePath],
        spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "sanitized failure\n" }),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
      { code: "RUNNER_EXIT_1" },
    );
  });

  it("does not silently accept runner stderr alongside a marker", () => {
    const sourcePath = writeAuditSource();
    assert.throws(
      () => runGzipFileWrapper({
        args: ["context", "app", "web", sourcePath],
        spawnSyncImpl: () => ({ status: 0, stdout: `${SUCCESS_MARKER}\n`, stderr: "sanitized remote error\n" }),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
      { code: "RUNNER_STDERR_UNEXPECTED" },
    );
  });

  it("fails on timeout or truncated output", () => {
    const sourcePath = writeAuditSource();
    for (const code of ["ETIMEDOUT", "ENOBUFS"]) {
      assert.throws(
        () => runGzipFileWrapper({
          args: ["context", "app", "web", sourcePath],
          spawnSyncImpl: () => ({ status: null, stdout: "", stderr: "", error: { code } }),
          stdout: { write: () => {} },
          stderr: { write: () => {} },
        }),
        { code: code === "ETIMEDOUT" ? "RUNNER_TIMEOUT" : "RUNNER_OUTPUT_TRUNCATED" },
      );
    }
  });
});

function writeConfig(contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-doctl-config-test-"));
  temporaryDirectories.push(directory);
  const configPath = path.join(directory, "config.yaml");
  fs.writeFileSync(configPath, contents);
  return configPath;
}

function writeAuditSource() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-audit-source-test-"));
  temporaryDirectories.push(directory);
  const sourcePath = path.join(directory, "audit.mjs");
  fs.writeFileSync(
    sourcePath,
    `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${SUCCESS_MARKER}\nprocess.stdout.write("${SUCCESS_MARKER}\\n");\n`,
  );
  return sourcePath;
}

function zeroDelays() {
  return { open: 0, echo: 0, command: 0, chunk: 0, cursor: 0 };
}

class FakeWebSocketBase {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) ?? [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  emit(name, event = {}) {
    for (const callback of this.listeners.get(name) ?? []) callback(event);
  }

  close(code = 1000) {
    queueMicrotask(() => this.emit("close", { code }));
  }
}

class SuccessfulWebSocket extends FakeWebSocketBase {
  constructor() {
    super();
    queueMicrotask(() => this.emit("open"));
  }

  send(value) {
    const message = JSON.parse(value);
    if (message.op === "stdin" && message.data.includes("PHYSIQUEOS_REMOTE_STATUS")) {
      queueMicrotask(() => {
        this.emit("message", { data: JSON.stringify({ data: "sanitized\n__PHYSIQUEOS_REMOTE_EXIT__:0\n" }) });
        this.emit("close", { code: 1000 });
      });
    }
  }
}

class SilentWebSocket extends FakeWebSocketBase {
  constructor() {
    super();
    queueMicrotask(() => this.emit("open"));
  }

  send() {}
}

class NonzeroWebSocket extends FakeWebSocketBase {
  constructor() {
    super();
    queueMicrotask(() => this.emit("open"));
  }

  send(value) {
    const message = JSON.parse(value);
    if (message.op === "stdin" && message.data.includes("PHYSIQUEOS_REMOTE_STATUS")) {
      queueMicrotask(() => {
        this.emit("message", { data: JSON.stringify({ data: "sanitized failure\n__PHYSIQUEOS_REMOTE_EXIT__:7\n" }) });
        this.emit("close", { code: 1000 });
      });
    }
  }
}

class ErrorWebSocket extends FakeWebSocketBase {
  constructor() {
    super();
    queueMicrotask(() => this.emit("error"));
  }

  send() {}
}

class EarlyCloseWebSocket extends FakeWebSocketBase {
  constructor() {
    super();
    queueMicrotask(() => this.emit("close", { code: 1000 }));
  }

  send() {}
}
