import { createProviderMediaReferenceResolver } from "../media/ProviderMediaReferenceResolver.js";

const MEDIA_FIELDS = new Set([
  "imageHref",
  "previousImageHref",
  "firstImageHref",
  "currentImageHref",
  "thumbnailHref",
  "imageUrl",
  "previousImageUrl",
]);

export function createPhotoEventBriefingReadService({ store } = {}) {
  if (typeof store?.load !== "function") throw new Error("Photo Event briefing reads require a store.");
  return Object.freeze({
    async getPhotoEvent({ sessionId }) {
      const input = await store.load({ sessionId });
      if (!input.artifact?.briefing?.photoEventNarrative) return null;
      const resolver = createProviderMediaReferenceResolver(input.mediaObjects);
      return Object.freeze({
        artifactId: input.artifact.id,
        completion: input.goal?.completion ?? null,
        narrative: resolveNarrativeMedia(input.artifact.briefing.photoEventNarrative, resolver),
      });
    },
  });
}

export function resolveNarrativeMedia(value, resolver) {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => resolveNarrativeMedia(item, resolver)));
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    MEDIA_FIELDS.has(key) && typeof item === "string"
      ? resolver.resolveHref({ reference: item })
      : resolveNarrativeMedia(item, resolver),
  ])));
}
