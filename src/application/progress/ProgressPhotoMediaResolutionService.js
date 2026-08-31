import { createProviderMediaReferenceResolver } from "../media/ProviderMediaReferenceResolver.js";

export function resolveProgressPhotoMedia({
  canonicalEvidenceObjects = [],
  mediaObjects = [],
  progressPhotos = [],
} = {}) {
  if (mediaObjects == null) {
    return Object.freeze({ canonicalEvidenceObjects, progressPhotos });
  }
  const resolver = createProviderMediaReferenceResolver(mediaObjects);
  return Object.freeze({
    canonicalEvidenceObjects: Object.freeze(canonicalEvidenceObjects.map((record) => {
      const payload = record?.payload ?? {};
      if (payload.evidence_type === "photo_session") {
        return Object.freeze({
          ...record,
          payload: Object.freeze({
            ...payload,
            captureDate: payload.captureDate ?? payload.observed_at ?? record.lastObservedAt ?? null,
            photos: Object.freeze((payload.photos ?? []).map((photo) => resolvePhoto(photo, resolver))),
          }),
        });
      }
      if (payload.evidence_type === "progress_photo") {
        return Object.freeze({ ...record, payload: resolvePhoto(payload, resolver) });
      }
      return record;
    })),
    progressPhotos: Object.freeze(progressPhotos.map((photo) => resolveLegacyPhoto(photo, resolver))),
  });
}

function resolvePhoto(photo, resolver) {
  const reference = photo.storage_path ?? photo.imagePath ?? photo.sourcePath ?? null;
  const providerReference = resolver.resolveReference({
    reference,
    sourceHashes: photo.sourceHashes ?? [photo.source_hash],
    sourceIds: photo.sourceIds ?? [photo.id],
  });
  return Object.freeze({
    ...photo,
    ...(Object.hasOwn(photo, "storage_path") || !Object.hasOwn(photo, "imagePath")
      ? { storage_path: providerReference }
      : {}),
    ...(Object.hasOwn(photo, "imagePath") ? { imagePath: providerReference } : {}),
    ...(Object.hasOwn(photo, "sourcePath") ? { sourcePath: providerReference } : {}),
  });
}

function resolveLegacyPhoto(photo, resolver) {
  const providerReference = resolver.resolveReference({
    reference: photo.imagePath ?? photo.storage_path ?? null,
    sourceHashes: [photo.sourceHash, photo.source_hash],
    sourceIds: [photo.id],
  });
  return Object.freeze({ ...photo, imagePath: providerReference });
}
