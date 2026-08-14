import fs from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const IMPORT_PATTERN = /\b(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const OMIT_DIRECTORIES = new Set(["coverage", "docs", "examples", "test", "tests"]);
const OMIT_EXTENSIONS = new Set([".md", ".markdown"]);

export async function collectProviderWorkerDependencies({
  installRoot = process.cwd(), applicationRoot,
} = {}) {
  const install = path.resolve(installRoot);
  const application = path.resolve(required(applicationRoot, "applicationRoot"));
  const entryPackages = await readBarePackages(application);
  const pending = [...entryPackages].map((name) => resolvePackage(install, install, name));
  const packages = new Set();

  while (pending.length > 0) {
    const packageRoot = pending.pop();
    if (packages.has(packageRoot)) continue;
    packages.add(packageRoot);
    const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
    const dependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const name of dependencies) {
      const resolved = resolvePackage(install, packageRoot, name, { optional: true });
      if (resolved) pending.push(resolved);
    }
  }

  let fileCount = 0;
  let totalBytes = 0;
  for (const packageRoot of [...packages].sort()) {
    const target = path.join(application, path.relative(install, packageRoot));
    const result = await copyPackage(packageRoot, target);
    fileCount += result.fileCount;
    totalBytes += result.totalBytes;
  }
  const rootManifest = JSON.parse(await fs.readFile(path.join(install, "package.json"), "utf8"));
  const runtimeManifest = `${JSON.stringify({
    name: `${rootManifest.name}-provider-worker`,
    version: rootManifest.version,
    private: true,
    type: rootManifest.type ?? "module",
  }, null, 2)}\n`;
  await fs.writeFile(path.join(application, "package.json"), runtimeManifest);
  fileCount += 1;
  totalBytes += Buffer.byteLength(runtimeManifest);
  return Object.freeze({ packageCount: packages.size, fileCount, totalBytes,
    entryPackages: Object.freeze([...entryPackages].sort()) });
}

async function readBarePackages(applicationRoot) {
  const packages = new Set();
  for await (const file of walk(applicationRoot)) {
    if (!/\.(?:js|mjs)$/.test(file)) continue;
    const source = await fs.readFile(file, "utf8");
    IMPORT_PATTERN.lastIndex = 0;
    for (let match = IMPORT_PATTERN.exec(source); match; match = IMPORT_PATTERN.exec(source)) {
      const specifier = match[1] ?? match[2];
      if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
        packages.add(packageName(specifier));
      }
    }
  }
  return packages;
}

function resolvePackage(installRoot, importerRoot, name, { optional = false } = {}) {
  let current = importerRoot;
  while (isWithin(installRoot, current)) {
    const candidate = path.join(current, "node_modules", ...name.split("/"));
    try {
      if (requireStat(candidate)) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (optional) return null;
  throw new Error(`Provider worker dependency is not installed: ${name}`);
}

function requireStat(target) {
  return statSync(path.join(target, "package.json")).isFile();
}

async function copyPackage(source, target) {
  let fileCount = 0;
  let totalBytes = 0;
  for await (const file of walk(source, { packageRoot: source })) {
    const relativePath = path.relative(source, file);
    const destination = path.join(target, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file, destination);
    fileCount += 1;
    totalBytes += (await fs.stat(file)).size;
  }
  return { fileCount, totalBytes };
}

async function* walk(directory, { packageRoot = null } = {}) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Provider worker dependencies refuse symbolic links: ${entryPath}`);
    if (entry.isDirectory()) {
      if (packageRoot && (entry.name === "node_modules" || OMIT_DIRECTORIES.has(entry.name.toLowerCase()))) continue;
      yield* walk(entryPath, { packageRoot });
    } else if (entry.isFile()) {
      if (packageRoot && (OMIT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ||
          /^\.env(?:\.|$)/i.test(entry.name))) continue;
      yield entryPath;
    }
  }
}

function packageName(specifier) {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

function isWithin(root, target) {
  const relativePath = path.relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await collectProviderWorkerDependencies({ applicationRoot: process.argv[2] });
  process.stdout.write(`${JSON.stringify({ status: "PASS", ...result })}\n`);
}
