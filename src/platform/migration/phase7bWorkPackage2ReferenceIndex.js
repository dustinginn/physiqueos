import { canonicalJson, createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import {
  collectCanonicalRelationships,
  resolveCanonicalRecordId,
} from "./canonicalReferenceProjection.js";
import {
  FOUNDATION_COLLECTION_CONTRACT_VERSION,
  FOUNDATION_SOURCE_COLLECTIONS,
  inspectFoundationSourceInventory,
} from "./foundationSourceCollections.js";

export const PHASE7B_WP2_REFERENCE_INDEX_VERSION = "phase7b-wp2-reference-index-v1";
export const PHASE7B_WP2_FOUNDER_CUTOFF_POLICY = Object.freeze({
  founderMeaningfulDataThrough: "2026-08-16",
  founderDowntimeBegan: "2026-08-17",
  postCutoffAcceptance: "NON_BLOCKING_ONLY_WHEN_SOURCE_PROVEN_SYSTEM_GENERATED",
  destructiveFilteringPerformed: false,
  provenanceInferred: false,
});

const TIMESTAMP_KEYS = Object.freeze([
  "createdAt", "updatedAt", "observedAt", "measuredAt", "capturedAt",
  "startedAt", "completedAt", "finishedAt", "timestamp", "date", "localDate",
]);
const HINT_KEYS = Object.freeze([
  "type", "category", "status", "name", "title", "kind", "source", "date", "localDate",
]);
const SECRET_KEY = /(?:password|passphrase|secret|token|credential|private.?key|access.?key|environment)/i;
const HASH = /^[0-9a-f]{64}$/;

export function createPhase7BWorkPackage2ReferenceIndex({
  runtime,
  runtimeSha256,
  observedAt,
  applicationCommit,
  schemaIdentity,
  controlStateSha256,
  mediaFiles = [],
  missingReferencedMedia = [],
  cutoffPolicy = PHASE7B_WP2_FOUNDER_CUTOFF_POLICY,
}) {
  const inventory = inspectFoundationSourceInventory(runtime);
  if (inventory.required.missing.length) throw new Error(`REFERENCE_INDEX_MISSING_COLLECTION:${inventory.required.missing.join(",")}`);
  if (inventory.unknown.length) throw new Error(`REFERENCE_INDEX_UNKNOWN_COLLECTION:${inventory.unknown.join(",")}`);
  assertHash(runtimeSha256, "runtimeSha256");
  assertHash(controlStateSha256, "controlStateSha256");
  assertIso(observedAt, "observedAt");
  if (!/^[0-9a-f]{40}$/.test(String(applicationCommit))) throw new Error("REFERENCE_INDEX_APPLICATION_COMMIT_INVALID");
  if (!schemaIdentity || !HASH.test(String(schemaIdentity.sha256))) throw new Error("REFERENCE_INDEX_SCHEMA_IDENTITY_INVALID");

  const collections = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, runtime[name]]));
  const ownerUserId = String(runtime.user?.id ?? "").trim();
  if (!ownerUserId) throw new Error("REFERENCE_INDEX_OWNER_ID_REQUIRED");
  const collectionEntries = FOUNDATION_SOURCE_COLLECTIONS.map((name) => {
    const source = collections[name];
    const values = source == null ? [] : Array.isArray(source) ? source : [source];
    const seen = new Set();
    const records = values.map((record, position) => {
      const recordId = resolveCanonicalRecordId(record, position);
      const logicalId = `${name}:${recordId}`;
      if (seen.has(logicalId)) throw new Error(`REFERENCE_INDEX_DUPLICATE_RECORD_ID:${name}`);
      seen.add(logicalId);
      return Object.freeze({
        logicalId,
        stableIdentity: !recordId.startsWith("@index:"),
        timestamps: projectTimestamps(record),
        reconstructionHints: projectHints(record),
        semanticSha256: createPayloadHash(record),
      });
    });
    return Object.freeze({ name, count: records.length, records: Object.freeze(records) });
  });

  if (missingReferencedMedia.length) throw new Error("REFERENCE_INDEX_MISSING_REFERENCED_MEDIA");
  const media = normalizeMedia(mediaFiles);
  const unsigned = {
    schemaVersion: 1,
    referenceIndexVersion: PHASE7B_WP2_REFERENCE_INDEX_VERSION,
    classification: "PHASE7B_WP2_REFERENCE_INDEX",
    observedAt: new Date(observedAt).toISOString(),
    applicationCommit,
    schemaIdentity: sanitizeSchemaIdentity(schemaIdentity),
    source: {
      runtimeVersion: String(runtime.version),
      runtimeRevision: String(runtime.revision ?? 0),
      runtimeUpdatedAt: new Date(runtime.updatedAt ?? runtime.importedAt).toISOString(),
      runtimeSha256,
      controlStateSha256,
    },
    collectionContractVersion: FOUNDATION_COLLECTION_CONTRACT_VERSION,
    collectionCount: collectionEntries.length,
    recordCount: collectionEntries.reduce((sum, entry) => sum + entry.count, 0),
    collections: collectionEntries,
    relationshipCount: collectCanonicalRelationships(collections, ownerUserId).length,
    relationships: collectCanonicalRelationships(collections, ownerUserId),
    mediaCount: media.length,
    media,
    founderCutoffPolicy: validateCutoffPolicy(cutoffPolicy),
  };
  const referenceIndexSha256 = createPayloadHash(unsigned);
  const result = Object.freeze({ ...unsigned, referenceIndexSha256 });
  if (SECRET_KEY.test(canonicalJson(result))) throw new Error("REFERENCE_INDEX_SECRET_FIELD_REJECTED");
  return result;
}

export function validatePhase7BWorkPackage2ReferenceIndex(index) {
  if (index?.referenceIndexVersion !== PHASE7B_WP2_REFERENCE_INDEX_VERSION) throw new Error("REFERENCE_INDEX_VERSION_INVALID");
  const { referenceIndexSha256, ...unsigned } = index;
  assertHash(referenceIndexSha256, "referenceIndexSha256");
  if (createPayloadHash(unsigned) !== referenceIndexSha256) throw new Error("REFERENCE_INDEX_DIGEST_MISMATCH");
  if (index.collectionCount !== FOUNDATION_SOURCE_COLLECTIONS.length) throw new Error("REFERENCE_INDEX_COLLECTION_COUNT_INVALID");
  if (SECRET_KEY.test(canonicalJson(index))) throw new Error("REFERENCE_INDEX_SECRET_FIELD_REJECTED");
  return index;
}

export function comparePhase7BWorkPackage2ReferenceIndexes(expectedInput, actualInput) {
  const expected = validatePhase7BWorkPackage2ReferenceIndex(expectedInput);
  const actual = validatePhase7BWorkPackage2ReferenceIndex(actualInput);
  const records = compareMaps(recordMap(expected), recordMap(actual), (entry) => entry.semanticSha256);
  const media = compareMaps(mediaMap(expected), mediaMap(actual), (entry) => createPayloadHash({
    size: entry.size, sha256: entry.sha256, mimeType: entry.mimeType, relationshipIds: entry.relationshipIds,
  }));
  const relationships = compareSets(relationshipSet(expected), relationshipSet(actual));
  const mismatchCount = records.missing.length + records.additional.length + records.changed.length +
    media.missing.length + media.additional.length + media.changed.length +
    relationships.missing.length + relationships.additional.length;
  return Object.freeze({
    classification: mismatchCount === 0 ? "PHASE7B_WP2_REFERENCE_COMPARISON_PASS" : "PHASE7B_WP2_REFERENCE_COMPARISON_DIFFERENCES",
    pass: mismatchCount === 0,
    expectedReferenceIndexSha256: expected.referenceIndexSha256,
    actualReferenceIndexSha256: actual.referenceIndexSha256,
    records,
    media,
    relationships,
    safeSummary: Object.freeze({
      presentRecordCount: records.present.length,
      missingRecordCount: records.missing.length,
      additionalRecordCount: records.additional.length,
      changedRecordCount: records.changed.length,
      presentMediaCount: media.present.length,
      missingMediaCount: media.missing.length,
      additionalMediaCount: media.additional.length,
      changedMediaCount: media.changed.length,
      missingRelationshipCount: relationships.missing.length,
      additionalRelationshipCount: relationships.additional.length,
    }),
  });
}

function projectTimestamps(record) {
  const result = {};
  if (!record || typeof record !== "object") return result;
  for (const key of TIMESTAMP_KEYS) {
    if (!(key in record) || record[key] == null) continue;
    const value = String(record[key]);
    if (value.length > 80 || Number.isNaN(Date.parse(value))) throw new Error(`REFERENCE_INDEX_TIMESTAMP_INVALID:${key}`);
    result[key] = value;
  }
  return result;
}

function projectHints(record) {
  const result = {};
  if (!record || typeof record !== "object") return result;
  for (const key of HINT_KEYS) {
    const value = record[key];
    if (value == null || typeof value === "object") continue;
    const text = String(value);
    if (text.length <= 160) result[key] = text;
  }
  return result;
}

function normalizeMedia(mediaFiles) {
  const seen = new Set();
  return [...mediaFiles].map((entry) => {
    const relativePath = String(entry.relativePath ?? "").replaceAll("\\", "/");
    if (!relativePath || relativePath.startsWith("/") || relativePath.includes("../")) throw new Error("REFERENCE_INDEX_MEDIA_PATH_INVALID");
    const key = relativePath.toLowerCase();
    if (seen.has(key)) throw new Error("REFERENCE_INDEX_DUPLICATE_MEDIA_PATH");
    seen.add(key);
    assertHash(entry.sha256, "mediaSha256");
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error("REFERENCE_INDEX_MEDIA_SIZE_INVALID");
    if (entry.lastWriteTimeUtc != null) assertIso(entry.lastWriteTimeUtc, "mediaLastWriteTimeUtc");
    return Object.freeze({
      relativePath,
      size: entry.size,
      sha256: entry.sha256,
      lastWriteTimeUtc: entry.lastWriteTimeUtc == null ? null : new Date(entry.lastWriteTimeUtc).toISOString(),
      mimeType: String(entry.mimeType ?? "application/octet-stream"),
      relationshipIds: Object.freeze([...new Set(entry.relationshipIds ?? [])].map(String).sort()),
    });
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function validateCutoffPolicy(policy) {
  if (policy?.founderMeaningfulDataThrough !== "2026-08-16" || policy?.founderDowntimeBegan !== "2026-08-17" ||
      policy?.destructiveFilteringPerformed !== false || policy?.provenanceInferred !== false) {
    throw new Error("REFERENCE_INDEX_CUTOFF_POLICY_INVALID");
  }
  return Object.freeze({ ...policy });
}

function sanitizeSchemaIdentity(value) {
  return Object.freeze({ version: String(value.version), migrationCount: Number(value.migrationCount), sha256: String(value.sha256) });
}

function assertHash(value, name) {
  if (!HASH.test(String(value))) throw new Error(`REFERENCE_INDEX_HASH_INVALID:${name}`);
}

function assertIso(value, name) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`REFERENCE_INDEX_TIME_INVALID:${name}`);
}

function recordMap(index) {
  return new Map(index.collections.flatMap((collection) => collection.records.map((record) => [record.logicalId, record])));
}
function mediaMap(index) { return new Map(index.media.map((entry) => [entry.relativePath, entry])); }
function relationshipSet(index) { return new Set(index.relationships.map((entry) => `${entry.from}|${entry.to}|${entry.type}`)); }
function compareMaps(expected, actual, digest) {
  const present = [], missing = [], additional = [], changed = [];
  for (const [key, value] of expected) {
    if (!actual.has(key)) missing.push(key);
    else if (digest(value) !== digest(actual.get(key))) changed.push(key);
    else present.push(key);
  }
  for (const key of actual.keys()) if (!expected.has(key)) additional.push(key);
  return Object.freeze({ present: present.sort(), missing: missing.sort(), additional: additional.sort(), changed: changed.sort() });
}
function compareSets(expected, actual) {
  return Object.freeze({
    present: [...expected].filter((value) => actual.has(value)).sort(),
    missing: [...expected].filter((value) => !actual.has(value)).sort(),
    additional: [...actual].filter((value) => !expected.has(value)).sort(),
  });
}
