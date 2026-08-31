import { composeCompletedGoalPreview } from "../../domain/services/CompletedGoalPreviewService.js";
import { createProviderMediaReferenceResolver } from "../media/ProviderMediaReferenceResolver.js";
import { resolveNarrativeMedia } from "../briefings/PhotoEventBriefingReadService.js";
import { resolveProgressPhotoMedia } from "../progress/ProgressPhotoMediaResolutionService.js";

export function createCompletedGoalReadService({ store } = {}) {
  if (typeof store?.load !== "function") {
    throw new Error("Completed goal reads require a store.");
  }

  return Object.freeze({
    async getVisibleAbs() {
      const input = await store.load();
      const mediaObjects = input.mediaObjects;
      const progressPhotos = mediaObjects == null
        ? input.progressPhotos
        : resolveProgressPhotoMedia({
            mediaObjects,
            progressPhotos: input.progressPhotos,
          }).progressPhotos;
      const briefings = mediaObjects == null
        ? input.briefings
        : resolveBriefingMedia(input.briefings, mediaObjects);

      return composeCompletedGoalPreview({
        goals: input.goals,
        dexaScans: input.dexaScans,
        progressPhotos,
        briefings,
        currentGoal: input.currentGoal,
      });
    },
  });
}

function resolveBriefingMedia(briefings, mediaObjects) {
  const resolver = createProviderMediaReferenceResolver(mediaObjects);
  return Object.freeze(briefings.map((artifact) => Object.freeze({
    ...artifact,
    briefing: artifact.briefing?.photoEventNarrative
      ? Object.freeze({
          ...artifact.briefing,
          photoEventNarrative: resolveNarrativeMedia(
            artifact.briefing.photoEventNarrative,
            resolver,
          ),
        })
      : artifact.briefing,
  })));
}
