import { createPayloadHash } from "../../contracts/v1/canonicalJson";
import { createUuidV7 } from "../../contracts/v1/identifiers";
import {
  FOUNDATION_SOURCE_COLLECTIONS,
  assertFoundationSourceInventory,
} from "./foundationSourceCollections";
import { validateSerializableMigrationSourceIdentity } from "./MigrationSourceIdentity.js";

export const MIGRATION_MANIFEST_VERSION = "2";

export function createMigrationManifest({ source, collections, collectionInventory = null, applicationContext = null, files = [], relationships = [], criticalValues = {}, createdAt }, options = {}) {
  const sourceKeys = Object.keys(collections ?? {});
  const unknown = sourceKeys.filter((key) => !FOUNDATION_SOURCE_COLLECTIONS.includes(key));
  if (unknown.length) throw new Error(`Unknown migration source collections: ${unknown.sort().join(", ")}`);
  const entries = sourceKeys.sort().map((name) => createCollectionEntry(name, collections[name]));
  const fileEntries = files.map(validateFileEntry).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const manifest = {
    manifestVersion: MIGRATION_MANIFEST_VERSION,
    migrationId: options.migrationId ?? createUuidV7(options),
    createdAt,
    importerVersion: String(source.package.version),
    targetSchemaVersion: String(source.schema.sourceVersion),
    source: structuredClone(validateSerializableMigrationSourceIdentity(source)),
    collectionInventory: collectionInventory == null ? null : structuredClone(collectionInventory),
    applicationContext: normalizeApplicationContext(applicationContext),
    collections: entries,
    relationships: structuredClone(relationships),
    criticalValues: structuredClone(criticalValues),
    files: fileEntries,
    result: "pending",
    validationResult: "pending",
  };
  return Object.freeze({ ...manifest, semanticDigest: createPayloadHash(manifest) });
}

function normalizeApplicationContext(value) {
  if (value == null) return Object.freeze({
    operatingRhythm: null,
    adaptiveTrustProfile: null,
    retiredMilestones: Object.freeze([]),
  });
  const retiredMilestones = value.retiredMilestones ?? value.milestones ?? [];
  if (!Array.isArray(retiredMilestones)) throw new Error("Migration application-context retired milestones must be an array.");
  return Object.freeze({
    operatingRhythm: value.operatingRhythm == null ? null : structuredClone(value.operatingRhythm),
    adaptiveTrustProfile: value.adaptiveTrustProfile == null ? null : structuredClone(value.adaptiveTrustProfile),
    retiredMilestones: Object.freeze(structuredClone(retiredMilestones)),
  });
}

export function validateMigrationSourceKeys(sourceObject) {
  assertFoundationSourceInventory(sourceObject);
  return true;
}

function createCollectionEntry(name, records) {
  const values = records == null ? [] : Array.isArray(records) ? records : [records];
  const ids = values.map((record, index) => resolveRecordId(record, index));
  return Object.freeze({ sourceCollection: name, recordCount: values.length, exactIds: Object.freeze(ids), semanticDigest: createPayloadHash(values), migrationResult: "pending", validationResult: "pending" });
}

function resolveRecordId(record, index) {
  const id = record?.id ?? record?.package_id ?? record?.review_id;
  return id == null ? `@index:${index}` : String(id);
}

function validateFileEntry(file) {
  if (!file?.relativePath || !Number.isSafeInteger(file.size) || file.size < 0 || !file.mimeType) throw new Error("Migration file path, size, and MIME type are required.");
  return Object.freeze({ relativePath: String(file.relativePath), size: file.size, sha256: validateSha256(file.sha256, "file.sha256"), mimeType: String(file.mimeType), ownerUserId: String(file.ownerUserId), relationshipIds: Object.freeze([...(file.relationshipIds ?? [])].map(String)), migrationResult: "pending", validationResult: "pending" });
}

function validateSha256(value, field) {
  const candidate = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error(`${field} must be SHA-256 hex.`);
  return candidate;
}
