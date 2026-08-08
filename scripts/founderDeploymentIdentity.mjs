import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";

export const DEPLOYMENT_IDENTITY_VERSION = "founder_deployment_identity_v1";
const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultManifestPath = path.join(
  defaultRoot,
  "deployment/founder-cutover-manifest.json"
);

export function validateDeploymentManifest(manifest) {
  if (manifest?.schemaVersion !== "founder_deployment_manifest_v1") {
    throw identityError("Deployment manifest schema is invalid.");
  }
  if (!/^[a-f0-9]{40}$/i.test(manifest.baseCommit ?? "")) {
    throw identityError("Deployment manifest base commit is invalid.");
  }
  const categories = manifest.categories ?? {};
  const accepted = stringArray(categories.acceptedDeploymentScope, "accepted paths");
  const required = stringArray(categories.requiredDependencies, "required dependencies");
  const excluded = stringArray(
    categories.unrelatedPreservedApplicationWork,
    "excluded application paths"
  );
  const generated = stringArray(
    categories.generatedExcludedOutput,
    "generated paths"
  );
  const ambiguous = stringArray(
    categories.ambiguousRequiringReview,
    "ambiguous paths"
  );
  const blocker = stringArray(manifest.blockerResolutionPaths, "blocker paths");
  const groups = { accepted, excluded, generated, ambiguous, blocker };
  for (const [name, values] of Object.entries(groups)) {
    if (new Set(values).size !== values.length) {
      throw identityError(`Duplicate ${name} path exists.`);
    }
  }
  const owners = new Map();
  for (const [name, values] of Object.entries(groups)) {
    for (const value of values) {
      const normalized = normalizePath(value);
      if (owners.has(normalized)) {
        throw identityError(
          `Deployment path is classified twice: ${normalized} (${owners.get(normalized)}, ${name}).`
        );
      }
      owners.set(normalized, name);
    }
  }
  for (const dependency of required) {
    if (!accepted.includes(dependency)) {
      throw identityError(`Required dependency is not accepted: ${dependency}.`);
    }
  }
  const invariants = manifest.invariants ?? {};
  const expectedCounts = [
    [accepted.length, invariants.acceptedCount, "accepted"],
    [required.length, invariants.requiredDependencyCount, "required dependency"],
    [excluded.length, invariants.unrelatedPreservedCount, "excluded application"],
    [generated.length, invariants.generatedExcludedCount, "generated"],
    [ambiguous.length, invariants.ambiguousCount, "ambiguous"],
  ];
  for (const [actual, expected, label] of expectedCounts) {
    if (actual !== expected) {
      throw identityError(`Deployment manifest ${label} count is invalid.`);
    }
  }
  if (ambiguous.length) {
    throw identityError("Deployment manifest still contains ambiguous paths.");
  }
  const deployed = [...accepted, ...blocker];
  if (deployed.some((value) => normalizePath(value) === "private/founder/runtime-store.json")) {
    throw identityError("Founder runtime data cannot be included in deployment source.");
  }
  if (deployed.some((value) => normalizePath(value).startsWith("screenshots/"))) {
    throw identityError("Generated screenshots cannot be included in deployment source.");
  }
  return Object.freeze({ accepted, required, excluded, generated, blocker });
}

export function assertCompleteClassification(manifest, changedPaths) {
  const groups = validateDeploymentManifest(manifest);
  const expected = new Set([
    ...groups.accepted,
    ...groups.excluded,
    ...groups.generated,
    ...groups.blocker,
  ].map(normalizePath));
  const actual = new Set(changedPaths.map(normalizePath));
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  if (missing.length || unexpected.length) {
    throw identityError("Worktree classification drifted.", { missing, unexpected });
  }
  return { changedPathCount: actual.size, missing, unexpected };
}

export function verifyPathHashes(root, entries) {
  const mismatches = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.path);
    if (!fs.existsSync(absolute)) {
      mismatches.push({ path: entry.path, reason: "missing" });
      continue;
    }
    const actual = sha256File(absolute);
    if (actual !== entry.sha256) {
      mismatches.push({ path: entry.path, reason: "hash_mismatch", expected: entry.sha256, actual });
    }
  }
  if (mismatches.length) {
    throw identityError("Deployment source hash verification failed.", { mismatches });
  }
  return true;
}

export function assertExcludedPathsRemainBase({ workspace, excludedStates }) {
  const violations = [];
  for (const entry of excludedStates) {
    const absolute = path.join(workspace, entry.path);
    const exists = fs.existsSync(absolute);
    if (!entry.trackedAtBase && exists) {
      violations.push({ path: entry.path, reason: "excluded_untracked_path_present" });
    } else if (entry.trackedAtBase && (!exists || sha256File(absolute) !== entry.baseSha256)) {
      violations.push({ path: entry.path, reason: "excluded_base_path_changed" });
    }
  }
  if (violations.length) {
    throw identityError("Excluded-path enforcement failed.", { violations });
  }
  return true;
}

export function evaluateProcessIsolation({ productionPid, developmentProcesses = [] } = {}) {
  const canonicalPid = Number(productionPid);
  if (!Number.isInteger(canonicalPid) || canonicalPid <= 0) {
    throw identityError("Canonical production PID is required.");
  }
  const normalized = developmentProcesses.map((item) => ({
    pid: Number(item.pid),
    parentPid: Number(item.parentPid),
    commandLine: String(item.commandLine ?? ""),
  }));
  if (normalized.some((item) => item.pid === canonicalPid)) {
    throw identityError("Canonical production PID cannot be classified as development.");
  }
  const unsafe = normalized.filter((item) =>
    /(?:^|[\\/])next(?:\.cmd)?\s+dev\b|next[\\/]dist[\\/]bin[\\/]next"?\s+dev\b|npm-cli\.js"?\s+run\s+dev\b/i
      .test(item.commandLine)
  );
  return Object.freeze({ canonicalPid, developmentPids: unsafe.map((item) => item.pid) });
}

export function evaluateNgrokAgreement({ desiredState, canonicalProcessCount,
  foreignProcessCount, taskValid, tunnelHealthy, publicUrl, upstream } = {}) {
  const issues = [];
  if (desiredState !== "running") issues.push("desired_state_not_running");
  if (canonicalProcessCount !== 1) issues.push("canonical_process_count_invalid");
  if (foreignProcessCount !== 0) issues.push("foreign_process_present");
  if (taskValid !== true) issues.push("task_invalid");
  if (tunnelHealthy !== true) issues.push("tunnel_unhealthy");
  if (!/^https:\/\//.test(publicUrl ?? "")) issues.push("public_url_invalid");
  if (!new Set(["http://localhost:3000", "http://127.0.0.1:3000"]).has(upstream)) {
    issues.push("upstream_invalid");
  }
  return Object.freeze({ passes: issues.length === 0, issues });
}

export function createDeploymentIdentity({ root = defaultRoot, manifestPath = defaultManifestPath,
  destination, linkNodeModules = true } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedDestination = path.resolve(required(destination, "destination"));
  const manifest = readOperationalJsonFileSync(manifestPath,
    { stage: "deployment_manifest" });
  const groups = validateDeploymentManifest(manifest);
  const head = git(resolvedRoot, ["rev-parse", "HEAD"]).trim();
  if (head !== manifest.baseCommit) {
    throw identityError("Git HEAD no longer matches the deployment base commit.", { head });
  }
  assertCompleteClassification(manifest, listChangedPaths(resolvedRoot));
  if (fs.existsSync(resolvedDestination)) {
    throw identityError("Deployment destination already exists.");
  }
  fs.mkdirSync(resolvedDestination, { recursive: true });
  const archive = path.join(os.tmpdir(), `physiqueos-${process.pid}-${Date.now()}.tar`);
  try {
    execFileSync("git", ["archive", "--format=tar", "-o", archive, manifest.baseCommit], {
      cwd: resolvedRoot,
      stdio: "pipe",
    });
    execFileSync("tar", ["-xf", archive, "-C", resolvedDestination], { stdio: "pipe" });
  } finally {
    if (fs.existsSync(archive)) fs.rmSync(archive);
  }

  const deploymentPaths = [...groups.accepted, ...groups.blocker].sort();
  for (const relative of deploymentPaths) {
    const source = path.join(resolvedRoot, relative);
    if (!fs.existsSync(source)) throw identityError(`Accepted source path is missing: ${relative}.`);
    const target = path.join(resolvedDestination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  const sourceHashes = deploymentPaths.map((relative) => ({
    path: normalizePath(relative),
    sha256: sha256File(path.join(resolvedRoot, relative)),
  }));
  verifyPathHashes(resolvedDestination, sourceHashes);
  const excludedStates = groups.excluded.map((relative) => {
    const isolatedBasePath = path.join(resolvedDestination, relative);
    const trackedAtBase = fs.existsSync(isolatedBasePath) &&
      isTrackedAt(resolvedRoot, manifest.baseCommit, relative);
    const baseBlobBytes = trackedAtBase
      ? gitBuffer(resolvedRoot, ["show", `${manifest.baseCommit}:${normalizePath(relative)}`])
      : null;
    return {
      path: normalizePath(relative),
      trackedAtBase,
      baseSha256: trackedAtBase ? sha256File(isolatedBasePath) : null,
      baseGitBlobSha256: baseBlobBytes ? sha256(baseBlobBytes) : null,
      preservedWorkingSha256: sha256File(path.join(resolvedRoot, relative)),
    };
  });
  assertExcludedPathsRemainBase({ workspace: resolvedDestination, excludedStates });
  for (const relative of groups.generated) {
    if (fs.existsSync(path.join(resolvedDestination, relative))) {
      throw identityError(`Generated output leaked into deployment source: ${relative}.`);
    }
  }
  if (fs.existsSync(path.join(resolvedDestination, "private/founder/runtime-store.json"))) {
    throw identityError("Founder runtime store leaked into deployment source.");
  }

  const patchIdentity = sha256(Buffer.from(stableJson({
    baseCommit: manifest.baseCommit,
    sourceHashes,
  })));
  const identity = {
    schemaVersion: DEPLOYMENT_IDENTITY_VERSION,
    createdAt: new Date().toISOString(),
    baseCommit: manifest.baseCommit,
    manifestPath: normalizePath(path.relative(resolvedRoot, manifestPath)),
    workspace: resolvedDestination,
    deploymentPathCount: deploymentPaths.length,
    acceptedArchitecturePathCount: groups.accepted.length,
    blockerResolutionPathCount: groups.blocker.length,
    patchIdentity: `sha256_${patchIdentity.toLowerCase()}`,
    sourceTreeIdentity: `sha256_${patchIdentity.toLowerCase()}`,
    sourceHashes,
    excludedStates,
    generatedExcludedPaths: groups.generated,
    excludedPreservationDigest: `sha256_${sha256(Buffer.from(stableJson(excludedStates))).toLowerCase()}`,
    buildIdentity: null,
    validation: { classificationComplete: true, sourceHashesVerified: true,
      excludedPathsEnforced: true, generatedPathsExcluded: true,
      founderRuntimeStoreExcluded: true },
  };
  fs.writeFileSync(
    path.join(resolvedDestination, "deployment-identity.json"),
    `${JSON.stringify(identity, null, 2)}\n`,
    { flag: "wx" }
  );
  if (linkNodeModules) {
    const sourceModules = path.join(resolvedRoot, "node_modules");
    if (!fs.existsSync(sourceModules)) throw identityError("Source node_modules is unavailable.");
    fs.symlinkSync(sourceModules, path.join(resolvedDestination, "node_modules"), "junction");
  }
  return identity;
}

export function verifyDeploymentIdentity({ workspace } = {}) {
  const resolvedWorkspace = path.resolve(required(workspace, "workspace"));
  const identityPath = path.join(resolvedWorkspace, "deployment-identity.json");
  const identity = readOperationalJsonFileSync(identityPath,
    { stage: "deployment_identity" });
  if (identity.schemaVersion !== DEPLOYMENT_IDENTITY_VERSION) {
    throw identityError("Deployment identity schema is invalid.");
  }
  verifyPathHashes(resolvedWorkspace, identity.sourceHashes);
  assertExcludedPathsRemainBase({ workspace: resolvedWorkspace,
    excludedStates: identity.excludedStates });
  if (identity.generatedExcludedPaths.some((relative) =>
    fs.existsSync(path.join(resolvedWorkspace, relative)))) {
    throw identityError("Generated output appeared in deployment workspace.");
  }
  if (fs.existsSync(path.join(resolvedWorkspace, "private/founder/runtime-store.json"))) {
    throw identityError("Founder runtime store appeared in deployment workspace.");
  }
  return identity;
}

export function recordBuildIdentity({ workspace } = {}) {
  const resolvedWorkspace = path.resolve(required(workspace, "workspace"));
  const identity = verifyDeploymentIdentity({ workspace: resolvedWorkspace });
  const buildIdPath = path.join(resolvedWorkspace, ".next/BUILD_ID");
  if (!fs.existsSync(buildIdPath)) throw identityError("Validated build identity is missing.");
  identity.buildIdentity = fs.readFileSync(buildIdPath, "utf8").trim();
  identity.buildRecordedAt = new Date().toISOString();
  fs.writeFileSync(path.join(resolvedWorkspace, "deployment-identity.json"),
    `${JSON.stringify(identity, null, 2)}\n`);
  return identity;
}

export function listChangedPaths(root = defaultRoot) {
  const output = gitBuffer(root, ["status", "--porcelain=v1", "-z", "-uall"]);
  const records = output.toString("utf8").split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    const relative = record.slice(3);
    if (status.includes("R") || status.includes("C")) index += 1;
    paths.push(normalizePath(relative));
  }
  return paths.sort();
}

function isTrackedAt(root, commit, relative) {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}:${normalizePath(relative)}`], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
function git(root, args) { return gitBuffer(root, args).toString("utf8"); }
function gitBuffer(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
}
function sha256File(value) { return sha256(fs.readFileSync(value)); }
function sha256(value) { return createHash("sha256").update(value).digest("hex").toUpperCase(); }
function normalizePath(value) { return String(value).replaceAll("\\", "/"); }
function stableJson(value) { return JSON.stringify(value); }
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw identityError(`${field} is required.`);
  return value.trim();
}
function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw identityError(`Deployment manifest ${label} are invalid.`);
  }
  return value.map(normalizePath);
}
function identityError(message, diagnostics = {}) {
  const error = new Error(message);
  error.code = "FOUNDER_DEPLOYMENT_IDENTITY_INVALID";
  error.diagnostics = diagnostics;
  return error;
}

async function main() {
  const [command, ...values] = process.argv.slice(2);
  const args = parseArgs(values);
  const result = command === "create"
    ? createDeploymentIdentity({ destination: args.destination,
        linkNodeModules: args["link-node-modules"] !== "false" })
    : command === "verify"
      ? verifyDeploymentIdentity({ workspace: args.workspace })
      : command === "record-build"
        ? recordBuildIdentity({ workspace: args.workspace })
        : (() => { throw identityError("Expected create, verify, or record-build command."); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    if (!key?.startsWith("--") || values[index + 1] == null) {
      throw identityError(`Invalid argument: ${key ?? "missing"}.`);
    }
    result[key.slice(2)] = values[index + 1];
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code,
      message: error.message, diagnostics: error.diagnostics }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
