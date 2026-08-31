import path from "node:path";
import {
  isPrivateMediaObjectId,
  parsePrivateMediaReference,
} from "../../contracts/v1/mediaIdentifiers.js";

const PROVIDER_MEDIA_PATH = /^\/api\/private-evidence\/media\/([^/?#]+)$/i;
const LEGACY_MEDIA_PATH = /^\/api\/private-evidence\/(.+)$/i;

export function createProviderMediaReferenceResolver(mediaObjects = []) {
  const index = createMediaIndex(mediaObjects);
  const resolveObjectId = ({ reference, sourceHashes = [], sourceIds = [] } = {}) => {
    const directId = parseDirectMediaId(reference);
    if (directId && index.byId.has(directId)) return directId;
    for (const hash of sourceHashes.filter(Boolean)) {
      const match = unique(index.byHash.get(String(hash).toLowerCase()));
      if (match) return match;
    }
    for (const sourceId of sourceIds.filter(Boolean)) {
      const match = unique(index.byEvidenceRecordId.get(String(sourceId)));
      if (match) return match;
    }
    const normalized = normalizeLegacyMediaPath(reference);
    const exact = unique(index.byPath.get(normalized));
    if (exact) return exact;
    return unique(index.byBasename.get(normalized ? path.posix.basename(normalized) : null));
  };
  return Object.freeze({
    resolveObjectId,
    resolveReference(input) {
      const objectId = resolveObjectId(input);
      return objectId ? `media://${objectId}` : null;
    },
    resolveHref(input) {
      const objectId = resolveObjectId(input);
      return objectId ? `/api/private-evidence/media/${objectId}` : null;
    },
  });
}

export function normalizeLegacyMediaPath(value) {
  let candidate = String(value ?? "").trim();
  if (!candidate || parseDirectMediaId(candidate)) return null;
  candidate = candidate.replaceAll("\\", "/");
  const route = candidate.match(LEGACY_MEDIA_PATH);
  if (route) candidate = route[1];
  return candidate
    .replace(/^\/+/, "")
    .replace(/^private\//i, "")
    .replace(/^founder\//i, "")
    .toLowerCase();
}

function parseDirectMediaId(value) {
  const referenceId = parsePrivateMediaReference(value);
  if (referenceId) return referenceId;
  const routeId = String(value ?? "").match(PROVIDER_MEDIA_PATH)?.[1];
  return isPrivateMediaObjectId(routeId) ? routeId : null;
}

function createMediaIndex(mediaObjects) {
  const byId = new Set();
  const byHash = new Map();
  const byEvidenceRecordId = new Map();
  const byPath = new Map();
  const byBasename = new Map();
  for (const media of mediaObjects) {
    if (!media?.id || media.state !== "verified") continue;
    byId.add(media.id);
    add(byHash, String(media.sha256 ?? "").toLowerCase() || null, media.id);
    add(byEvidenceRecordId, media.evidence_record_id ? String(media.evidence_record_id) : null, media.id);
    const sourcePath = normalizeLegacyMediaPath(media.provenance?.sourceRelativePath);
    if (sourcePath) {
      add(byPath, sourcePath, media.id);
      add(byBasename, path.posix.basename(sourcePath), media.id);
    }
    add(byBasename, String(media.original_filename ?? "").toLowerCase() || null, media.id);
  }
  return Object.freeze({ byId, byHash, byEvidenceRecordId, byPath, byBasename });
}

function add(index, key, value) {
  if (!key) return;
  const values = index.get(key) ?? new Set();
  values.add(value);
  index.set(key, values);
}

function unique(values) {
  return values?.size === 1 ? [...values][0] : null;
}
