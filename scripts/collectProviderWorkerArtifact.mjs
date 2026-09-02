import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ENTRIES = Object.freeze([
  "scripts/runFoundationWorker.mjs",
  "scripts/runSimplifiedProviderMigration.mjs",
  "scripts/migrateNativeSandboxDatabase.mjs",
  "scripts/bootstrapNativeSandboxOwner.mjs",
  "scripts/sourceModuleResolutionHook.mjs",
  "scripts/scanProviderArtifact.mjs",
]);
const PROVIDER_REPLACEMENTS = new Map([
  ["src/data/repositories/founderRuntimeStore.js",
    "src/data/repositories/providerRuntimeStoreForbidden.js"],
  ["src/platform/cutover/DurableMigrationControlStore.js",
    "src/platform/cutover/providerMigrationControlForbidden.js"],
]);
const IMPORT_PATTERN = /\b(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

export async function collectProviderWorkerArtifact({
  sourceRoot = process.cwd(), outputRoot, entries = DEFAULT_ENTRIES,
} = {}) {
  const source = path.resolve(sourceRoot);
  const output = path.resolve(required(outputRoot, "outputRoot"));
  if (source === output) throw new Error("Provider worker artifact output must differ from source.");
  await fs.mkdir(output, { recursive: true });
  const pending = entries.map((entry) => resolveWithin(source, entry));
  const included = new Set();

  while (pending.length > 0) {
    const requested = pending.pop();
    const selected = providerReplacement(source, requested);
    if (included.has(selected)) continue;
    const stat = await fs.lstat(selected);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Provider worker source must be a regular file: ${relative(source, selected)}`);
    }
    included.add(selected);
    const contents = await fs.readFile(selected, "utf8");
    for (const specifier of localSpecifiers(contents)) {
      pending.push(await resolveImport(source, selected, specifier));
    }
  }

  let totalBytes = 0;
  for (const file of [...included].sort()) {
    const target = path.join(output, relative(source, file));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file, target);
    totalBytes += (await fs.stat(file)).size;
  }
  return Object.freeze({ fileCount: included.size, totalBytes });
}

async function resolveImport(sourceRoot, importer, specifier) {
  if (!specifier.startsWith(".")) throw new Error("resolveImport only accepts local specifiers.");
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.json`, path.join(base, "index.js")]) {
    if (!isWithin(sourceRoot, candidate)) throw new Error(`Provider worker import escapes source root: ${specifier}`);
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Provider worker local import cannot be resolved: ${relative(sourceRoot, importer)} -> ${specifier}`);
}

function localSpecifiers(contents) {
  const result = [];
  IMPORT_PATTERN.lastIndex = 0;
  for (let match = IMPORT_PATTERN.exec(contents); match; match = IMPORT_PATTERN.exec(contents)) {
    const specifier = match[1] ?? match[2];
    if (specifier.startsWith(".")) result.push(specifier);
  }
  return result;
}

function providerReplacement(sourceRoot, requested) {
  const replacement = PROVIDER_REPLACEMENTS.get(relative(sourceRoot, requested));
  return replacement ? resolveWithin(sourceRoot, replacement) : requested;
}

function resolveWithin(root, value) {
  const resolved = path.resolve(root, value);
  if (!isWithin(root, resolved)) throw new Error(`Provider worker path escapes source root: ${value}`);
  return resolved;
}

function isWithin(root, target) {
  const relativePath = path.relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function relative(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await collectProviderWorkerArtifact({ outputRoot: process.argv[2] });
  process.stdout.write(`${JSON.stringify({ status: "PASS", ...result })}\n`);
}
