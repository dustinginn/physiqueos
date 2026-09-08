import { ApplicationProblem } from "../../contracts/v1/problem.js";

export const NATIVE_FOUNDER_PHOTO_CONTRACT_VERSION =
  "native-founder-photo-media-v1";

const MEDIA_PATH = "/api/v1/native/sandbox/photo-acceptance/media";
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function createNativeFounderPhotoAcceptanceService({
  authority,
  config,
  store,
  authorizeProviderRead,
} = {}) {
  if (!authority?.requirePrincipal || !config?.enabled ||
      !store?.readSelectedPhotos || typeof authorizeProviderRead !== "function") {
    throw new Error("Native Founder photo acceptance dependencies are required.");
  }
  if (authority.descriptor?.ownerUserId !== config.sandboxOwnerUserId) {
    throw new Error("The Native photo acceptance sandbox authority does not match its allowlist.");
  }
  const selections = Object.freeze(config.sessions.flatMap((session) =>
    session.photos.map((photo) => Object.freeze({
      photoSessionId: session.photoSessionId,
      ...photo,
    }))));
  const byMediaId = new Map(selections.map((selection) => [selection.mediaId, selection]));

  async function readAuthorized(principal, requestedSelections) {
    authority.requirePrincipal(principal, "founder:read");
    const photos = await store.readSelectedPhotos(requestedSelections);
    if (photos.length !== requestedSelections.length) throw unavailable();
    photos.forEach(validatePhoto);
    return photos;
  }

  return Object.freeze({
    async getManifest({ principal } = {}) {
      const photos = await readAuthorized(principal, selections);
      const bySession = new Map();
      for (const photo of photos) {
        const session = bySession.get(photo.photoSessionId) ?? {
          photoSessionId: photo.photoSessionId,
          captureDate: photo.captureDate,
          photos: [],
        };
        if (session.captureDate !== photo.captureDate) throw unavailable();
        session.photos.push(toContractPhoto(photo));
        bySession.set(photo.photoSessionId, session);
      }
      return Object.freeze({
        schemaVersion: NATIVE_FOUNDER_PHOTO_CONTRACT_VERSION,
        authority: Object.freeze({
          kind: "sandbox-founder-photo-acceptance",
          sandboxAuthorityId: authority.descriptor.authorityId,
        }),
        sessions: Object.freeze(config.sessions.map(({ photoSessionId }) => {
          const session = bySession.get(photoSessionId);
          if (!session) throw unavailable();
          return Object.freeze({
            photoSessionId: session.photoSessionId,
            captureDate: session.captureDate,
            photos: Object.freeze(session.photos),
          });
        })),
      });
    },

    async openMedia({ principal, mediaId } = {}) {
      authority.requirePrincipal(principal, "founder:read");
      const selection = byMediaId.get(String(mediaId ?? ""));
      if (!selection) throw unavailable();
      const [photo] = await readAuthorized(principal, [selection]);
      const access = await authorizeProviderRead({
        objectKey: photo.media.objectKey,
        providerVersion: photo.media.providerVersion,
        expiresInSeconds: 60,
      });
      if (!access?.url) throw unavailable();
      return Object.freeze({
        url: access.url,
        contentType: photo.media.contentType,
        contentLength: photo.media.size,
      });
    },
  });
}

function toContractPhoto(photo) {
  return Object.freeze({
    viewIdentity: `${photo.photoSessionId}-${photo.poseId}`,
    photoSessionId: photo.photoSessionId,
    photoId: photo.photoId,
    mediaId: photo.media.id,
    poseId: photo.poseId,
    captureDate: photo.captureDate,
    contentType: photo.media.contentType,
    pixelWidth: photo.media.pixelWidth,
    pixelHeight: photo.media.pixelHeight,
    delivery: Object.freeze({
      kind: "authenticated-proxy",
      path: `${MEDIA_PATH}/${encodeURIComponent(photo.media.id)}`,
    }),
  });
}

function validatePhoto(photo) {
  if (!photo?.photoSessionId || !photo?.photoId || !photo?.poseId ||
      !photo?.captureDate || !photo?.media?.id || !photo?.media?.objectKey ||
      !SUPPORTED_IMAGE_TYPES.has(String(photo?.media?.contentType ?? "").toLowerCase()) ||
      !Number.isSafeInteger(photo?.media?.size) || photo.media.size < 1) {
    throw unavailable();
  }
}

function unavailable() {
  return new ApplicationProblem({
    status: 404,
    code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE",
    title: "The selected progress photo is unavailable.",
  });
}
