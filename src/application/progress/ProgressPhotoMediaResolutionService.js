import { parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";
import {
  createProviderMediaReferenceResolver,
  normalizeLegacyMediaPath,
} from "../media/ProviderMediaReferenceResolver.js";

export function createProgressPhotoMediaLookup({
  canonicalEvidenceObjects = [],
  progressPhotos = [],
} = {}) {
  const photos = [
    ...canonicalEvidenceObjects.flatMap((record) => {
      const payload = record?.payload ?? {};
      if (payload.evidence_type === "photo_session") return payload.photos ?? [];
      return payload.evidence_type === "progress_photo" ? [payload] : [];
    }),
    ...progressPhotos,
  ];
  const objectIds = new Set();
  const normalizedPaths = new Set();
  const basenames = new Set();
  const sourceHashes = new Set();
  const sourceIds = new Set();
  for (const photo of photos) {
    const reference = photo.storage_path ?? photo.imagePath ?? photo.sourcePath ?? null;
    const objectId = parsePrivateMediaReference(reference);
    if (objectId) objectIds.add(objectId);
    const normalized = normalizeLegacyMediaPath(reference);
    if (normalized) {
      normalizedPaths.add(normalized);
      basenames.add(normalized.split("/").at(-1));
    }
    for (const hash of [...(photo.sourceHashes ?? []), photo.sourceHash, photo.source_hash]) {
      if (hash) sourceHashes.add(String(hash).toLowerCase());
    }
    for (const id of [...(photo.sourceIds ?? []), photo.id]) {
      if (id) sourceIds.add(String(id));
    }
  }
  return Object.freeze({
    objectIds: Object.freeze([...objectIds].sort()),
    normalizedPaths: Object.freeze([...normalizedPaths].sort()),
    basenames: Object.freeze([...basenames].sort()),
    sourceHashes: Object.freeze([...sourceHashes].sort()),
    sourceIds: Object.freeze([...sourceIds].sort()),
  });
}

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
