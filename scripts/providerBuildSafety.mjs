import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROVIDER_BUILD_ERROR = Object.freeze({
  CANONICAL_ROOT_FORBIDDEN: "PROVIDER_BUILD_CANONICAL_ROOT_FORBIDDEN",
  ISOLATION_REQUIRED: "PROVIDER_BUILD_ISOLATION_REQUIRED",
  DESTINATION_FORBIDDEN: "PROVIDER_BUILD_DESTINATION_FORBIDDEN",
  RECOVERY_PATH_FORBIDDEN: "PROVIDER_BUILD_RECOVERY_PATH_FORBIDDEN",
  REPARSE_PATH_FORBIDDEN: "PROVIDER_BUILD_REPARSE_PATH_FORBIDDEN",
  SOURCE_IDENTITY_INVALID: "PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
  WINDOWS_IDENTITY_CHANGED: "PROVIDER_WINDOWS_IDENTITY_CHANGED",
});

const RECOVERY_NAME = /^\.next\.(?:rollback|fallback|failed|release|recovery|staging|stage)(?:[-.].*)?$/i;
const EXACT_PROTECTED_NAMES = new Set([
  ".next.rollback-22712",
  ".next.fallback-stage-13560",
  ".next.failed-overwrite-13560",
]);

export function assertProviderBuildLocation({
  sourceRoot = process.cwd(),
  canonicalRoot = process.env.PHYSIQUEOS_CANONICAL_WINDOWS_ROOT,
  isolatedRoot = process.env.PHYSIQUEOS_PROVIDER_ISOLATED_BUILD_ROOT,
  distDir = process.env.PHYSIQUEOS_BUILD_DIST_DIR,
  sourceCommit = process.env.PHYSIQUEOS_GIT_SHA,
  providerBuildId = process.env.PHYSIQUEOS_BUILD_ID,
} = {}) {
  const source = realPath(sourceRoot);

  // This marker makes the historical command fail with the requested error even
  // when the caller omits every new isolation variable.
  if (isCanonicalWindowsRoot(source)) {
    fail(PROVIDER_BUILD_ERROR.CANONICAL_ROOT_FORBIDDEN,
      `Provider full-runtime builds are forbidden from the canonical Windows root: ${source}`);
  }

  if (!canonicalRoot || !isolatedRoot || !distDir) {
    fail(PROVIDER_BUILD_ERROR.ISOLATION_REQUIRED,
      "Provider full-runtime builds require canonical root, isolated root, and isolated distDir identities.");
  }
  const canonical = realPath(canonicalRoot);
  const isolated = realPath(isolatedRoot);
  if (source !== isolated) {
    fail(PROVIDER_BUILD_ERROR.ISOLATION_REQUIRED,
      `Build cwd '${source}' does not equal the declared isolated root '${isolated}'.`);
  }
  if (source === canonical) {
    fail(PROVIDER_BUILD_ERROR.CANONICAL_ROOT_FORBIDDEN,
      `Provider full-runtime builds are forbidden from the canonical Windows root: ${canonical}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(String(sourceCommit ?? ""))) {
    fail(PROVIDER_BUILD_ERROR.SOURCE_IDENTITY_INVALID, "An exact 40-character provider source commit is required.");
  }
  if (!/^[A-Za-z0-9._-]{4,128}$/.test(String(providerBuildId ?? ""))) {
    fail(PROVIDER_BUILD_ERROR.SOURCE_IDENTITY_INVALID, "An explicit provider build identity is required.");
  }

  const destination = realPath(path.resolve(source, distDir));
  for (const protectedPath of protectedWindowsPaths(canonical)) {
    const resolvedProtected = realPath(protectedPath);
    if (destination === resolvedProtected || isWithin(resolvedProtected, destination)) {
      const code = path.basename(protectedPath).toLowerCase() === ".next"
        ? PROVIDER_BUILD_ERROR.DESTINATION_FORBIDDEN
        : PROVIDER_BUILD_ERROR.RECOVERY_PATH_FORBIDDEN;
      fail(code, `Provider build destination resolves into protected Windows state: ${protectedPath}`);
    }
  }
  if (!isWithin(source, destination) || destination === source) {
    fail(PROVIDER_BUILD_ERROR.DESTINATION_FORBIDDEN,
      `Provider build destination must remain inside the isolated root: ${destination}`);
  }
  assertNoDestinationReparse(source, path.resolve(source, distDir), canonical);
  return Object.freeze({ sourceRoot: source, canonicalRoot: canonical, isolatedRoot: isolated, destination });
}

export function isCanonicalWindowsRoot(root) {
  const resolved = path.resolve(root);
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(resolved, "package.json"), "utf8"));
    return packageJson.name === "physique-os-app"
      && fs.existsSync(path.join(resolved, "scripts", "statusPhysiqueOS.ps1"))
      && fs.existsSync(path.join(resolved, ".next", "BUILD_ID"))
      && fs.existsSync(path.join(resolved, ".next", "SOURCE_COMMIT"));
  } catch {
    return false;
  }
}

export function discoverRecoveryDirectories(canonicalRoot) {
  const root = path.resolve(canonicalRoot);
  let names = [];
  try { names = fs.readdirSync(root); } catch { return []; }
  return names
    .filter((name) => EXACT_PROTECTED_NAMES.has(name) || RECOVERY_NAME.test(name))
    .map((name) => path.join(root, name))
    .filter((entry) => {
      try { return fs.lstatSync(entry).isDirectory() || fs.lstatSync(entry).isSymbolicLink(); } catch { return false; }
    })
    .sort((left, right) => left.localeCompare(right));
}

export function protectedWindowsPaths(canonicalRoot) {
  const root = path.resolve(canonicalRoot);
  const paths = new Set([path.join(root, ".next")]);
  for (const name of EXACT_PROTECTED_NAMES) paths.add(path.join(root, name));
  for (const entry of discoverRecoveryDirectories(root)) paths.add(entry);
  return [...paths];
}

export function captureWindowsBuildIdentity(canonicalRoot) {
  const root = realPath(canonicalRoot);
  const canonicalNext = path.join(root, ".next");
  if (!fs.existsSync(canonicalNext)) {
    fail(PROVIDER_BUILD_ERROR.WINDOWS_IDENTITY_CHANGED, `Canonical Windows build is missing: ${canonicalNext}`);
  }
  const recovery = Object.fromEntries(discoverRecoveryDirectories(root).map((entry) => [
    path.basename(entry), snapshotDirectory(entry, { boundedContent: false }),
  ]));
  return Object.freeze({
    canonicalRoot: root,
    canonicalNext: snapshotDirectory(canonicalNext, { boundedContent: true }),
    recovery,
  });
}

export function assertWindowsIdentityUnchanged(before, after, beforeRuntime, afterRuntime) {
  const beforeValue = JSON.stringify({ build: before, runtime: normalizeRuntime(beforeRuntime) });
  const afterValue = JSON.stringify({ build: after, runtime: normalizeRuntime(afterRuntime) });
  if (beforeValue !== afterValue) {
    const error = new Error("Provider preflight changed protected Windows build, recovery, PID, or start-time identity.");
    error.code = PROVIDER_BUILD_ERROR.WINDOWS_IDENTITY_CHANGED;
    error.before = { build: before, runtime: normalizeRuntime(beforeRuntime) };
    error.after = { build: after, runtime: normalizeRuntime(afterRuntime) };
    throw error;
  }
}

export function snapshotDirectory(directory, { boundedContent = false } = {}) {
  const root = path.resolve(directory);
  const hash = createHash("sha256");
  let fileCount = 0;
  let linkCount = 0;
  let totalBytes = 0;
  walk(root, root, (file, stat, relative, linkTarget) => {
    if (linkTarget !== null) {
      linkCount += 1;
      hash.update(`LINK\0${relative}\0${linkTarget}\0${stat.mtimeMs}\0`);
      return;
    }
    fileCount += 1;
    totalBytes += stat.size;
    hash.update(`${relative}\0${stat.size}\0${stat.mtimeMs}\0`);
    if (boundedContent) {
      const handle = fs.openSync(file, "r");
      try {
        const length = Math.min(4096, stat.size);
        const first = Buffer.alloc(length);
        if (length) fs.readSync(handle, first, 0, length, 0);
        hash.update(first);
        if (stat.size > length) {
          const last = Buffer.alloc(length);
          fs.readSync(handle, last, 0, length, Math.max(0, stat.size - length));
          hash.update(last);
        }
      } finally { fs.closeSync(handle); }
    }
  });
  return Object.freeze({
    path: root,
    buildId: readStamp(root, "BUILD_ID"),
    sourceCommit: readStamp(root, "SOURCE_COMMIT"),
    fileCount,
    linkCount,
    totalBytes,
    identitySha256: hash.digest("hex").toUpperCase(),
  });
}

function normalizeRuntime(runtime) {
  return Object.freeze({
    pid: Number(runtime?.pid),
    startedAt: String(runtime?.startedAt ?? ""),
    taskLastRunTime: String(runtime?.taskLastRunTime ?? ""),
    taskWorkingDirectory: realPath(runtime?.taskWorkingDirectory ?? ""),
    ownership: String(runtime?.ownership ?? ""),
  });
}

function assertNoDestinationReparse(sourceRoot, destination, canonicalRoot) {
  const relative = path.relative(sourceRoot, destination);
  let current = sourceRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    const stat = fs.lstatSync(current);
    if (!stat.isSymbolicLink()) continue;
    const target = realPath(current);
    if (!isWithin(sourceRoot, target) || protectedWindowsPaths(canonicalRoot).some((entry) => {
      const protectedPath = realPath(entry);
      return target === protectedPath || isWithin(protectedPath, target);
    })) {
      fail(PROVIDER_BUILD_ERROR.REPARSE_PATH_FORBIDDEN,
        `Provider build destination traverses a reparse/symbolic path: ${current} -> ${target}`);
    }
  }
}

function walk(root, directory, visitor) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      visitor(full, stat, path.relative(root, full).split(path.sep).join("/"), fs.readlinkSync(full));
      continue;
    }
    if (stat.isDirectory()) walk(root, full, visitor);
    else if (stat.isFile()) visitor(full, stat, path.relative(root, full).split(path.sep).join("/"), null);
  }
}

function readStamp(root, name) {
  try { return fs.readFileSync(path.join(root, name), "utf8").trim(); } catch { return null; }
}

function realPath(value) {
  const resolved = path.resolve(String(value || "."));
  if (fs.existsSync(resolved)) return fs.realpathSync.native(resolved);
  const remainder = [];
  let cursor = resolved;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    remainder.unshift(path.basename(cursor));
    cursor = parent;
  }
  const existing = fs.existsSync(cursor) ? fs.realpathSync.native(cursor) : cursor;
  return path.resolve(existing, ...remainder);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}
