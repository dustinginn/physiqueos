import { execFileSync, execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PORT,
  getRuntimePaths,
  isPrivateLanAddress,
  parseIpconfigCandidates,
  readMetadata,
  resolveRepositoryRoot,
  selectPreferredLanAddress,
} from "./physiqueosTaskRuntime.mjs";

const repoRoot = resolveRepositoryRoot();
const defaultHealthUrl = `http://127.0.0.1:${DEFAULT_PORT}/api/health`;

export { resolveRepositoryRoot };

export function getLifecyclePaths(root = repoRoot) {
  return getRuntimePaths(root);
}

export function readBuildId(root = repoRoot) {
  const buildIdPath = getRuntimePaths(root).buildIdPath;
  return fs.readFile(buildIdPath, "utf8").then((value) => value.trim());
}

export async function readGitHead(root = repoRoot) {
  return execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
}

export function parseNetstatOutput(netstatOutput, port = DEFAULT_PORT) {
  const lines = String(netstatOutput ?? "").split(/\r?\n/);
  const matches = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    if (parts[0].toUpperCase() !== "TCP") continue;
    const local = parts[1];
    const state = parts[3]?.toUpperCase();
    const pid = Number(parts[4]);
    const localPort = Number(local.substring(local.lastIndexOf(":") + 1));
    const localAddress = local.slice(0, local.lastIndexOf(":"));
    if (localPort !== Number(port) || state !== "LISTENING") continue;
    matches.push({ localAddress, localPort, state, pid });
  }
  return matches;
}

export async function getPortListener(port = DEFAULT_PORT) {
  const output = await execFileAsync("netstat", ["-ano", "-p", "TCP"], { cwd: repoRoot });
  const listeners = parseNetstatOutput(output, port);
  return listeners[0] ?? null;
}

export async function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readPidFile(root = repoRoot) {
  const metadata = await readMetadata(root);
  if (!metadata) return null;
  return { ...metadata, pid: Number(metadata.pid) };
}

export async function ensureBuildIdExists(root = repoRoot) {
  const buildIdPath = getRuntimePaths(root).buildIdPath;
  await fs.access(buildIdPath, fsConstants.R_OK);
  return buildIdPath;
}

export async function resolveLanAddress() {
  const output = await execFileAsync("ipconfig", [], { cwd: repoRoot });
  const candidates = parseIpconfigCandidates(output);
  return selectPreferredLanAddress(candidates)?.ipAddress ?? null;
}

export async function probeHealth(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, status: response.status, body: null };
    }
    return { ok: true, status: response.status, body: await response.json() };
  } catch (error) {
    return { ok: false, status: null, body: null, error: String(error?.message ?? error) };
  }
}

export async function statusRuntime(root = repoRoot) {
  const pidInfo = await readPidFile(root);
  const listener = await getPortListener(DEFAULT_PORT);
  const processAlive = pidInfo?.pid ? await isProcessAlive(pidInfo.pid) : false;
  const lanAddress =
    pidInfo?.lanUrl
      ? String(pidInfo.lanUrl).replace(/^https?:\/\//, "").replace(/:\d+.*$/, "")
      : await resolveLanAddress().catch(() => null);
  const localhostHealth = await probeHealth(defaultHealthUrl);
  const lanHealth = lanAddress
    ? await probeHealth(`http://${lanAddress}:${DEFAULT_PORT}/api/health`)
    : { ok: false, status: null, body: null };
  return {
    pidInfo,
    processAlive,
    listener,
    localhostHealth,
    lanHealth,
    logs: {
      stdout: getRuntimePaths(root).stdoutLogPath,
      stderr: getRuntimePaths(root).stderrLogPath,
      lifecycle: getRuntimePaths(root).lifecycleLogPath,
    },
  };
}

export function classifyPortOwnership({
  listener,
  pidInfo,
  processAlive,
}) {
  if (!listener) return "no_listener";
  if (!pidInfo?.pid) return "orphan_listener";
  if (!processAlive) return "stale_metadata";
  if (listener.pid !== pidInfo.pid) return "port_conflict";
  return "owned";
}

export function formatRuntimeStatusSummary(status) {
  return {
    pid: status.pidInfo?.pid ?? null,
    processAlive: status.processAlive,
    listener: status.listener,
    localhostHealth: status.localhostHealth.ok,
    lanHealth: status.lanHealth.ok,
    portOwnership: classifyPortOwnership(status),
  };
}

async function execFileAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, encoding: "utf8", windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout ?? ""));
    });
  });
}

async function cli() {
  const command = process.argv[2];
  const root = process.argv[3] ? path.resolve(process.argv[3]) : repoRoot;
  try {
    switch (command) {
      case "status": {
        const result = await statusRuntime(root);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        break;
      }
      case "read-build": {
        process.stdout.write(`${await readBuildId(root)}\n`);
        break;
      }
      case "read-head": {
        process.stdout.write(`${await readGitHead(root)}\n`);
        break;
      }
      case "resolve-lan": {
        process.stdout.write(`${(await resolveLanAddress()) ?? ""}\n`);
        break;
      }
      default:
        throw new Error(`Unknown command: ${command ?? "(missing)"}`);
    }
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  await cli();
}
