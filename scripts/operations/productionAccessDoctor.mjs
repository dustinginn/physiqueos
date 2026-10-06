import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { load } from "js-yaml";
import {
  APPROVED_READ_CONTEXT,
  assertApprovedReadContext,
  buildGuardedReadOnlyPayload,
  parseFramedJson,
  validateSanitizedConsoleOutput,
} from "./productionAccessSafety.mjs";
import {
  loadNamedDoctlToken,
  resolveDoctlConfigPath,
  runPrimaryRunner,
} from "./runAppConsoleContextGzipSourceOnOpen.mjs";

export const DEFAULT_APP_NAME = "physiqueos-foundation-staging";
export const DEFAULT_COMPONENT_NAME = "web";
export const DEFAULT_HEALTH_PATH = "/api/v1/health/live";
const DO_API = "https://api.digitalocean.com/v2";
const DOCTOR_OUTPUT_PREFIX = "PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_JSON";
const TOOL_FILES = Object.freeze([
  "scripts/operations/productionAccessDoctor.mjs",
  "scripts/operations/productionAccessSafety.mjs",
  "scripts/operations/runAppConsoleContextGzipFile.mjs",
  "scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs",
]);
const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "../..");

export function parseDoctorArguments(args) {
  const [mode, ...rest] = args;
  if (!new Set(["local", "control-plane", "console"]).has(mode)) throw coded("DOCTOR_MODE_INVALID");
  const values = {
    mode,
    context: APPROVED_READ_CONTEXT,
    expectedSha: null,
    appName: DEFAULT_APP_NAME,
    componentName: DEFAULT_COMPONENT_NAME,
    configPath: null,
    structuralDiagnostics: false,
  };
  const options = new Map([
    ["--context", "context"],
    ["--expected-sha", "expectedSha"],
    ["--app-name", "appName"],
    ["--component", "componentName"],
    ["--doctl-config", "configPath"],
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--structural-diagnostics") {
      if (values.structuralDiagnostics) throw coded("DOCTOR_OPTION_INVALID");
      values.structuralDiagnostics = true;
      continue;
    }
    const key = options.get(rest[index]);
    const value = rest[index + 1];
    if (!key || !value) throw coded("DOCTOR_OPTION_INVALID");
    values[key] = value;
    index += 1;
  }
  assertApprovedReadContext(values.context);
  if ((mode === "control-plane" || mode === "console") && !/^[a-f0-9]{40}$/.test(values.expectedSha ?? "")) {
    throw coded("DOCTOR_EXPECTED_SHA_REQUIRED");
  }
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(values.appName)) throw coded("DOCTOR_APP_NAME_INVALID");
  if (!/^[A-Za-z0-9_-]+$/.test(values.componentName)) throw coded("DOCTOR_COMPONENT_INVALID");
  if (values.structuralDiagnostics && mode !== "console") throw coded("DOCTOR_DIAGNOSTICS_MODE_INVALID");
  return Object.freeze(values);
}

export function runLocalDoctor({
  root = defaultRoot,
  context = APPROVED_READ_CONTEXT,
  configPath = null,
  platform = process.platform,
  arch = process.arch,
  homeDir = os.homedir(),
  appData = process.env.APPDATA,
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
  existsSync = fs.existsSync,
  readFileSync = fs.readFileSync,
  statSync = fs.statSync,
  execFileSyncImpl = execFileSync,
  resolveDependency = (name) => createRequire(path.join(path.resolve(root), "package.json")).resolve(name),
  currentUid = typeof process.getuid === "function" ? process.getuid() : null,
} = {}) {
  assertApprovedReadContext(context);
  if (!new Set(["darwin", "win32", "linux"]).has(platform)) throw coded("DOCTOR_OS_UNSUPPORTED");
  if (!new Set(["arm64", "x64"]).has(arch)) throw coded("DOCTOR_ARCH_UNSUPPORTED");
  const resolvedRoot = path.resolve(root);
  if (!existsSync(path.join(resolvedRoot, "package.json")) || !existsSync(path.join(resolvedRoot, ".git"))) {
    throw coded("DOCTOR_REPOSITORY_ROOT_INVALID");
  }
  try { resolveDependency("js-yaml"); } catch { throw coded("DOCTOR_DEPENDENCY_MISSING"); }
  const versions = Object.freeze({
    node: process.version,
    git: safeCommand(execFileSyncImpl, "git", ["--version"], resolvedRoot),
    doctl: safeCommand(execFileSyncImpl, "doctl", ["version"], resolvedRoot),
  });
  if (typeof globalThis.WebSocket !== "function") throw coded("DOCTOR_WEBSOCKET_UNAVAILABLE");

  const resolvedConfigPath = resolveDoctlConfigPath({
    explicitPath: configPath,
    platform,
    homeDir,
    appData,
    xdgConfigHome,
    existsSync,
  });
  const configStat = statSync(resolvedConfigPath);
  if (platform !== "win32") {
    if ((configStat.mode & 0o077) !== 0) throw coded("DOCTOR_CONFIG_PERMISSIONS_UNSAFE");
    if (currentUid !== null && configStat.uid !== currentUid) throw coded("DOCTOR_CONFIG_OWNER_INVALID");
  }
  let parsed;
  try { parsed = load(readFileSync(resolvedConfigPath, "utf8")); } catch { throw coded("DOCTOR_CONFIG_INVALID"); }
  const contextNames = Object.keys(parsed?.["auth-contexts"] ?? {});
  if (!contextNames.includes(context)) throw coded("DOCTOR_CONTEXT_MISSING");

  const hashes = Object.fromEntries(TOOL_FILES.map((relative) => {
    const absolute = path.join(resolvedRoot, relative);
    if (!existsSync(absolute)) throw coded("DOCTOR_TOOL_FILE_MISSING");
    const tracked = safeCommand(execFileSyncImpl, "git", ["ls-files", "--error-unmatch", relative], resolvedRoot);
    if (tracked.trim() !== relative) throw coded("DOCTOR_TOOL_FILE_UNTRACKED");
    return [relative, createHash("sha256").update(readFileSync(absolute)).digest("hex")];
  }));
  const dirty = safeCommand(execFileSyncImpl, "git", ["status", "--porcelain=v1", "--", ...TOOL_FILES], resolvedRoot).trim();
  if (dirty) throw coded("DOCTOR_TOOL_FILES_DIRTY");
  const commit = safeCommand(execFileSyncImpl, "git", ["rev-parse", "HEAD"], resolvedRoot).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw coded("DOCTOR_REPOSITORY_COMMIT_INVALID");

  return Object.freeze({
    mode: "local",
    passed: true,
    host: { platform, arch },
    repository: { commit, toolHashes: hashes },
    runtime: versions,
    credential: {
      context,
      configDiscovery: configPath ? "explicit" : "platform-default",
      ownerOnlyPermissions: platform === "win32" ? "os-managed" : true,
      contextPresent: true,
    },
  });
}

export async function discoverControlPlaneAuthority({
  token,
  expectedSha,
  appName = DEFAULT_APP_NAME,
  componentName = DEFAULT_COMPONENT_NAME,
  fetchImpl = globalThis.fetch,
} = {}) {
  const appsPayload = await requestJson(`${DO_API}/apps?per_page=200`, { token, fetchImpl });
  const matches = (appsPayload?.apps ?? []).filter((app) => app?.spec?.name === appName);
  if (matches.length !== 1) throw coded(matches.length ? "DOCTOR_APP_AMBIGUOUS" : "DOCTOR_APP_NOT_FOUND");
  const app = matches[0];
  const active = app.active_deployment;
  if (!active || active.phase !== "ACTIVE") throw coded("DOCTOR_DEPLOYMENT_NOT_ACTIVE");
  if (app.in_progress_deployment) throw coded("DOCTOR_DEPLOYMENT_TRANSITIONAL");
  const progress = active.progress ?? {};
  if (!Number.isInteger(progress.success_steps) || progress.success_steps !== progress.total_steps || progress.total_steps < 1) {
    throw coded("DOCTOR_DEPLOYMENT_INCOMPLETE");
  }
  const webMatches = (active.services ?? []).filter((item) => item.name === componentName);
  const workerMatches = (active.workers ?? []).filter((item) => item.name === "worker");
  if (webMatches.length !== 1 || workerMatches.length !== 1) throw coded("DOCTOR_COMPONENT_AUTHORITY_AMBIGUOUS");
  const webSha = String(webMatches[0].source_commit_hash ?? "");
  const workerSha = String(workerMatches[0].source_commit_hash ?? "");
  if (webSha !== expectedSha || workerSha !== expectedSha || webSha !== workerSha) throw coded("DOCTOR_SOURCE_AUTHORITY_MISMATCH");
  const ingress = String(app.default_ingress ?? "").replace(/\/$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(ingress)) throw coded("DOCTOR_INGRESS_INVALID");
  const health = await requestJson(`${ingress}${DEFAULT_HEALTH_PATH}`, { fetchImpl });
  if (health?.status !== "ok") throw coded("DOCTOR_PUBLIC_HEALTH_FAILED");
  const expectedBuildPrefix = `physiqueos-${expectedSha.slice(0, 8)}-`;
  if (!String(health.buildId ?? "").startsWith(expectedBuildPrefix)) throw coded("DOCTOR_PUBLIC_SOURCE_MISMATCH");
  return Object.freeze({
    mode: "control-plane",
    passed: true,
    app: { id: app.id, name: appName, ingress },
    deployment: {
      id: active.id,
      phase: active.phase,
      progress: { successSteps: progress.success_steps, totalSteps: progress.total_steps },
      inProgress: false,
    },
    components: { web: { name: componentName, sourceSha: webSha }, worker: { name: "worker", sourceSha: workerSha } },
    health: { status: health.status, buildId: health.buildId },
  });
}

export async function runControlPlaneDoctor({
  root = defaultRoot,
  context = APPROVED_READ_CONTEXT,
  expectedSha,
  appName = DEFAULT_APP_NAME,
  componentName = DEFAULT_COMPONENT_NAME,
  configPath = null,
  fetchImpl = globalThis.fetch,
  localDoctor = runLocalDoctor,
} = {}) {
  const local = localDoctor({ root, context, configPath });
  const resolvedConfigPath = resolveDoctlConfigPath({ explicitPath: configPath });
  const token = loadNamedDoctlToken({ configPath: resolvedConfigPath, context });
  const authority = await discoverControlPlaneAuthority({ token, expectedSha, appName, componentName, fetchImpl });
  return Object.freeze({ ...authority, localCommit: local.repository.commit, context });
}

export async function runConsoleDoctor({
  root = defaultRoot,
  context = APPROVED_READ_CONTEXT,
  expectedSha,
  appName = DEFAULT_APP_NAME,
  componentName = DEFAULT_COMPONENT_NAME,
  configPath = null,
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  controlPlaneDoctor = runControlPlaneDoctor,
  primaryRunner = runPrimaryRunner,
  structuralDiagnostics = false,
} = {}) {
  const before = await controlPlaneDoctor({ root, context, expectedSha, appName, componentName, configPath, fetchImpl });
  const marker = `PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_CONSOLE_OK_${expectedSha.slice(0, 12)}`;
  const outputPrefix = "PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_CONSOLE_JSON";
  const source = buildGuardedReadOnlyPayload({
    marker,
    outputPrefix,
    expectedGitSha: expectedSha,
    applicationName: "physiqueos-production-access-doctor",
    allowedReportKeys: ["bindingPresence", "probe", "runtime", "transaction"],
    auditBody: `
const rows = await select("SELECT $1::int AS value", [1], { maxRows: 1 });
return {
  bindingPresence,
  probe: { selectOne: rows.length === 1 && rows[0]?.value === 1 },
  runtime: { gitSha: String(process.env.PHYSIQUEOS_GIT_SHA ?? "") },
  transaction: { readOnly: transactionReadOnly },
};`,
  });
  let rawOutput = "";
  await primaryRunner({
    args: [context, before.app.id, componentName, gzipSync(Buffer.from(source)).toString("base64"), ...(configPath ? ["--doctl-config", configPath] : [])],
    fetchImpl,
    WebSocketImpl,
    stdout: { write: (value) => { rawOutput += String(value); } },
  });
  validateSanitizedConsoleOutput(rawOutput, { marker, prefix: outputPrefix, structuralDiagnostics });
  const consoleReport = parseFramedJson(rawOutput, outputPrefix, { marker, structuralDiagnostics });
  if (consoleReport.runtime?.gitSha !== expectedSha || consoleReport.bindingPresence?.databaseUrl !== true ||
      consoleReport.bindingPresence?.databaseCa !== true || consoleReport.transaction?.readOnly !== "on" ||
      consoleReport.probe?.selectOne !== true) {
    throw coded("DOCTOR_CONSOLE_REPORT_INVALID");
  }
  const after = await controlPlaneDoctor({ root, context, expectedSha, appName, componentName, configPath, fetchImpl });
  if (before.app.id !== after.app.id || before.deployment.id !== after.deployment.id ||
      before.components.web.sourceSha !== after.components.web.sourceSha || before.health.buildId !== after.health.buildId) {
    throw coded("DOCTOR_POST_CONSOLE_AUTHORITY_DRIFT");
  }
  return Object.freeze({
    mode: "console",
    passed: true,
    context,
    app: before.app,
    deployment: before.deployment,
    sourceSha: expectedSha,
    bindingPresence: consoleReport.bindingPresence,
    transaction: { readOnly: "on", rolledBack: true },
    probe: { selectOne: true },
    markerObservedExactlyOnce: true,
    postCheckStable: true,
  });
}

export async function runDoctor(options) {
  if (options.mode === "local") return runLocalDoctor(options);
  if (options.mode === "control-plane") return runControlPlaneDoctor(options);
  return runConsoleDoctor(options);
}

function safeCommand(execFileSyncImpl, command, args, cwd) {
  try {
    return String(execFileSyncImpl(command, args, { cwd, encoding: "utf8", windowsHide: true }) ?? "").trim();
  } catch {
    throw coded(`DOCTOR_${command.toUpperCase()}_UNAVAILABLE`);
  }
}

async function requestJson(url, { token = null, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: token ? { authorization: `Bearer ${token}`, accept: "application/json" } : { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw coded(token ? "DOCTOR_CONTROL_PLANE_REQUEST_FAILED" : "DOCTOR_PUBLIC_HEALTH_REQUEST_FAILED");
  }
  if (!response?.ok) {
    const status = Number(response?.status) || "UNKNOWN";
    throw coded(token ? `DOCTOR_CONTROL_PLANE_HTTP_${status}` : `DOCTOR_PUBLIC_HEALTH_HTTP_${status}`);
  }
  try { return await response.json(); } catch { throw coded("DOCTOR_RESPONSE_INVALID"); }
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const options = parseDoctorArguments(process.argv.slice(2));
    const result = await runDoctor(options);
    process.stdout.write(`${DOCTOR_OUTPUT_PREFIX}:${JSON.stringify(result)}\n`);
    process.stdout.write(`PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_${options.mode.replace("-", "_").toUpperCase()}_OK\n`);
  } catch (error) {
    process.stderr.write(`PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_FAILED:${error?.code ?? "UNKNOWN"}\n`);
    if (error?.structuralDiagnostics) {
      process.stderr.write(`PHYSIQUEOS_PRODUCTION_ACCESS_DOCTOR_DIAGNOSTICS:${JSON.stringify(error.structuralDiagnostics)}\n`);
    }
    process.exitCode = 1;
  }
}
