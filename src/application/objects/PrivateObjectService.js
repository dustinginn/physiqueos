import { ApplicationProblem, staleVersionProblem } from "../../contracts/v1/problem.js";
import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { createUploadIntent } from "../../platform/object-storage/privateObjectContracts.js";
import { createPrivateObjectKey } from "../../platform/object-storage/SpacesPrivateObjectProvider.js";
import { assertPrincipalOwns, requireAuthenticationPrincipal } from "../auth/principal.js";

const UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ALLOWED_TYPES = Object.freeze(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"]);

export function createPrivateObjectService({ transactionRunner, provider, clock = () => new Date(), createId, allowedContentTypes = DEFAULT_ALLOWED_TYPES }) {
  async function beginUpload({ principal, contentType, byteLength, sha256 = null, provenance = null }) {
    const actor = requireAuthenticationPrincipal(principal);
    if (!allowedContentTypes.includes(contentType)) throw new ApplicationProblem({ status: 415, code: "OBJECT_CONTENT_TYPE_REJECTED", title: "This private object type is not permitted." });
    const contract = createUploadIntent({ ownerUserId: actor.userId, contentType, expectedSize: byteLength, expectedSha256: sha256, provenance }, { createUuid: createId });
    const providerUpload = await provider.beginMultipartUpload({ ownerUserId: actor.userId, objectId: contract.objectId, contentType, expectedSha256: contract.expectedSha256 });
    const expiresAt = new Date(clock().getTime() + UPLOAD_LIFETIME_MS);
    try {
      await transactionRunner.run((transaction) => transaction.objects.createObjectAndIntent({
        object: { id: contract.objectId, userId: actor.userId, bucket: providerUpload.bucket, objectKey: providerUpload.objectKey, contentType, byteLength, sha256: contract.expectedSha256, provenance },
        intent: { id: contract.uploadId, expiresAt, providerUploadId: providerUpload.providerUploadId },
      }));
    } catch (error) {
      await provider.abortMultipartUpload(providerUpload).catch(() => undefined);
      throw error;
    }
    return Object.freeze({ uploadId: contract.uploadId, objectId: contract.objectId, state: "created", expiresAt: expiresAt.toISOString(), partUpload: Object.freeze({ mode: "multipart", maximumParts: 10_000 }) });
  }

  async function authorizePart({ principal, uploadId, partNumber }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run(async (transaction) => {
      const intent = await transaction.objects.findIntentForOwner({ intentId: uploadId, userId: actor.userId });
      if (!intent) throw notFound();
      if (new Date(intent.expires_at) <= clock()) throw new ApplicationProblem({ status: 410, code: "UPLOAD_INTENT_EXPIRED", title: "The private upload intent expired." });
      const object = await transaction.objects.findObjectForOwner({ objectId: intent.object_id, userId: actor.userId });
      const descriptor = await provider.authorizeUploadPart({ objectKey: object.object_key, providerUploadId: intent.provider_upload_id, partNumber });
      await transaction.objects.markUploading({ intentId: uploadId, userId: actor.userId, providerUploadId: intent.provider_upload_id });
      return Object.freeze({ uploadId, partNumber, uploadUrl: descriptor.url, expiresInSeconds: descriptor.expiresInSeconds });
    });
  }

  async function completeUpload({ principal, uploadId, parts }) {
    const actor = requireAuthenticationPrincipal(principal);
    const receiptHash = createPayloadHash({ uploadId, parts });
    const snapshot = await transactionRunner.run(async (transaction) => {
      const now = clock();
      const intent = await transaction.objects.findIntentForOwner({ intentId: uploadId, userId: actor.userId, lock: true });
      if (!intent) throw notFound();
      if (intent.state === "completed") {
        if (intent.completion_receipt_hash !== receiptHash) throw new ApplicationProblem({ status: 409, code: "UPLOAD_RECEIPT_REUSED", title: "The upload was already completed with a different receipt." });
        return Object.freeze({ replay: true, intent });
      }
      if (intent.state === "completing" && new Date(intent.updated_at).getTime() > now.getTime() - 5 * 60 * 1000) return Object.freeze({ pending: true });
      if (!['created', 'uploading', 'completing'].includes(intent.state) || new Date(intent.expires_at) <= now) throw new ApplicationProblem({ status: 409, code: "UPLOAD_NOT_COMPLETABLE", title: "The private upload cannot be completed." });
      const object = await transaction.objects.findObjectForOwner({ objectId: intent.object_id, userId: actor.userId });
      const claimed = await transaction.objects.claimCompletion({ intentId: uploadId, userId: actor.userId, reclaimBefore: new Date(now.getTime() - 5 * 60 * 1000), at: now });
      if (!claimed) return Object.freeze({ pending: true });
      return Object.freeze({ replay: false, recovered: intent.state === "completing", intent: claimed, object });
    });
    if (snapshot.replay) return Object.freeze({ outcome: "replayed", objectId: snapshot.intent.object_id });
    if (snapshot.pending) return Object.freeze({ outcome: "pending", uploadId });
    try {
      let completion = null;
      let actual = null;
      if (snapshot.recovered) actual = await provider.inspectObject({ objectKey: snapshot.object.object_key }).catch(() => null);
      if (!actual) {
        completion = await provider.completeMultipartUpload({ objectKey: snapshot.object.object_key, providerUploadId: snapshot.intent.provider_upload_id, parts });
        actual = await provider.inspectObject({ objectKey: snapshot.object.object_key, providerVersion: completion.providerVersion });
      }
      verifyObject(actual, snapshot.object);
      const committed = await transactionRunner.run((transaction) => transaction.objects.completeVerified({
        intentId: uploadId, userId: actor.userId, receiptHash, providerEtag: actual.etag ?? completion?.etag,
        providerVersion: actual.providerVersion ?? completion?.providerVersion, verifiedAt: clock(),
      }));
      return Object.freeze({ outcome: snapshot.recovered ? "recovered" : "committed", objectId: committed.object.id, version: committed.object.version });
    } catch (error) {
      await transactionRunner.run((transaction) => transaction.objects.releaseCompletionClaim({ intentId: uploadId, userId: actor.userId, at: clock() })).catch(() => undefined);
      throw error;
    }
  }

  async function authorizeRead({ principal, objectId }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run(async (transaction) => {
      const object = await transaction.objects.findObjectForOwner({ objectId, userId: actor.userId });
      if (!object || object.state !== "verified") throw notFound();
      assertPrincipalOwns(actor, object.user_id);
      const read = await provider.authorizeRead({ objectKey: object.object_key, providerVersion: object.provider_version, expiresInSeconds: 300 });
      return Object.freeze({ objectId, contentType: object.content_type, byteLength: Number(object.byte_length), sha256: object.sha256, readUrl: read.url, expiresInSeconds: read.expiresInSeconds });
    });
  }

  async function tombstone({ principal, objectId, expectedVersion }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run(async (transaction) => {
      const existing = await transaction.objects.findObjectForOwner({ objectId, userId: actor.userId });
      if (!existing) throw notFound();
      const changed = await transaction.objects.tombstone({ objectId, userId: actor.userId, expectedVersion, at: clock() });
      if (!changed) throw staleVersionProblem({ expectedVersion, actualVersion: existing.version, resource: objectId });
      return Object.freeze({ objectId, state: "tombstoned", version: changed.version });
    });
  }

  return Object.freeze({ beginUpload, authorizePart, completeUpload, authorizeRead, tombstone });
}

function verifyObject(actual, expected) {
  if (actual.byteLength !== Number(expected.byte_length)) throw new ApplicationProblem({ status: 422, code: "OBJECT_LENGTH_MISMATCH", title: "The uploaded object length did not match its intent." });
  if (actual.contentType !== expected.content_type) throw new ApplicationProblem({ status: 422, code: "OBJECT_CONTENT_TYPE_MISMATCH", title: "The uploaded object type did not match its intent." });
  if (expected.sha256 && actual.sha256?.toLowerCase() !== expected.sha256.toLowerCase()) throw new ApplicationProblem({ status: 422, code: "OBJECT_CHECKSUM_MISMATCH", title: "The uploaded object checksum did not match its intent." });
}
function notFound() { return new ApplicationProblem({ status: 404, code: "PRIVATE_OBJECT_NOT_FOUND", title: "The private object is unavailable." }); }
