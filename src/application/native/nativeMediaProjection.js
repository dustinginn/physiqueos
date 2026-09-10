import { isPrivateMediaObjectId, parsePrivateMediaReference } from "../../contracts/v1/mediaIdentifiers.js";

const PRIVATE_MEDIA_PATH = /^\/api\/private-evidence\/media\/([^/?#]+)$/i;
const MEDIA_FIELD = Object.freeze({
  href: "media",
  imageHref: "media",
  imageUrl: "media",
  imageReference: "media",
  mediaReference: "media",
  sourceHref: "sourceMedia",
  thumbnailHref: "thumbnailMedia",
  previousImageHref: "previousMedia",
  previousImageUrl: "previousMedia",
});

export function projectNativeMediaReferences(value) {
  if (Array.isArray(value)) return value.map(projectNativeMediaReferences);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    const mediaId = privateMediaId(child);
    const descriptorKey = mediaId ? MEDIA_FIELD[key] : null;
    if (descriptorKey) {
      const descriptor = nativeMediaDescriptor(mediaId);
      const existing = output[descriptorKey];
      if (existing && existing.mediaId !== descriptor.mediaId) {
        throw new Error(`Native media projection found competing ${descriptorKey} identities.`);
      }
      output[descriptorKey] = descriptor;
      continue;
    }
    if (MEDIA_FIELD[key] && isPrivateMediaLike(child)) continue;
    output[key] = projectNativeMediaReferences(child);
  }
  return output;
}

function isPrivateMediaLike(value) {
  if (typeof value !== "string") return false;
  return value.startsWith("media://") || value.startsWith("/api/private-evidence/") ||
    value.startsWith("private/") || value.startsWith("private\\") || /^[A-Za-z]:[\\/]/.test(value);
}

export function nativeMediaDescriptor(mediaId) {
  if (!isPrivateMediaObjectId(mediaId)) throw new Error("Native media requires an opaque canonical media ID.");
  return Object.freeze({
    mediaId,
    deliveryPath: `/api/v1/native/media/${encodeURIComponent(mediaId)}`,
  });
}

function privateMediaId(value) {
  if (typeof value !== "string") return null;
  const reference = parsePrivateMediaReference(value);
  if (reference) return reference;
  const match = PRIVATE_MEDIA_PATH.exec(value);
  const candidate = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isPrivateMediaObjectId(candidate) ? candidate : null;
}
