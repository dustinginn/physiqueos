import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectProviderWorkerArtifact } from "./collectProviderWorkerArtifact.mjs";
import { scanProviderArtifact } from "./scanProviderArtifact.mjs";
import { assertProviderBuildLocation } from "./providerBuildSafety.mjs";
import {
  createProviderBuildIdentity,
  inventoryArtifactRoot,
  PROVIDER_BUILD_IDENTITY_FILE,
  validateProviderArtifactManifest,
  writeProviderArtifactManifest,
  writeProviderBuildIdentity,
} from "./providerArtifactManifest.mjs";

export async function runIsolatedProviderBuild({
  isolatedRoot,
  sourceCommit,
  providerBuildId,
  distDir,
  artifactDir,
  buildRunner = runNextBuild,
  artifactScanner = scanProviderArtifact,
} = {}) {
  const guard = assertProviderBuildLocation({
    sourceRoot: isolatedRoot, isolatedRoot, distDir, sourceCommit, providerBuildId,
  });
  const sourceIdentity = verifyGitIdentity(guard.sourceRoot, sourceCommit);
  assertNoPrivateBuildInputs(guard.sourceRoot);
  const artifactRoot = path.resolve(guard.sourceRoot, required(artifactDir, "artifactDir"));
  assertIsolatedOutput(guard.sourceRoot, artifactRoot, guard.destination);
  if (fs.existsSync(guard.destination) || fs.existsSync(artifactRoot)) {
    throw coded("PROVIDER_BUILD_DESTINATION_EXISTS", "Provider build and artifact destinations must be fresh.");
  }

  await buildRunner({ ...guard, sourceCommit, providerBuildId, distDir });
  const buildIdPath = path.join(guard.destination, "BUILD_ID");
  if (!fs.existsSync(buildIdPath)) throw coded("PROVIDER_BUILD_OUTPUT_INVALID", "Next build identity is missing.");
  const nextBuildId = fs.readFileSync(buildIdPath, "utf8").trim();
  const identity = createProviderBuildIdentity({
    sourceCommit,
    sourceTree: sourceIdentity.sourceTree,
    providerBuildId,
    nextBuildId,
  });
  fs.writeFileSync(path.join(guard.destination, "SOURCE_COMMIT"), identity.sourceCommit,
    { encoding: "ascii", flag: "wx" });
  fs.writeFileSync(path.join(guard.destination, "PROVIDER_BUILD_ID"), identity.providerBuildId,
    { encoding: "utf8", flag: "wx" });
  const buildIdentityPath = writeProviderBuildIdentity({
    destination: path.join(guard.destination, PROVIDER_BUILD_IDENTITY_FILE),
    identity,
  });

  const webRoot = path.join(artifactRoot, "web");
  const workerRoot = path.join(artifactRoot, "worker");
  assembleWebArtifact({
    sourceRoot: guard.sourceRoot,
    distRoot: guard.destination,
    distDir,
    webRoot,
    buildIdentityPath,
  });
  await collectProviderWorkerArtifact({ sourceRoot: guard.sourceRoot, outputRoot: workerRoot });
  fs.copyFileSync(buildIdentityPath,
    path.join(workerRoot, PROVIDER_BUILD_IDENTITY_FILE), fs.constants.COPYFILE_EXCL);
  const web = inventoryArtifactRoot(webRoot);
  const worker = inventoryArtifactRoot(workerRoot);
  const { manifest, manifestPath } = writeProviderArtifactManifest({
    artifactRoot,
    identity,
    webRoot,
    workerRoot,
    web,
    worker,
  });
  const scan = await artifactScanner({ roots: [artifactRoot] });
  const validation = validateProviderArtifactManifest({
    artifactRoot,
    expectedIdentity: identity,
  });
  return Object.freeze({
    sourceCommit: identity.sourceCommit,
    sourceTree: identity.sourceTree,
    providerBuildId,
    isolatedRoot: guard.sourceRoot,
    distDir,
    nextBuildId,
    web: { ...web, routeCount: countRoutes(guard.destination),
      staticAssetCount: countFiles(path.join(guard.destination, "static")) },
    worker,
    privacyScan: scan,
    sourceIdentity: Object.freeze({ status: "PASS", ...sourceIdentity }),
    artifactManifest: Object.freeze({
      path: manifestPath,
      sha256: manifest.manifestSha256,
      validationStatus: validation.status,
    }),
    artifactRoot,
  });
}

function assembleWebArtifact({ sourceRoot, distRoot, distDir, webRoot,
  buildIdentityPath }) {
  copyTree(path.join(distRoot, "standalone"), webRoot, providerWebFilter);
  const publicRoot = path.join(sourceRoot, "public");
  if (fs.existsSync(publicRoot)) {
    copyTree(publicRoot, path.join(webRoot, "public"), (relative) => relative !== "mockup-home.png");
  }
  copyTree(path.join(distRoot, "static"), path.join(webRoot, path.basename(distDir), "static"));
  fs.copyFileSync(buildIdentityPath,
    path.join(webRoot, PROVIDER_BUILD_IDENTITY_FILE), fs.constants.COPYFILE_EXCL);
}

function providerWebFilter(relative) {
  const normalized = relative.replaceAll("\\", "/");
  const root = normalized.split("/")[0].toLowerCase();
  if (new Set([
    ".tmp", "backups", "logs", "playwright-report", "private", "runtime-exports",
    "screenshots", "scripts", "test-results", "tests", "tmp",
  ]).has(root)) return false;
  if (/^\.env(?:\.|$)/i.test(path.basename(normalized))) return false;
  if (/^src\/(?:data\/(?:founderSeed|seed)|fixtures)(?:\/|$)/i.test(normalized)) return false;
  if (/^src\/(?:features\/dashboard|lib\/mockData\.js|models\/UserProfile\.js)$/i.test(normalized)) return false;
  return true;
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

function runNextBuild({ sourceRoot, isolatedRoot, sourceCommit, providerBuildId, distDir }) {
  const next = resolveNextCli(sourceRoot);
  const result = spawnSync(process.execPath, [next, "build", "--webpack"], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=1536",
      NEXT_PHASE: "phase-production-build",
      PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
      // Exact commits created before the portable gate still load the former
      // location guard from their own next.config. This isolated sentinel
      // satisfies that legacy path-separation input without reading or
      // requiring any Windows runtime state. New commits ignore it.
      PHYSIQUEOS_CANONICAL_WINDOWS_ROOT:
        path.join(sourceRoot, ".provider-portable-legacy-sentinel"),
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

function verifyGitIdentity(sourceRoot, expectedCommit) {
  const head = git(sourceRoot, ["rev-parse", "HEAD"]);
  if (head !== expectedCommit) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID", `Isolated HEAD ${head} does not match ${expectedCommit}.`);
  const commitType = git(sourceRoot, ["cat-file", "-t", expectedCommit]);
  if (commitType !== "commit") throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    "Requested provider source identity is not a Git commit.");
  const branch = gitOptional(sourceRoot, ["symbolic-ref", "-q", "HEAD"]);
  if (branch) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    "Provider source must be a detached exact-commit checkout.");
  const status = git(sourceRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (status) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    "Isolated source contains tracked or non-ignored untracked changes.");
  return Object.freeze({
    sourceCommit: head,
    sourceTree: git(sourceRoot, ["rev-parse", `${expectedCommit}^{tree}`]),
    detached: true,
    clean: true,
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID", result.stderr || "Git identity check failed.");
  return result.stdout.trim();
}

function gitOptional(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 1) return "";
  throw coded("PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    result.stderr || "Git identity check failed.");
}

function assertNoPrivateBuildInputs(sourceRoot) {
  const forbidden = [".env", ".env.local", ".env.production",
    ".env.production.local"];
  const found = forbidden.filter((entry) => fs.existsSync(path.join(sourceRoot, entry)));
  const privateRoot = path.join(sourceRoot, "private");
  if (fs.existsSync(privateRoot)) {
    const tracked = new Set(git(sourceRoot, ["ls-files", "--", "private"])
      .split(/\r?\n/).filter(Boolean).map((entry) => entry.replaceAll("\\", "/")));
    for (const file of listFiles(privateRoot)) {
      const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
      if (!tracked.has(relative)) found.push(relative);
    }
  }
  if (found.length > 0) throw coded("PROVIDER_BUILD_PRIVATE_INPUT_REJECTED",
    `Isolated source contains private/environment build input: ${found.join(", ")}`);
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
