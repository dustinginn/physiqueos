import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOperationalJsonBytes } from "./lib/operationalJson.mjs";

export const TASK_NAME = "PhysiqueOS Production Server";
export const MONITOR_TASK_NAME = "PhysiqueOS Runtime Monitor";
export const NODE_PATH = "C:\\Program Files\\nodejs\\node.exe";
export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = "0.0.0.0";
export const RESTART_INTERVAL_MINUTES = 1;
export const RESTART_COUNT = 3;
export const STARTUP_GRACE_SECONDS = 45;
export const LAUNCHER_VERSION = "scheduled-task-v2-direct-node";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export function resolveRepositoryRoot() {
  return repoRoot;
}

export function getRuntimePaths(root = repoRoot) {
  const logsDirectory = path.join(root, "logs");
  return {
    root,
    logsDirectory,
    metadataFilePath: path.join(logsDirectory, "physiqueos-runtime.json"),
    controlFilePath: path.join(logsDirectory, "physiqueos-runtime-control.json"),
    monitorLogPath: path.join(logsDirectory, "physiqueos-runtime-monitor.log"),
    lifecycleLogPath: path.join(logsDirectory, "physiqueos-runtime.lifecycle.log"),
    taskInstallLogPath: path.join(logsDirectory, "physiqueos-task-install.log"),
    buildIdPath: path.join(root, ".next", "BUILD_ID"),
    nextBinPath: path.join(root, "node_modules", "next", "dist", "bin", "next"),
    healthRoutePath: path.join(root, "src", "app", "api", "health", "route.js"),
  };
}

export function parseControlState(value) {
  if (!value || value.schemaVersion !== 1) return null;
  if (!["running", "stopped"].includes(value.desiredState)) return null;
  return {
    schemaVersion: 1,
    desiredState: value.desiredState,
    changedAt: value.changedAt ?? null,
    changedBy: value.changedBy ?? null,
    reason: value.reason ?? null,
    lastRecoveryAttemptAt: value.lastRecoveryAttemptAt ?? null,
    lastRecoveryOutcome: value.lastRecoveryOutcome ?? null,
    consecutiveRecoveryFailures: Number.isInteger(value.consecutiveRecoveryFailures)
      ? Math.max(0, value.consecutiveRecoveryFailures)
      : 0,
    lastHealthyAt: value.lastHealthyAt ?? null,
    consecutiveUnhealthyChecks: Number.isInteger(value.consecutiveUnhealthyChecks)
      ? Math.max(0, value.consecutiveUnhealthyChecks)
      : 0,
  };
}

export function decideMonitorAction({
  controlState,
  buildPresent = true,
  taskValid = true,
  taskState = "Ready",
  listener = null,
  canonicalListener = false,
  healthOk = false,
  withinStartupGrace = false,
  recoveryBackoffActive = false,
} = {}) {
  if (!controlState) return { outcome: "invalid_control_state", action: "none" };
  if (controlState.desiredState === "stopped") return { outcome: "intentional_stop", action: "none" };
  if (!buildPresent) return { outcome: "build_missing", action: "none" };
  if (!taskValid) return { outcome: "task_invalid", action: "none" };
  if (listener && !canonicalListener) return { outcome: "foreign_listener", action: "none" };
  if (listener && canonicalListener && healthOk) return { outcome: "healthy", action: "none" };
  if (
    listener && canonicalListener &&
    String(taskState).toLowerCase() === "running" &&
    withinStartupGrace
  ) {
    return { outcome: "starting_http", action: "none" };
  }
  if (listener && canonicalListener) return { outcome: "unhealthy", action: "none" };
  if (String(taskState).toLowerCase() === "running" || withinStartupGrace) {
    return { outcome: "starting", action: "none" };
  }
  if (recoveryBackoffActive) return { outcome: "recovery_pending", action: "none" };
  return { outcome: "recovery_required", action: "start_task" };
}

export function normalizeTaskState(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "running") return "running";
  if (normalized === "ready") return "ready";
  if (normalized === "queued") return "queued";
  if (normalized === "disabled") return "disabled";
  return normalized;
}

export function classifyRuntimeStatus({
  taskInstalled = true,
  taskState = "unknown",
  processAlive = false,
  listener = null,
  localhostHealth = false,
  lanHealth = false,
  metadataPresent = false,
  foreignListener = false,
  taskProcessMismatch = false,
  canonicalListener = true,
  withinStartupGrace = false,
} = {}) {
  if (foreignListener) return "foreign_listener";
  if (taskProcessMismatch) return "task_process_mismatch";
  if (metadataPresent && !processAlive) return "stale_metadata";
  if (!taskInstalled || normalizeTaskState(taskState) === "ready") return "stopped";
  if (!listener && !processAlive) return "starting";
  if (listener && localhostHealth) return "healthy";
  if (
    listener && canonicalListener &&
    normalizeTaskState(taskState) === "running" &&
    withinStartupGrace
  ) return "starting_http";
  return "unhealthy";
}

export function isPrivateLanAddress(address) {
  const value = String(address ?? "").trim();
  if (!value) return false;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  const match = value.match(/^172\.(\d+)\./);
  if (!match) return false;
  const octet = Number(match[1]);
  return octet >= 16 && octet <= 31;
}

export function isIgnoredAdapterName(name) {
  const value = String(name ?? "").toLowerCase();
  return [
    "loopback",
    "wsl",
    "hyper-v",
    "vethernet",
    "virtualbox",
    "vpn",
    "bluetooth",
    "teredo",
  ].some((token) => value.includes(token));
}

export function selectPreferredLanAddress(candidates = []) {
  return candidates.find((candidate) =>
    candidate &&
    isPrivateLanAddress(candidate.ipAddress) &&
    !isIgnoredAdapterName(candidate.interfaceAlias) &&
    candidate.hasDefaultGateway !== false
  ) ?? null;
}

export function parseIpconfigCandidates(output) {
  const text = String(output ?? "");
  const adapterBlocks = text.split(/\r?\n\r?\n/);
  const candidates = [];
  for (const block of adapterBlocks) {
    const headerMatch = block.match(/^(?<kind>.+? adapter) (?<name>.+?):/im);
    if (!headerMatch) continue;
    const ipMatch = block.match(/IPv4 Address[^:]*:\s*(?<ip>[0-9.]+)/i);
    if (!ipMatch) continue;
    const gatewayMatch = block.match(/Default Gateway[^:]*:\s*(?<gateway>[0-9.]+)/i);
    candidates.push({
      interfaceAlias: headerMatch.groups.name.trim(),
      adapterKind: headerMatch.groups.kind.trim(),
      ipAddress: ipMatch.groups.ip.trim(),
      hasDefaultGateway: Boolean(gatewayMatch?.groups?.gateway),
    });
  }
  return candidates;
}

export function buildTaskActionCommand(root = repoRoot) {
  const nextBinPath = path.join(root, "node_modules", "next", "dist", "bin", "next");
  return {
    execute: NODE_PATH,
    arguments: `"${nextBinPath}" start --hostname ${DEFAULT_HOST} --port ${DEFAULT_PORT}`,
    workingDirectory: root,
  };
}

export function buildRuntimeMetadata({
  pid,
  gitHead,
  buildId,
  startedAt,
  localUrl,
  lanUrl,
  healthCheckedAt,
  taskState,
  taskName = TASK_NAME,
  repositoryRoot = repoRoot,
  launcherVersion = LAUNCHER_VERSION,
} = {}) {
  return {
    schemaVersion: 2,
    taskName,
    listenerPid: pid,
    processStartedAt: startedAt,
    healthCheckedAt: healthCheckedAt ?? null,
    port: DEFAULT_PORT,
    hostname: DEFAULT_HOST,
    repositoryPath: repositoryRoot,
    nodePath: NODE_PATH,
    taskState: taskState ?? null,
    healthStatus: null,
    gitHead,
    buildId,
    localUrl,
    lanUrl,
    launcherVersion,
  };
}

export async function ensureRuntimeDirectories(root = repoRoot) {
  await fs.mkdir(getRuntimePaths(root).logsDirectory, { recursive: true });
}

export async function ensureBuildIdExists(root = repoRoot) {
  const buildIdPath = getRuntimePaths(root).buildIdPath;
  await fs.access(buildIdPath, fsConstants.R_OK);
  return buildIdPath;
}

export async function readMetadata(root = repoRoot) {
  try {
    const raw = await fs.readFile(getRuntimePaths(root).metadataFilePath);
    return parseOperationalJsonBytes(raw,
      { filePath: getRuntimePaths(root).metadataFilePath, stage: "runtime_metadata" });
  } catch {
    return null;
  }
}

export async function writeMetadata(root = repoRoot, payload) {
  await ensureRuntimeDirectories(root);
  await fs.writeFile(
    getRuntimePaths(root).metadataFilePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

export async function removeMetadata(root = repoRoot) {
  const paths = getRuntimePaths(root);
  await safeUnlink(paths.metadataFilePath);
}

async function safeUnlink(targetPath) {
  try {
    await fs.unlink(targetPath);
  } catch {}
}
