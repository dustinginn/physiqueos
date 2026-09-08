import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createProviderMediaReferenceResolver } from "../../application/media/ProviderMediaReferenceResolver.js";
import { getProgressPhotoCategoryId } from "../../domain/models/progressPhotoPoseVocabulary.js";

export function createPostgresFounderPhotoAcceptanceStore({ pool, founderOwnerUserId } = {}) {
  if (!pool?.query || !founderOwnerUserId) {
    throw new Error("Founder photo acceptance storage requires a PostgreSQL pool and Founder owner.");
  }

  return Object.freeze({
    async readSelectedPhotos(selections = []) {
      if (!Array.isArray(selections) || selections.length === 0) return Object.freeze([]);
      const sessionIds = unique(selections.map((selection) => selection.photoSessionId));
      const mediaIds = unique(selections.map((selection) => selection.mediaId));
      const [sessionResult, mediaResult] = await Promise.all([
        pool.query(
          `SELECT record_id,payload
             FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
              AND (record_id=ANY($2::text[]) OR payload->>'canonicalId'=ANY($2::text[]))
              AND COALESCE(payload#>>'{payload,evidence_type}',payload->>'evidence_type')='photo_session'`,
          [founderOwnerUserId, sessionIds],
        ),
        pool.query(
          `SELECT id,owner_user_id,evidence_record_id,content_type,byte_length,sha256,
                  storage_key,provider_version,provenance,state
             FROM physiqueos.canonical_media_objects
            WHERE owner_user_id=$1 AND id=ANY($2::text[]) AND state='verified'`,
          [founderOwnerUserId, mediaIds],
        ),
      ]);
      const sessions = new Map(sessionResult.rows.map((row) => [
        String(row.payload?.canonicalId ?? row.record_id),
        row.payload,
      ]));
      const mediaObjects = mediaResult.rows.map((row) => ({ ...row, state: "verified" }));
      const mediaById = new Map(mediaObjects.map((media) => [String(media.id), media]));
      const resolver = createProviderMediaReferenceResolver(mediaObjects);

      return Object.freeze(selections.map((selection) => {
        const record = sessions.get(selection.photoSessionId);
        const session = record?.payload ?? record;
        const photo = (session?.photos ?? []).find((candidate) =>
          String(candidate?.canonicalPhotoId ?? candidate?.id ?? "") === selection.photoId);
        const media = mediaById.get(selection.mediaId);
        const expectedObjectKey = media
          ? `private/${founderOwnerUserId}/${media.id}/original`
          : null;
        if (!record || !photo || !media || media.owner_user_id !== founderOwnerUserId ||
            media.storage_key !== expectedObjectKey) {
          throw unavailable();
        }
        const poseId = getProgressPhotoCategoryId(photo);
        const captureDate = dateKey(session.captureDate ?? session.observed_at ?? record.lastObservedAt);
        const resolvedMediaId = resolver.resolveObjectId({
          reference: photo.storage_path ?? photo.imagePath ?? photo.sourcePath ?? null,
          sourceHashes: photo.sourceHashes ?? [photo.source_hash],
          sourceIds: photo.sourceIds ?? [photo.id],
        });
        if (poseId !== selection.poseId || captureDate !== selection.captureDate ||
            resolvedMediaId !== selection.mediaId) {
          throw unavailable();
        }
        return Object.freeze({
          photoSessionId: selection.photoSessionId,
          photoId: selection.photoId,
          poseId,
          captureDate,
          media: Object.freeze({
            id: media.id,
            ownerUserId: media.owner_user_id,
            contentType: media.content_type,
            size: Number(media.byte_length),
            sha256: media.sha256,
            objectKey: media.storage_key,
            providerVersion: media.provider_version ?? null,
            pixelWidth: positiveInteger(media.provenance?.pixelWidth ?? media.provenance?.width),
            pixelHeight: positiveInteger(media.provenance?.pixelHeight ?? media.provenance?.height),
          }),
        });
      }));
    },
  });
}

function unavailable() {
  return new ApplicationProblem({
    status: 404,
    code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE",
    title: "The selected progress photo is unavailable.",
  });
}

function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function positiveInteger(value) {
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
