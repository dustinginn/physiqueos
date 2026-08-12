import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";

export const BACKUP_MANIFEST_VERSION = "1";

export function createBackupManifest({ backupId, buildId, schemaVersion, database, objects, createdAt }) {
  const payload = Object.freeze({
    manifestVersion: BACKUP_MANIFEST_VERSION,
    backupId,
    buildId,
    schemaVersion,
    createdAt,
    database: normalizeArtifact(database),
    objects: Object.freeze((objects ?? []).map(normalizeObject).sort((a, b) => a.objectId.localeCompare(b.objectId))),
  });
  return Object.freeze({ ...payload, semanticDigest: createPayloadHash(payload) });
}

export function verifyBackupManifest(manifest) {
  const { semanticDigest, ...payload } = manifest ?? {};
  if (manifest?.manifestVersion !== BACKUP_MANIFEST_VERSION || !/^[a-f0-9]{64}$/.test(String(semanticDigest ?? ""))) throw new Error("Backup manifest is invalid.");
  if (createPayloadHash(payload) !== semanticDigest) throw new Error("Backup manifest digest does not match its content.");
  return true;
}

function normalizeArtifact(value) {
  if (!value?.sha256 || !Number.isSafeInteger(value.byteLength) || value.byteLength < 0) throw new Error("Database backup metadata is invalid.");
  return Object.freeze({ filename: String(value.filename), byteLength: value.byteLength, sha256: String(value.sha256).toLowerCase() });
}
function normalizeObject(value) {
  if (!value?.objectId || !value?.sha256 || !Number.isSafeInteger(value.byteLength) || value.byteLength < 0) throw new Error("Object backup metadata is invalid.");
  return Object.freeze({ objectId: String(value.objectId), byteLength: value.byteLength, sha256: String(value.sha256).toLowerCase(), providerVersion: value.providerVersion == null ? null : String(value.providerVersion) });
}
