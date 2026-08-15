const CANONICAL_MIGRATED_MEDIA_OBJECT_ID = /^media-[0-9a-f]{32}-[0-9a-f]{12}$/;
const UUID_MEDIA_OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_REFERENCE_PREFIX = "media://";

export function isPrivateMediaObjectId(value) {
  if (typeof value !== "string") return false;
  return CANONICAL_MIGRATED_MEDIA_OBJECT_ID.test(value) || UUID_MEDIA_OBJECT_ID.test(value);
}

export function requirePrivateMediaObjectId(value, field = "objectId") {
  if (!isPrivateMediaObjectId(value)) throw new Error(`${field} is not a valid private media identifier.`);
  return value;
}

export function parsePrivateMediaReference(value) {
  if (typeof value !== "string" || !value.startsWith(MEDIA_REFERENCE_PREFIX)) return null;
  const objectId = value.slice(MEDIA_REFERENCE_PREFIX.length);
  return isPrivateMediaObjectId(objectId) ? objectId : null;
}

export function createPrivateMediaReference(objectId) {
  return `${MEDIA_REFERENCE_PREFIX}${requirePrivateMediaObjectId(objectId)}`;
}
