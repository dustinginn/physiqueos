import { createUuidV7, requireResourceId } from "../../contracts/v1/identifiers";

export const PrivateObjectState = Object.freeze({
  CREATED: "created",
  UPLOADING: "uploading",
  VERIFIED: "verified",
  QUARANTINED: "quarantined",
  TOMBSTONED: "tombstoned",
  PURGED: "purged",
});

export function createUploadIntent({ ownerUserId, contentType, expectedSize, expectedSha256 = null, provenance = null }, options = {}) {
  requireResourceId(ownerUserId, "ownerUserId");
  if (!/^[-\w.+]+\/[-\w.+]+$/.test(String(contentType ?? ""))) throw new Error("A valid content type is required.");
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) throw new Error("Expected size must be a non-negative safe integer.");
  if (expectedSha256 != null && !/^[a-f0-9]{64}$/i.test(expectedSha256)) throw new Error("Expected SHA-256 is invalid.");
  return Object.freeze({
    uploadId: createUuidV7(options),
    objectId: createUuidV7(options),
    ownerUserId,
    contentType,
    expectedSize,
    expectedSha256: expectedSha256?.toLowerCase() ?? null,
    provenance: provenance == null ? null : structuredClone(provenance),
    state: PrivateObjectState.CREATED,
  });
}

export function createAuthorizedReadDescriptor({ objectId, ownerUserId, contentType, size, sha256, expiresAt, accessHandle }) {
  return Object.freeze({
    objectId: requireResourceId(objectId, "objectId"),
    ownerUserId: requireResourceId(ownerUserId, "ownerUserId"),
    contentType,
    size,
    sha256,
    expiresAt,
    accessHandle,
  });
}
