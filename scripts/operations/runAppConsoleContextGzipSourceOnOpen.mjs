import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";

const DEFAULT_TIMEOUT_MS = 300_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const REMOTE_EXIT_PREFIX = "__PHYSIQUEOS_REMOTE_EXIT__:";
const SAFE_CONTEXT = /^[A-Za-z0-9_-]+$/;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function resolveDoctlConfigPath({
  explicitPath = null,
  platform = process.platform,
  homeDir = os.homedir(),
  appData = process.env.APPDATA,
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
  existsSync = fs.existsSync,
} = {}) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!existsSync(resolved)) throw coded("DOCTL_CONFIG_NOT_FOUND");
    return resolved;
  }

  const candidates = [];
  if (platform === "win32") {
    if (appData) candidates.push(path.join(appData, "doctl", "config.yaml"));
    candidates.push(path.join(homeDir, "AppData", "Roaming", "doctl", "config.yaml"));
  } else if (platform === "darwin") {
    candidates.push(path.join(homeDir, "Library", "Application Support", "doctl", "config.yaml"));
    candidates.push(path.join(xdgConfigHome || path.join(homeDir, ".config"), "doctl", "config.yaml"));
  } else {
    candidates.push(path.join(xdgConfigHome || path.join(homeDir, ".config"), "doctl", "config.yaml"));
  }

  const existing = uniquePaths(candidates, platform).filter((candidate) => existsSync(candidate));
  if (existing.length === 0) throw coded("DOCTL_CONFIG_NOT_FOUND");
  if (existing.length !== 1) throw coded("DOCTL_CONFIG_AMBIGUOUS");
  return existing[0];
}

export function loadNamedDoctlToken({ configPath, context, readFileSync = fs.readFileSync } = {}) {
  if (!SAFE_CONTEXT.test(context ?? "")) throw coded("DOCTL_CONTEXT_INVALID");
  let config;
  try {
    config = load(readFileSync(configPath, "utf8"));
  } catch {
    throw coded("DOCTL_CONFIG_INVALID");
  }
  const contexts = config?.["auth-contexts"];
  if (!contexts || typeof contexts !== "object" || !Object.hasOwn(contexts, context)) {
    throw coded("DOCTL_CONTEXT_NOT_FOUND");
  }
  const token = contexts[context];
  if (typeof token !== "string" || token.length < 20) throw coded("DOCTL_CONTEXT_INVALID");
  return token;
}

export function parsePrimaryArguments(args) {
  const [context, appId, componentName, encodedSource, ...options] = args;
  if (!SAFE_CONTEXT.test(context ?? "")) throw coded("DOCTL_CONTEXT_INVALID");
  if (!SAFE_ID.test(appId ?? "")) throw coded("APP_ID_INVALID");
  if (!SAFE_ID.test(componentName ?? "")) throw coded("COMPONENT_NAME_INVALID");
  if (!isCanonicalBase64(encodedSource)) throw coded("PAYLOAD_INVALID");

  let explicitConfigPath = null;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] !== "--doctl-config" || explicitConfigPath || !options[index + 1]) {
      throw coded("RUNNER_OPTION_INVALID");
    }
    explicitConfigPath = options[index + 1];
    index += 1;
  }
  return { context, appId, componentName, encodedSource, explicitConfigPath };
}

export async function requestExecUrl({
  token,
  appId,
  componentName,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  let response;
  try {
    response = await fetchImpl(
      `https://api.digitalocean.com/v2/apps/${encodeURIComponent(appId)}/components/${encodeURIComponent(componentName)}/exec`,
      {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
  } catch {
    throw coded("DIGITALOCEAN_EXEC_REQUEST_FAILED");
  }
  if (!response?.ok) throw coded(`DIGITALOCEAN_EXEC_HTTP_${Number(response?.status) || "UNKNOWN"}`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw coded("DIGITALOCEAN_EXEC_RESPONSE_INVALID");
  }
  if (!/^wss:\/\//.test(String(payload?.url ?? ""))) throw coded("DIGITALOCEAN_EXEC_URL_INVALID");
  return payload.url;
}

export async function runRemoteConsole({
  url,
  encodedSource,
  WebSocketImpl = globalThis.WebSocket,
  stdout = process.stdout,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = MAX_OUTPUT_BYTES,
  delays = { open: 2_000, echo: 250, command: 750, chunk: 250, cursor: 500 },
} = {}) {
  if (typeof WebSocketImpl !== "function") throw coded("WEBSOCKET_UNAVAILABLE");
  let socket;
  try {
    socket = new WebSocketImpl(url);
  } catch {
    throw coded("WEBSOCKET_OPEN_FAILED");
  }

  socket.binaryType = "arraybuffer";
  const chunks = encodedSource.match(/[\s\S]{1,600}/g) ?? [];
  const output = [];
  let outputBytes = 0;
  let inputStarted = false;
  let exitSent = false;
  let settled = false;
  let timeoutId;

  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      error ? reject(error) : resolve(value);
    };
    const fail = (code) => {
      try { socket.close(1000, "bounded failure"); } catch {}
      finish(coded(code));
    };
    const send = (data) => {
      try {
        socket.send(JSON.stringify({ op: "stdin", data }));
      } catch {
        fail("WEBSOCKET_SEND_FAILED");
      }
    };
    const startInput = async () => {
      if (inputStarted || settled) return;
      inputStarted = true;
      try {
        await wait(delays.echo);
        send("stty -echo\n");
        await wait(delays.command);
        send("base64 -d <<'PHYSIQUEOS_GZIP_SOURCE' | gzip -d | node --input-type=module\n");
        for (const chunk of chunks) {
          await wait(delays.chunk);
          send(`${chunk}\n`);
        }
        await wait(delays.chunk);
        send(
          `PHYSIQUEOS_GZIP_SOURCE\nPHYSIQUEOS_REMOTE_STATUS=$?\nprintf '\\n${REMOTE_EXIT_PREFIX}%s\\n' "$PHYSIQUEOS_REMOTE_STATUS"\nexit "$PHYSIQUEOS_REMOTE_STATUS"\n`,
        );
        exitSent = true;
      } catch {
        fail("REMOTE_INPUT_FAILED");
      }
    };

    timeoutId = setTimeout(() => fail("REMOTE_CONSOLE_TIMEOUT"), timeoutMs);
    socket.addEventListener("open", () => {
      try {
        socket.send(JSON.stringify({ op: "resize", width: 120, height: 40 }));
      } catch {
        fail("WEBSOCKET_SEND_FAILED");
        return;
      }
      setTimeout(() => void startInput(), delays.open);
    });
    socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
      let text = raw;
      try { text = String(JSON.parse(raw).data ?? ""); } catch {}
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > maxOutputBytes) {
        fail("REMOTE_OUTPUT_LIMIT_EXCEEDED");
        return;
      }
      output.push(text);
      stdout.write(text);
      if (text.includes("\u001b[6n")) {
        send("\u001b[1;1R");
        setTimeout(() => void startInput(), delays.cursor);
      }
    });
    socket.addEventListener("error", () => fail("WEBSOCKET_ERROR"));
    socket.addEventListener("close", (event) => {
      if (settled) return;
      if (!exitSent) {
        finish(coded("WEBSOCKET_UNEXPECTED_CLOSE"));
        return;
      }
      if (![1000, 1005].includes(Number(event.code))) {
        finish(coded("WEBSOCKET_ABNORMAL_CLOSE"));
        return;
      }
      const combined = output.join("");
      const statuses = [...combined.matchAll(new RegExp(`${REMOTE_EXIT_PREFIX}(\\d+)`, "g"))];
      if (statuses.length !== 1) {
        finish(coded("REMOTE_EXIT_STATUS_MISSING"));
        return;
      }
      const remoteStatus = Number(statuses[0][1]);
      if (remoteStatus !== 0) {
        finish(coded(`REMOTE_PROCESS_EXIT_${remoteStatus}`));
        return;
      }
      finish(null, { closeCode: Number(event.code), remoteStatus, outputBytes });
    });
  });
}

export async function runPrimaryRunner({
  args,
  platform = process.platform,
  homeDir = os.homedir(),
  appData = process.env.APPDATA,
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
  existsSync = fs.existsSync,
  readFileSync = fs.readFileSync,
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  stdout = process.stdout,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  delays,
} = {}) {
  const parsed = parsePrimaryArguments(args);
  const configPath = resolveDoctlConfigPath({
    explicitPath: parsed.explicitConfigPath,
    platform,
    homeDir,
    appData,
    xdgConfigHome,
    existsSync,
  });
  const token = loadNamedDoctlToken({ configPath, context: parsed.context, readFileSync });
  const url = await requestExecUrl({ token, appId: parsed.appId, componentName: parsed.componentName, fetchImpl });
  return runRemoteConsole({
    url,
    encodedSource: parsed.encodedSource,
    WebSocketImpl,
    stdout,
    timeoutMs,
    delays,
  });
}

export function formatPrimaryFailure(error) {
  return `PHYSIQUEOS_READONLY_RUNNER_FAILED:${error?.code ?? "UNKNOWN"}\n`;
}

function uniquePaths(values, platform) {
  const seen = new Set();
  return values.map((value) => path.resolve(value)).filter((value) => {
    const key = platform === "win32" ? value.toLowerCase() : value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isCanonicalBase64(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    await runPrimaryRunner({ args: process.argv.slice(2) });
  } catch (error) {
    process.stderr.write(formatPrimaryFailure(error));
    process.exitCode = 1;
  }
}
