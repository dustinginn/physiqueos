import { createFounderBearerAuthenticator } from "./requestAuthenticator.js";
import { getNativeFounderPhotoAcceptanceComposition } from "../../application/composition/nativeFounderPhotoAcceptanceComposition.js";
import { foundationLogger } from "../foundation/runtime.js";

let runtime;

export function createNativeFounderPhotoAcceptanceRuntime({
  composition,
  logger = null,
  clock = () => performance.now(),
} = {}) {
  if (!composition?.founderAuthService || !composition?.service) {
    throw new Error("Native Founder photo acceptance runtime dependencies are required.");
  }
  const authenticator = createFounderBearerAuthenticator(composition.founderAuthService);
  const execute = async (event, request, requestId, callback) => {
    const startedAt = clock();
    const principal = await authenticator.authenticate(request);
    try {
      return await callback(principal);
    } finally {
      logger?.info(event, {
        requestId,
        authorityId: composition.authority?.descriptor?.authorityId,
        durationMs: Math.max(0, Math.round((clock() - startedAt) * 100) / 100),
      });
    }
  };
  return Object.freeze({
    getManifest: ({ request, requestId = null }) => execute(
      "native.sandbox.founder_photo_acceptance.manifest_read",
      request,
      requestId,
      (principal) => composition.service.getManifest({ principal })
    ),
    openMedia: ({ request, mediaId, requestId = null }) => execute(
      "native.sandbox.founder_photo_acceptance.media_read",
      request,
      requestId,
      (principal) => composition.service.openMedia({ principal, mediaId })
    ),
  });
}

export function getNativeFounderPhotoAcceptanceRuntime(env = process.env) {
  runtime ??= createNativeFounderPhotoAcceptanceRuntime({
    composition: getNativeFounderPhotoAcceptanceComposition(env),
    logger: foundationLogger,
  });
  return runtime;
}

export function resetNativeFounderPhotoAcceptanceRuntimeForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Native Founder photo acceptance runtime cannot be reset in production.");
  }
  runtime = undefined;
}
