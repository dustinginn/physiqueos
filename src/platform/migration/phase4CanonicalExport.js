import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { createMigrationManifest, validateMigrationSourceKeys } from "./migrationManifest.js";
import {
  FOUNDATION_COLLECTION_CONTRACT_VERSION,
  FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS,
  FOUNDATION_SOURCE_COLLECTIONS,
  inspectFoundationSourceInventory,
} from "./foundationSourceCollections.js";
import {
  assertTrustedMigrationSourceIdentity,
  validateSerializableMigrationSourceIdentity,
} from "./MigrationSourceIdentity.js";
import {
  buildCanonicalMediaReferenceIndex,
  canonicalMimeTypeFor,
  collectCanonicalRelationships,
} from "./canonicalReferenceProjection.js";
import { readCanonicalRuntimeJson } from "./readCanonicalRuntimeJson.js";

export const PHASE4_PACKAGE_VERSION = "phase4-canonical-package-v2";

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
  const collectionInventory = inspectFoundationSourceInventory(parsed);
  const runtime = normalizeRuntime(structuredClone(parsed));
  const collections = Object.fromEntries(
    FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, structuredClone(runtime[name])])
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
    collectionInventory,
    applicationContext: {
      operatingRhythm: runtime.operatingRhythm ?? null,
      adaptiveTrustProfile: runtime.adaptiveTrustProfile ?? null,
      retiredMilestones: runtime.milestones ?? [],
    },
    files: fileInventory,
    relationships: collectCanonicalRelationships(collections, userId),
    criticalValues: {
      userId,
      activeGoalIds: (collections.goals ?? []).filter((goal) => goal?.status === "active").map((goal) => String(goal.id)).sort(),
      sourceUpdatedAt: runtime.updatedAt,
      canonicalStateDigest: createPayloadHash(collections),
      applicationContextDigest: createPayloadHash({
        operatingRhythm: runtime.operatingRhythm ?? null,
        adaptiveTrustProfile: runtime.adaptiveTrustProfile ?? null,
        retiredMilestones: runtime.milestones ?? [],
      }),
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

export async function readAndValidateCanonicalPackage(packageRoot, { observePhase = async () => undefined } = {}) {
  const root = path.resolve(packageRoot);
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  const collections = await readCanonicalRuntimeJson(path.join(root, "canonical-runtime.json"), { observePhase });
  await observePhase("CANONICAL_DIGEST_STARTED");
  const { semanticDigest, ...unsigned } = manifest;
  if (createPayloadHash(unsigned) !== semanticDigest) throw new Error("Canonical package manifest digest mismatch.");
  if (manifest.criticalValues?.canonicalStateDigest !== createPayloadHash(collections)) {
    throw new Error("Canonical package runtime digest mismatch.");
  }
  const applicationContext = manifest.applicationContext ?? {
    operatingRhythm: null,
    adaptiveTrustProfile: null,
    retiredMilestones: [],
  };
  if (manifest.criticalValues?.applicationContextDigest !== createPayloadHash(applicationContext)) {
    throw new Error("Canonical package application-context digest mismatch.");
  }
  await observePhase("CANONICAL_DIGEST_COMPLETE");
  await observePhase("CANONICAL_CONTRACT_VALIDATION_STARTED");
  validateSerializableMigrationSourceIdentity(manifest.source);
  validateMigrationSourceKeys(collections);
  if (manifest.manifestVersion !== "2" || manifest.collectionInventory?.contractVersion !== FOUNDATION_COLLECTION_CONTRACT_VERSION) {
    throw new Error("Canonical package collection inventory contract is missing or unsupported.");
  }
  const expectedExcluded = FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS.map(({ sourceCollection, classification, canonicalOwner }) => ({ sourceCollection, classification, canonicalOwner }));
  const actualExcluded = (manifest.collectionInventory.excluded ?? []).map(({ sourceCollection, classification, canonicalOwner }) => ({ sourceCollection, classification, canonicalOwner }));
  if (canonicalJson(actualExcluded) !== canonicalJson(expectedExcluded)) throw new Error("Canonical package excluded collection classifications do not match the active contract.");
  if (manifest.collectionInventory.required?.expectedCount !== FOUNDATION_SOURCE_COLLECTIONS.length || manifest.collectionInventory.required?.missing?.length) {
    throw new Error("Canonical package required collection inventory is incomplete.");
  }
  if (manifest.collectionInventory.unknown?.length) throw new Error("Canonical package inventory contains unknown source collections.");
  const expected = new Set(FOUNDATION_SOURCE_COLLECTIONS);
  const actual = new Set(Object.keys(collections));
  const missing = [...expected].filter((name) => !actual.has(name));
  if (missing.length) throw new Error(`Canonical package is missing required collections: ${missing.join(", ")}`);
  const extra = [...actual].filter((name) => !expected.has(name));
  if (extra.length) throw new Error(`Canonical package contains noncanonical collections: ${extra.join(", ")}`);
  await observePhase("CANONICAL_CONTRACT_VALIDATION_COMPLETE", { collectionCount: actual.size });
  return Object.freeze({ root, manifest, collections });
}

async function inventoryMedia({ mediaRoot, collections, ownerUserId }) {
  const root = path.resolve(mediaRoot);
  const references = buildCanonicalMediaReferenceIndex(collections);
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
      mimeType: canonicalMimeTypeFor(relativePath),
      ownerUserId,
      relationshipIds,
    });
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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
