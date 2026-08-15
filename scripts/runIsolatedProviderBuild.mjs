import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectProviderWorkerArtifact } from "./collectProviderWorkerArtifact.mjs";
import { scanProviderArtifact } from "./scanProviderArtifact.mjs";
import {
  assertProviderBuildLocation,
  assertWindowsIdentityUnchanged,
  captureWindowsBuildIdentity,
  snapshotDirectory,
} from "./providerBuildSafety.mjs";

export async function runIsolatedProviderBuild({
  canonicalRoot,
  isolatedRoot,
  sourceCommit,
  providerBuildId,
  distDir,
  artifactDir,
  buildRunner = runNextBuild,
  runtimeReader = readWindowsRuntimeStatus,
  artifactScanner = scanProviderArtifact,
} = {}) {
  const guard = assertProviderBuildLocation({
    sourceRoot: isolatedRoot, canonicalRoot, isolatedRoot, distDir, sourceCommit, providerBuildId,
  });
  verifyGitIdentity(guard.sourceRoot, sourceCommit);
  const artifactRoot = path.resolve(guard.sourceRoot, required(artifactDir, "artifactDir"));
  assertIsolatedOutput(guard.sourceRoot, artifactRoot, guard.destination);
  if (fs.existsSync(guard.destination) || fs.existsSync(artifactRoot)) {
    throw coded("PROVIDER_BUILD_DESTINATION_EXISTS", "Provider build and artifact destinations must be fresh.");
  }

  const beforeBuild = captureWindowsBuildIdentity(guard.canonicalRoot);
  const beforeRuntime = await runtimeReader(guard.canonicalRoot);
  assertRuntimeCanonical(beforeRuntime, guard.canonicalRoot);
  let result;
  let operationError;
  try {
    await buildRunner({ ...guard, sourceCommit, providerBuildId, distDir });
    const buildIdPath = path.join(guard.destination, "BUILD_ID");
    if (!fs.existsSync(buildIdPath)) throw coded("PROVIDER_BUILD_OUTPUT_INVALID", "Next build identity is missing.");
    fs.writeFileSync(path.join(guard.destination, "SOURCE_COMMIT"), sourceCommit, { encoding: "ascii", flag: "wx" });

    const webRoot = path.join(artifactRoot, "web");
    const workerRoot = path.join(artifactRoot, "worker");
    assembleWebArtifact({ sourceRoot: guard.sourceRoot, distRoot: guard.destination, distDir, webRoot });
    const worker = await collectProviderWorkerArtifact({ sourceRoot: guard.sourceRoot, outputRoot: workerRoot });
    const scan = await artifactScanner({ roots: [webRoot, workerRoot] });
    const web = inventoryRoots([webRoot]);
    const workerInventory = { ...worker, sha256: hashRoots([workerRoot]) };
    result = Object.freeze({
      sourceCommit,
      providerBuildId,
      isolatedRoot: guard.sourceRoot,
      distDir,
      nextBuildId: fs.readFileSync(buildIdPath, "utf8").trim(),
      web: { ...web, routeCount: countRoutes(guard.destination), staticAssetCount: countFiles(path.join(guard.destination, "static")) },
      worker: workerInventory,
      privacyScan: scan,
      artifactRoot,
    });
  } catch (error) {
    operationError = error;
  }

  const afterBuild = captureWindowsBuildIdentity(guard.canonicalRoot);
  const afterRuntime = await runtimeReader(guard.canonicalRoot);
  try {
    assertRuntimeCanonical(afterRuntime, guard.canonicalRoot);
    assertWindowsIdentityUnchanged(beforeBuild, afterBuild, beforeRuntime, afterRuntime);
  } catch (identityError) {
    identityError.cause = operationError;
    throw identityError;
  }
  if (operationError) throw operationError;
  return Object.freeze({ ...result, windowsIdentity: { before: beforeBuild, after: afterBuild, runtime: beforeRuntime } });
}

function assembleWebArtifact({ sourceRoot, distRoot, distDir, webRoot }) {
  copyTree(path.join(distRoot, "standalone"), webRoot);
  const publicRoot = path.join(sourceRoot, "public");
  if (fs.existsSync(publicRoot)) {
    copyTree(publicRoot, path.join(webRoot, "public"), (relative) => relative !== "mockup-home.png");
  }
  copyTree(path.join(distRoot, "static"), path.join(webRoot, path.basename(distDir), "static"));
}

function copyTree(source, destination, filter = () => true, relativeRoot = "") {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw coded("PROVIDER_BUILD_REPARSE_PATH_FORBIDDEN", `Artifact source contains a link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source).sort()) {
      const relative = relativeRoot ? `${relativeRoot}/${entry}` : entry;
      if (filter(relative)) copyTree(path.join(source, entry), path.join(destination, entry), filter, relative);
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  }
}

function runNextBuild({ sourceRoot, canonicalRoot, isolatedRoot, sourceCommit, providerBuildId, distDir }) {
  const next = resolveNextCli(sourceRoot);
  const result = spawnSync(process.execPath, [next, "build", "--webpack"], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=1536",
      NEXT_PHASE: "phase-production-build",
      PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
      PHYSIQUEOS_CANONICAL_WINDOWS_ROOT: canonicalRoot,
      PHYSIQUEOS_PROVIDER_ISOLATED_BUILD_ROOT: isolatedRoot,
      PHYSIQUEOS_BUILD_DIST_DIR: distDir,
      PHYSIQUEOS_GIT_SHA: sourceCommit,
      PHYSIQUEOS_BUILD_ID: providerBuildId,
    },
    stdio: "inherit", windowsHide: true, timeout: 900_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw coded("PROVIDER_BUILD_FAILED", `Next build failed with exit code ${result.status}.`);
}

function readWindowsRuntimeStatus(canonicalRoot) {
  const script = path.join(canonicalRoot, "scripts", "statusPhysiqueOS.ps1");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
    cwd: canonicalRoot, encoding: "utf8", windowsHide: true, timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw coded("PROVIDER_WINDOWS_STATUS_UNAVAILABLE", result.stderr || "Windows status failed.");
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
  if (runtime?.overallState !== "healthy" || runtime?.ownership !== "canonical"
      || path.resolve(runtime?.taskWorkingDirectory ?? "") !== path.resolve(canonicalRoot)
      || !Number.isInteger(Number(runtime?.pid)) || !runtime?.startedAt) {
    throw coded("PROVIDER_WINDOWS_STATUS_UNSAFE", "Windows production identity is not healthy, canonical, and complete.");
  }
}

function verifyGitIdentity(sourceRoot, expectedCommit) {
  const head = git(sourceRoot, ["rev-parse", "HEAD"]);
  if (head !== expectedCommit) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID", `Isolated HEAD ${head} does not match ${expectedCommit}.`);
  const status = git(sourceRoot, ["status", "--porcelain", "--untracked-files=no"]);
  if (status) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID", "Isolated source contains tracked changes.");
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID", result.stderr || "Git identity check failed.");
  return result.stdout.trim();
}

function resolveNextCli(sourceRoot) {
  const dependencyRoot = path.join(sourceRoot, "node_modules");
  if (fs.existsSync(dependencyRoot) && fs.lstatSync(dependencyRoot).isSymbolicLink()) {
    throw coded("PROVIDER_BUILD_TOOLCHAIN_REPARSE_FORBIDDEN",
      "The isolated provider checkout must have a physical node_modules tree, not a junction or symbolic link.");
  }
  const candidate = path.join(dependencyRoot, "next", "dist", "bin", "next");
  if (fs.existsSync(candidate)) return candidate;
  throw coded("PROVIDER_BUILD_TOOLCHAIN_MISSING", "The pinned Next CLI is unavailable inside the isolated checkout.");
}

function assertIsolatedOutput(sourceRoot, artifactRoot, distRoot) {
  for (const target of [artifactRoot, distRoot]) {
    const relative = path.relative(sourceRoot, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw coded("PROVIDER_BUILD_DESTINATION_FORBIDDEN", "All provider outputs must remain inside the isolated source root.");
    }
  }
  if (artifactRoot === distRoot || artifactRoot.startsWith(`${distRoot}${path.sep}`) || distRoot.startsWith(`${artifactRoot}${path.sep}`)) {
    throw coded("PROVIDER_BUILD_DESTINATION_FORBIDDEN", "Build and artifact destinations must be disjoint.");
  }
}

function inventoryRoots(roots) {
  let fileCount = 0;
  let totalBytes = 0;
  for (const root of roots) {
    const snapshot = snapshotDirectory(root);
    fileCount += snapshot.fileCount;
    totalBytes += snapshot.totalBytes;
  }
  return { fileCount, totalBytes, sha256: hashRoots(roots) };
}

function hashRoots(roots) {
  const hash = createHash("sha256");
  for (const root of roots) {
    const base = path.basename(root);
    for (const file of listFiles(root)) {
      hash.update(`${base}/${path.relative(root, file).split(path.sep).join("/")}\0`);
      hash.update(fs.readFileSync(file));
    }
  }
  return hash.digest("hex").toUpperCase();
}

function listFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw coded("PROVIDER_BUILD_REPARSE_PATH_FORBIDDEN", `Artifact contains a link: ${full}`);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function countFiles(root) { return listFiles(root).length; }

function countRoutes(distRoot) {
  const manifests = ["routes-manifest.json", "app-path-routes-manifest.json"];
  const routes = new Set();
  for (const name of manifests) {
    const file = path.join(distRoot, name);
    if (!fs.existsSync(file)) continue;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const route of [...(value.staticRoutes ?? []), ...(value.dynamicRoutes ?? [])]) routes.add(route.page ?? route.route ?? route.regex);
    for (const route of Object.values(value)) if (typeof route === "string" && route.startsWith("/")) routes.add(route);
  }
  return routes.size;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function coded(code, message) { const error = new Error(`${code}: ${message}`); error.code = code; return error; }

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) throw new Error(`Invalid argument: ${key ?? "<missing>"}`);
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runIsolatedProviderBuild({
    canonicalRoot: required(args["canonical-root"], "--canonical-root"),
    isolatedRoot: required(args["isolated-root"], "--isolated-root"),
    sourceCommit: required(args["source-commit"], "--source-commit"),
    providerBuildId: required(args["provider-build-id"], "--provider-build-id"),
    distDir: required(args["dist-dir"], "--dist-dir"),
    artifactDir: required(args["artifact-dir"], "--artifact-dir"),
  });
  process.stdout.write(`\n${JSON.stringify({ status: "PASS", ...result })}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
