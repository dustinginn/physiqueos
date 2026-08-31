import path from "node:path";
import { parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";

export function resolveProgressPhotoMedia({
  canonicalEvidenceObjects = [],
  mediaObjects = [],
  progressPhotos = [],
} = {}) {
  if (mediaObjects == null) {
    return Object.freeze({ canonicalEvidenceObjects, progressPhotos });
  }
  const index = createMediaIndex(mediaObjects);
  return Object.freeze({
    canonicalEvidenceObjects: Object.freeze(canonicalEvidenceObjects.map((record) => {
      const payload = record?.payload ?? {};
      if (payload.evidence_type === "photo_session") {
        return Object.freeze({
          ...record,
          payload: Object.freeze({
            ...payload,
            captureDate: payload.captureDate ?? payload.observed_at ?? record.lastObservedAt ?? null,
            photos: Object.freeze((payload.photos ?? []).map((photo) => resolvePhoto(photo, index))),
          }),
        });
      }
      if (payload.evidence_type === "progress_photo") {
        return Object.freeze({ ...record, payload: resolvePhoto(payload, index) });
      }
      return record;
    })),
    progressPhotos: Object.freeze(progressPhotos.map((photo) => resolveLegacyPhoto(photo, index))),
  });
}

function resolvePhoto(photo, index) {
  const reference = photo.storage_path ?? photo.imagePath ?? photo.sourcePath ?? null;
  const mediaId = resolveMediaId({
    reference,
    sourceHashes: photo.sourceHashes ?? [photo.source_hash],
    sourceIds: photo.sourceIds ?? [photo.id],
  }, index);
  const providerReference = mediaId ? `media://${mediaId}` : null;
  return Object.freeze({
    ...photo,
    ...(Object.hasOwn(photo, "storage_path") || !Object.hasOwn(photo, "imagePath")
      ? { storage_path: providerReference }
      : {}),
    ...(Object.hasOwn(photo, "imagePath") ? { imagePath: providerReference } : {}),
    ...(Object.hasOwn(photo, "sourcePath") ? { sourcePath: providerReference } : {}),
  });
}

function resolveLegacyPhoto(photo, index) {
  const mediaId = resolveMediaId({
    reference: photo.imagePath ?? photo.storage_path ?? null,
    sourceHashes: [photo.sourceHash, photo.source_hash],
    sourceIds: [photo.id],
  }, index);
  return Object.freeze({ ...photo, imagePath: mediaId ? `media://${mediaId}` : null });
}

function resolveMediaId({ reference, sourceHashes = [], sourceIds = [] }, index) {
  const directId = parsePrivateMediaReference(reference);
  if (directId && index.byId.has(directId)) return directId;
  for (const hash of sourceHashes.filter(Boolean)) {
    const match = index.byHash.get(String(hash).toLowerCase());
    if (match) return match;
  }
  for (const sourceId of sourceIds.filter(Boolean)) {
    const match = index.byEvidenceRecordId.get(String(sourceId));
    if (match) return match;
  }
  const normalized = normalizePath(reference);
  if (normalized && index.byPath.has(normalized)) return index.byPath.get(normalized);
  const basename = normalized ? path.posix.basename(normalized) : null;
  return basename ? index.byUniqueBasename.get(basename) ?? null : null;
}

function createMediaIndex(mediaObjects) {
  const byId = new Set();
  const byHash = new Map();
  const byEvidenceRecordId = new Map();
  const byPath = new Map();
  const basenameCandidates = new Map();
  for (const media of mediaObjects) {
    if (!media?.id || media.state !== "verified") continue;
    byId.add(media.id);
    if (media.sha256) byHash.set(String(media.sha256).toLowerCase(), media.id);
    if (media.evidence_record_id) byEvidenceRecordId.set(String(media.evidence_record_id), media.id);
    const sourcePath = normalizePath(media.provenance?.sourceRelativePath);
    if (!sourcePath) continue;
    byPath.set(sourcePath, media.id);
    const basename = path.posix.basename(sourcePath);
    const candidates = basenameCandidates.get(basename) ?? [];
    candidates.push(media.id);
    basenameCandidates.set(basename, candidates);
  }
  return Object.freeze({
    byId,
    byHash,
    byEvidenceRecordId,
    byPath,
    byUniqueBasename: new Map([...basenameCandidates]
      .filter(([, candidates]) => candidates.length === 1)
      .map(([basename, candidates]) => [basename, candidates[0]])),
  });
}

function normalizePath(value) {
  if (!value || String(value).startsWith("media://")) return null;
  return String(value)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/^private\/founder\//i, "")
    .toLowerCase();
}
