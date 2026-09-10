import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runIsolatedProviderBuild } from "./runIsolatedProviderBuild.mjs";
import {
  assertWindowsIdentityUnchanged,
  captureWindowsBuildIdentity,
} from "./providerBuildSafety.mjs";

export async function runWindowsProtectedProviderBuild({
  canonicalRoot,
  runtimeReader = readWindowsRuntimeStatus,
  ...providerInput
} = {}) {
  const root = path.resolve(required(canonicalRoot, "canonicalRoot"));
  const beforeBuild = captureWindowsBuildIdentity(root);
  const beforeRuntime = await runtimeReader(root);
  assertRuntimeCanonical(beforeRuntime, root);
  let result;
  let operationError;
  try {
    result = await runIsolatedProviderBuild(providerInput);
  } catch (error) {
    operationError = error;
  }
  const afterBuild = captureWindowsBuildIdentity(root);
  const afterRuntime = await runtimeReader(root);
  try {
    assertRuntimeCanonical(afterRuntime, root);
    assertWindowsIdentityUnchanged(beforeBuild, afterBuild,
      beforeRuntime, afterRuntime);
  } catch (identityError) {
    identityError.cause = operationError;
    throw identityError;
  }
  if (operationError) throw operationError;
  return Object.freeze({
    ...result,
    windowsIdentity: Object.freeze({
      before: beforeBuild,
      after: afterBuild,
      runtime: beforeRuntime,
    }),
  });
}

function readWindowsRuntimeStatus(canonicalRoot) {
  if (process.platform !== "win32") {
    throw coded("PROVIDER_WINDOWS_STATUS_UNAVAILABLE",
      "The optional Windows compatibility wrapper only runs on Windows.");
  }
  const script = path.join(canonicalRoot, "scripts", "statusPhysiqueOS.ps1");
  const result = spawnSync("powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
      cwd: canonicalRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    });
  if (result.error) throw result.error;
  if (result.status !== 0) throw coded("PROVIDER_WINDOWS_STATUS_UNAVAILABLE",
    result.stderr || "Windows status failed.");
  const status = JSON.parse(result.stdout);
  return Object.freeze({
    pid: status.listener?.pid,
    startedAt: status.process?.startedAt,
    taskLastRunTime: status.task?.lastRunTime,
    taskWorkingDirectory: status.task?.workingDirectory,
    ownership: status.ownership?.ownershipDecision,
    overallState: status.overallState,
  });
}

function assertRuntimeCanonical(runtime, canonicalRoot) {
  if (runtime?.overallState !== "healthy" || runtime?.ownership !== "canonical" ||
      path.resolve(runtime?.taskWorkingDirectory ?? "") !== canonicalRoot ||
      !Number.isInteger(Number(runtime?.pid)) || !runtime?.startedAt) {
    throw coded("PROVIDER_WINDOWS_STATUS_UNSAFE",
      "Windows production identity is not healthy, canonical, and complete.");
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error(`Invalid argument: ${key ?? "<missing>"}`);
    }
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runWindowsProtectedProviderBuild({
    canonicalRoot: required(args["canonical-root"], "--canonical-root"),
    isolatedRoot: required(args["isolated-root"], "--isolated-root"),
    sourceCommit: required(args["source-commit"], "--source-commit"),
    providerBuildId: required(args["provider-build-id"], "--provider-build-id"),
    distDir: required(args["dist-dir"], "--dist-dir"),
    artifactDir: required(args["artifact-dir"], "--artifact-dir"),
  });
  process.stdout.write(`\n${JSON.stringify({ status: "PASS", ...result })}\n`);
}

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function coded(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) await main();
