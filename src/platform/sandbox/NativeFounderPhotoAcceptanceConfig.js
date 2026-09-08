import { isPrivateMediaObjectId } from "../../contracts/v1/mediaIdentifiers.js";

export const NATIVE_FOUNDER_PHOTO_ACCEPTANCE_SCHEMA_VERSION =
  "founder-photo-acceptance-allowlist-v1";

const CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,179}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const POSE_IDS = new Set([
  "front-relaxed",
  "back-relaxed",
  "back-flexed",
  "side-relaxed",
  "left-side-relaxed",
  "right-side-relaxed",
  "front-flexed",
]);

export function readNativeFounderPhotoAcceptanceConfig(env = process.env) {
  if (env.PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ENABLED !== "1") {
    return Object.freeze({ enabled: false });
  }

  const founderOwnerUserId = canonicalId(
    env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID,
    "Founder owner"
  );
  const sandboxOwnerUserId = canonicalId(
    env.PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID,
    "Sandbox owner"
  );
  if (founderOwnerUserId === sandboxOwnerUserId) {
    throw configurationError("Founder and sandbox photo authorities must remain distinct.");
  }

  let document;
  try {
    document = JSON.parse(
      String(env.PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST ?? "")
    );
  } catch {
    throw configurationError("The Founder photo acceptance allowlist is invalid JSON.");
  }
  if (document?.schemaVersion !== NATIVE_FOUNDER_PHOTO_ACCEPTANCE_SCHEMA_VERSION) {
    throw configurationError("The Founder photo acceptance allowlist schema is invalid.");
  }
  if (!Array.isArray(document.sessions) || document.sessions.length < 1 ||
      document.sessions.length > 4) {
    throw configurationError("The Founder photo acceptance allowlist must contain one to four sessions.");
  }

  const sessionIds = new Set();
  const photoIds = new Set();
  const mediaIds = new Set();
  let photoCount = 0;
  const sessions = document.sessions.map((session) => {
    const photoSessionId = canonicalId(session?.photoSessionId, "Photo session");
    if (sessionIds.has(photoSessionId)) duplicate("photo session");
    sessionIds.add(photoSessionId);
    if (!Array.isArray(session.photos) || session.photos.length < 1 || session.photos.length > 7) {
      throw configurationError("Each allowlisted photo session must contain one to seven photos.");
    }
    const photos = session.photos.map((photo) => {
      const photoId = canonicalId(photo?.photoId, "Photo");
      const mediaId = String(photo?.mediaId ?? "");
      const poseId = String(photo?.poseId ?? "");
      const captureDate = String(photo?.captureDate ?? "");
      if (!isPrivateMediaObjectId(mediaId)) {
        throw configurationError("An allowlisted media identity is invalid.");
      }
      if (!POSE_IDS.has(poseId)) {
        throw configurationError("An allowlisted progress-photo pose is invalid.");
      }
      if (!DATE.test(captureDate) || Number.isNaN(Date.parse(`${captureDate}T00:00:00Z`))) {
        throw configurationError("An allowlisted progress-photo date is invalid.");
      }
      if (photoIds.has(photoId)) duplicate("photo");
      if (mediaIds.has(mediaId)) duplicate("media");
      photoIds.add(photoId);
      mediaIds.add(mediaId);
      photoCount += 1;
      return Object.freeze({ photoId, mediaId, poseId, captureDate });
    });
    return Object.freeze({ photoSessionId, photos: Object.freeze(photos) });
  });
  if (photoCount > 28) {
    throw configurationError("The Founder photo acceptance allowlist is too large.");
  }

  return Object.freeze({
    enabled: true,
    founderOwnerUserId,
    sandboxOwnerUserId,
    sessions: Object.freeze(sessions),
  });
}

function canonicalId(value, label) {
  const candidate = String(value ?? "");
  if (!CANONICAL_ID.test(candidate)) {
    throw configurationError(`${label} identity is invalid.`);
  }
  return candidate;
}

function duplicate(kind) {
  throw configurationError(`The Founder photo acceptance allowlist contains a duplicate ${kind} identity.`);
}

function configurationError(message) {
  return Object.assign(new Error(message), {
    code: "NATIVE_FOUNDER_PHOTO_ACCEPTANCE_CONFIGURATION_INVALID",
  });
}
