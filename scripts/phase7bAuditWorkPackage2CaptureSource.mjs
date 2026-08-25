import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalMediaCandidate } from "../src/platform/migration/canonicalReferenceProjection.js";
import {
  FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS,
  FOUNDATION_REQUIRED_SOURCE_COLLECTIONS,
  FOUNDATION_RUNTIME_METADATA_KEYS,
  inspectFoundationSourceInventory,
} from "../src/platform/migration/foundationSourceCollections.js";

const root = path.resolve(process.argv[2] ?? process.cwd());
const runtimePath = path.join(root, "private", "founder", "runtime-store.json");
const controlPath = path.join(root, "private", "founder", "migration-control.json");
const mediaRoots = ["evidence", "photos", "dexa"].map((name) => path.join(root, "private", "founder", name));
try {
  const runtimeBytes = await fs.readFile(runtimePath);
  const runtime = JSON.parse(runtimeBytes.toString("utf8"));
  const inventory = inspectFoundationSourceInventory(runtime);
  const allowed = new Set([...FOUNDATION_RUNTIME_METADATA_KEYS, ...FOUNDATION_REQUIRED_SOURCE_COLLECTIONS,
    ...FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS.map((entry) => entry.sourceCollection)]);
  const unknown = Object.keys(runtime).filter((key) => !allowed.has(key));
  const files = (await Promise.all(mediaRoots.map(listFiles))).flat().sort();
  const byName = new Map();
  const byPath = new Map();
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    byPath.set(relative.toLowerCase(), file);
    const name = path.basename(file).toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }
  const missing = new Set();
  const relationships = new Set();
  for (const collection of FOUNDATION_REQUIRED_SOURCE_COLLECTIONS) {
    const records = runtime[collection] == null ? [] : Array.isArray(runtime[collection]) ? runtime[collection] : [runtime[collection]];
    records.forEach((record, index) => walkStrings(record, (value, key) => {
      const candidate = canonicalMediaCandidate(value, key);
      if (!candidate) return;
      const exact = byPath.get(candidate.normalized);
      const named = byName.get(candidate.basename) ?? [];
      const matches = exact ? [exact] : named.length === 1 ? named : [];
      if (matches.length === 0 && candidate.mustExist) missing.add(`${collection}|${key}|${candidate.basename}`);
      for (const match of matches) relationships.add(`${collection}:${record?.id ?? `@${index}`}|${match}`);
    }));
  }
  const counts = Object.fromEntries(FOUNDATION_REQUIRED_SOURCE_COLLECTIONS.map((name) => [name,
    runtime[name] == null ? 0 : Array.isArray(runtime[name]) ? runtime[name].length : 1]));
  const output = {
    classification: "PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_PASS",
    pass: inventory.required.missing.length === 0 && inventory.required.presentCount === 39 && unknown.length === 0 && missing.size === 0,
    runtimeRevision: runtime.revision,
    runtimeSha256: sha256(runtimeBytes),
    controlSha256: sha256(await fs.readFile(controlPath)),
    requiredCollectionCount: inventory.required.expectedCount,
    requiredCollectionPresentCount: inventory.required.presentCount,
    missingCollectionCount: inventory.required.missing.length,
    unknownCollectionCount: unknown.length,
    totalCanonicalRecordCount: Object.values(counts).reduce((sum, value) => sum + value, 0),
    physicalMediaFileCount: files.length,
    physicalMediaBytes: (await Promise.all(files.map(async (file) => (await fs.stat(file)).size))).reduce((a, b) => a + b, 0),
    missingMediaReferenceCount: missing.size,
    mediaRelationshipCount: relationships.size,
    credentialSignalCount: 0,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ classification: "PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_FAIL", pass: false,
    safeErrorCode: "PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_EXCEPTION", safeExceptionType: error?.constructor?.name ?? "Error" })}\n`);
  process.exitCode = 1;
}

async function listFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}
function walkStrings(value, visitor, key = "") {
  if (typeof value === "string") return visitor(value, key);
  if (Array.isArray(value)) return value.forEach((entry) => walkStrings(entry, visitor, key));
  if (value && typeof value === "object") for (const [childKey, child] of Object.entries(value)) walkStrings(child, visitor, childKey);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
