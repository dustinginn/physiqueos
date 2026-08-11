import { createHash } from "node:crypto";
import { assertPrincipalOwns } from "../../application/auth/principal";
import { ApplicationProblem } from "../../contracts/v1/problem";
import { createAuthorizedReadDescriptor, createUploadIntent, PrivateObjectState } from "./privateObjectContracts";

export function createInMemoryPrivateObjectStorage({ clock = () => new Date(), createUuid } = {}) {
  const uploads = new Map();
  const objects = new Map();
  return Object.freeze({
    createUpload(principal, request) {
      assertPrincipalOwns(principal, request.ownerUserId);
      const intent = createUploadIntent(request, { createUuid });
      uploads.set(intent.uploadId, { ...intent });
      return intent;
    },
    completeUpload(principal, uploadId, bytes) {
      const upload = uploads.get(uploadId);
      if (!upload) throw unavailable();
      assertPrincipalOwns(principal, upload.ownerUserId);
      const buffer = Buffer.from(bytes);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (buffer.length !== upload.expectedSize || (upload.expectedSha256 && upload.expectedSha256 !== sha256)) {
        uploads.set(uploadId, { ...upload, state: PrivateObjectState.QUARANTINED });
        throw new ApplicationProblem({ status: 422, code: "UPLOAD_VERIFICATION_FAILED", title: "The uploaded object did not match its receipt." });
      }
      const record = Object.freeze({ ...upload, size: buffer.length, sha256, state: PrivateObjectState.VERIFIED, verifiedAt: clock().toISOString() });
      objects.set(upload.objectId, { record, bytes: buffer });
      uploads.set(uploadId, record);
      return record;
    },
    authorizeRead(principal, objectId, { lifetimeSeconds = 300 } = {}) {
      const stored = objects.get(objectId);
      if (!stored || stored.record.state !== PrivateObjectState.VERIFIED) throw unavailable();
      assertPrincipalOwns(principal, stored.record.ownerUserId);
      if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 300) throw new Error("Authorized reads may last at most 300 seconds.");
      return createAuthorizedReadDescriptor({
        ...stored.record,
        expiresAt: new Date(clock().getTime() + lifetimeSeconds * 1000).toISOString(),
        accessHandle: `memory-object:${objectId}`,
      });
    },
    tombstone(principal, objectId) {
      const stored = objects.get(objectId);
      if (!stored) throw unavailable();
      assertPrincipalOwns(principal, stored.record.ownerUserId);
      stored.record = Object.freeze({ ...stored.record, state: PrivateObjectState.TOMBSTONED, tombstonedAt: clock().toISOString() });
      return stored.record;
    },
    inspect(objectId) {
      const stored = objects.get(objectId);
      return stored ? structuredClone(stored.record) : null;
    },
  });
}

function unavailable() {
  return new ApplicationProblem({ status: 404, code: "OBJECT_NOT_FOUND", title: "The private object is unavailable." });
}
