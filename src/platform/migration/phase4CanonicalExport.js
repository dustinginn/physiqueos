import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { createMigrationManifest, validateMigrationSourceKeys } from "./migrationManifest.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import {
  assertTrustedMigrationSourceIdentity,
  validateSerializableMigrationSourceIdentity,
} from "./MigrationSourceIdentity.js";

export const PHASE4_PACKAGE_VERSION = "phase4-canonical-package-v1";

export async function captureReadOnlyFounderSnapshot({ sourceRuntimePath, sourceMediaRoot, snapshotRoot, mediaInclude = () => true }) {
  const runtimeSource = path.resolve(sourceRuntimePath);
  const mediaSource = sourceMediaRoot ? path.resolve(sourceMediaRoot) : null;
  const destination = path.resolve(snapshotRoot);
  assertSeparated(runtimeSource, destination);
  if (mediaSource) assertSeparated(mediaSource, destination);
  await fs.mkdir(destination, { recursive: true });

  const before = await hashFile(runtimeSource);
  const runtimeCopy = path.join(destination, "runtime-store.json");
  await fs.copyFile(runtimeSource, runtimeCopy);
  const copied = await hashFile(runtimeCopy);
  const media = mediaSource
    ? await copyMediaTreeVerified({ sourceRoot: mediaSource, destinationRoot: path.join(destination, "media"), mediaInclude })
    : [];
  const after = await hashFile(runtimeSource);
  if (before.sha256 !== copied.sha256 || before.sha256 !== after.sha256 || before.size !== after.size) {
    throw new Error("Founder runtime changed during snapshot capture; discard the snapshot and retry without altering the source.");
  }
  await markTreeReadOnly(destination);
  return Object.freeze({
    runtimePath: runtimeCopy,
    mediaRoot: mediaSource ? path.join(destination, "media") : null,
    sourceBefore: before,
    sourceAfter: after,
    media: Object.freeze(media),
  });
}

export async function exportCanonicalPackage({ runtimePath, mediaRoot = null, outputRoot, sourceIdentity, normalizeRuntime = (value) => value }) {
  const sourcePath = path.resolve(runtimePath);
  const destination = path.resolve(outputRoot);
  assertSeparated(sourcePath, destination);
  const raw = await fs.readFile(sourcePath);
  const parsed = JSON.parse(raw.toString("utf8"));
  validateMigrationSourceKeys(parsed);
  const runtime = normalizeRuntime(structuredClone(parsed));
  const collections = Object.fromEntries(
    FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, structuredClone(runtime[name] ?? null)])
  );
  const userId = String(runtime.user?.id ?? "").trim();
  if (!userId) throw new Error("Canonical export requires a Founder user identity.");
  const fileInventory = mediaRoot
    ? await inventoryMedia({ mediaRoot, collections, ownerUserId: userId })
    : [];
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  const createdAt = new Date(runtime.updatedAt ?? runtime.importedAt).toISOString();
  const trustedSourceIdentity = assertTrustedMigrationSourceIdentity(sourceIdentity);
  if (
    trustedSourceIdentity.runtime.sha256 !== sourceSha256 ||
    trustedSourceIdentity.runtime.version !== String(runtime.version) ||
    trustedSourceIdentity.runtime.revision !== String(runtime.revision ?? 0) ||
    trustedSourceIdentity.runtime.updatedAt !== createdAt ||
    trustedSourceIdentity.package.version !== PHASE4_PACKAGE_VERSION
  ) {
    throw new Error("Trusted migration source identity does not match the exported runtime/package.");
  }
  const migrationId = deterministicMigrationId(sourceSha256);
  const manifest = createMigrationManifest({
    source: trustedSourceIdentity,
    collections,
    files: fileInventory,
    relationships: collectRelationships(collections, userId),
    criticalValues: {
      userId,
      activeGoalIds: (collections.goals ?? []).filter((goal) => goal?.status === "active").map((goal) => String(goal.id)).sort(),
      sourceUpdatedAt: runtime.updatedAt,
      canonicalStateDigest: createPayloadHash(collections),
      packageVersion: PHASE4_PACKAGE_VERSION,
    },
    createdAt,
  }, { migrationId });

  await fs.mkdir(destination, { recursive: true });
  const runtimeFile = path.join(destination, "canonical-runtime.json");
  const manifestFile = path.join(destination, "manifest.json");
  await fs.writeFile(runtimeFile, `${canonicalJson(collections)}\n`, { flag: "wx" });
  await fs.writeFile(manifestFile, `${canonicalJson(manifest)}\n`, { flag: "wx" });
  return Object.freeze({ manifest, runtimeFile, manifestFile, sourceSha256 });
}

export async function readAndValidateCanonicalPackage(packageRoot) {
  const root = path.resolve(packageRoot);
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  const collections = JSON.parse(await fs.readFile(path.join(root, "canonical-runtime.json"), "utf8"));
  const { semanticDigest, ...unsigned } = manifest;
  if (createPayloadHash(unsigned) !== semanticDigest) throw new Error("Canonical package manifest digest mismatch.");
  if (manifest.criticalValues?.canonicalStateDigest !== createPayloadHash(collections)) {
    throw new Error("Canonical package runtime digest mismatch.");
  }
  validateSerializableMigrationSourceIdentity(manifest.source);
  validateMigrationSourceKeys(collections);
  const expected = new Set(FOUNDATION_SOURCE_COLLECTIONS);
  const actual = new Set(Object.keys(collections));
  const missing = [...expected].filter((name) => !actual.has(name));
  if (missing.length) throw new Error(`Canonical package is missing required collections: ${missing.join(", ")}`);
  return Object.freeze({ root, manifest, collections });
}

async function inventoryMedia({ mediaRoot, collections, ownerUserId }) {
  const root = path.resolve(mediaRoot);
  const references = buildMediaReferenceIndex(collections);
  const files = await listFiles(root);
  const entries = [];
  for (const absolutePath of files) {
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const hashed = await hashFile(absolutePath);
    const keys = [relativePath.toLowerCase(), path.basename(relativePath).toLowerCase()];
    const relationshipIds = [...new Set(keys.flatMap((key) => references.get(key) ?? []))].sort();
    entries.push({
      relativePath,
      size: hashed.size,
      sha256: hashed.sha256,
      mimeType: mimeTypeFor(relativePath),
      ownerUserId,
      relationshipIds,
    });
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function buildMediaReferenceIndex(collections) {
  const index = new Map();
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    records.forEach((record, position) => {
      const recordId = `${collection}:${resolveRecordId(record, position)}`;
      walkStrings(record, (value) => {
        const normalized = value.replaceAll("\\", "/").toLowerCase();
        const base = path.posix.basename(normalized);
        if (!/\.[a-z0-9]{2,6}(?:$|\?)/i.test(base)) return;
        for (const key of [normalized, base]) {
          const values = index.get(key) ?? [];
          values.push(recordId);
          index.set(key, values);
        }
      });
    });
  }
  return index;
}

function collectRelationships(collections, ownerUserId) {
  const knownIds = new Map();
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    for (let position = 0; position < records.length; position += 1) {
      const id = resolveRecordId(records[position], position);
      knownIds.set(id, { collection, id });
    }
  }
  const relationships = [];
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    records.forEach((record, position) => {
      const fromId = resolveRecordId(record, position);
      relationships.push({ from: `${collection}:${fromId}`, to: `user:${ownerUserId}`, type: "owned_by" });
      walkStrings(record, (value, key) => {
        if (!/(?:^|_)(?:id|ids)$|Id$|Ids$/.test(key)) return;
        const target = knownIds.get(value);
        if (target && !(target.collection === collection && target.id === fromId)) {
          relationships.push({ from: `${collection}:${fromId}`, to: `${target.collection}:${target.id}`, type: `references:${key}` });
        }
      });
    });
  }
  return uniqueSortedRelationships(relationships);
}

function walkStrings(value, visitor, key = "") {
  if (typeof value === "string") return visitor(value, key);
  if (Array.isArray(value)) return value.forEach((entry) => walkStrings(entry, visitor, key));
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) walkStrings(child, visitor, childKey);
  }
}

function uniqueSortedRelationships(values) {
  const keyed = new Map(values.map((value) => [`${value.from}|${value.to}|${value.type}`, value]));
  return [...keyed.values()].sort((left, right) =>
    `${left.from}|${left.to}|${left.type}`.localeCompare(`${right.from}|${right.to}|${right.type}`)
  );
}

async function copyMediaTreeVerified({ sourceRoot, destinationRoot, mediaInclude }) {
  const files = (await listFiles(sourceRoot)).filter((file) => mediaInclude(path.relative(sourceRoot, file).split(path.sep).join("/")));
  const copied = [];
  for (const source of files) {
    const relativePath = path.relative(sourceRoot, source);
    const destination = path.join(destinationRoot, relativePath);
    const before = await hashFile(source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    const [after, target] = await Promise.all([hashFile(source), hashFile(destination)]);
    if (before.sha256 !== after.sha256 || before.sha256 !== target.sha256 || before.size !== target.size) {
      throw new Error(`Media changed during snapshot capture: ${relativePath}.`);
    }
    copied.push(Object.freeze({ relativePath: relativePath.split(path.sep).join("/"), ...target }));
  }
  return copied;
}

async function listFiles(root) {
  const result = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) result.push(target);
    }
  }
  await visit(path.resolve(root));
  return result;
}

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return Object.freeze({ size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") });
}

async function markTreeReadOnly(root) {
  const files = await listFiles(root);
  await Promise.all(files.map((file) => fs.chmod(file, 0o444)));
}

function assertSeparated(source, destination) {
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  if (destinationPath === sourcePath || destinationPath.startsWith(`${sourcePath}${path.sep}`)) {
    throw new Error("Snapshot/export target must be physically separate from its source.");
  }
}

function deterministicMigrationId(hash) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-7${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function resolveRecordId(record, position) {
  return String(record?.id ?? record?.package_id ?? record?.review_id ?? `@index:${position}`);
}

function mimeTypeFor(file) {
  const extension = path.extname(file).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".json": "application/json", ".txt": "text/plain", ".csv": "text/csv", ".m4a": "audio/mp4", ".mp4": "video/mp4" })[extension] ?? "application/octet-stream";
}
