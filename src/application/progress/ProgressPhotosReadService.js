import { createTrainingEvidenceContext } from "../../domain/services/TrainingEvidenceContextService.js";
import { createProviderPhotosEvidenceReport } from "../../domain/services/ProgressReportingService.js";
import {
  attachPhotoBriefingPublication,
  getPhotoSessionWindow,
} from "../../domain/services/PhotosEvidenceContextService.js";
import { resolveProgressPhotoMedia } from "./ProgressPhotoMediaResolutionService.js";

const PHOTO_CONTEXT_IDS = new Set(["build-lean-mass", "visible-abs", "all"]);

export function createProgressPhotosReadService({ store } = {}) {
  if (!store?.run) throw new Error("Progress Photos requires a read store.");
  return Object.freeze({
    getPhotosTimeline({ context, currentDate = new Date() } = {}) {
      return store.run("progress.photos", async () => {
        const [user, goals, weights, photoInputs, analyses, artifacts, mediaObjects] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listWeightEntries(),
          store.getPhotoInputs(),
          store.listPhotoAnalyses(),
          store.listPhotoBriefings(),
          store.listMediaObjects(),
        ]);
        const resolved = resolveProgressPhotoMedia({
          canonicalEvidenceObjects: photoInputs.canonicalEvidenceObjects,
          mediaObjects,
          progressPhotos: photoInputs.progressPhotos,
        });
        const timeline = createTrainingEvidenceContext({
          context: PHOTO_CONTEXT_IDS.has(context) ? context : "all",
          currentDate,
          goals,
          user,
        });
        const photoSessionWindow = getPhotoSessionWindow(timeline);
        const report = attachPhotoBriefingPublication({
          artifacts,
          report: createProviderPhotosEvidenceReport({
            analyses,
            canonicalEvidenceObjects: resolved.canonicalEvidenceObjects,
            goals,
            photoSessionWindow,
            progressPhotos: resolved.progressPhotos,
            user,
            weights,
          }),
        });
        return Object.freeze({
          report,
          timeline: Object.freeze({
            ...timeline,
            selectedLabel: timeline.contextId === "all" ? "All Photos" : timeline.selectedLabel,
            options: timeline.options.map((option) => ({
              ...option,
              label: option.id === "all" ? "All Photos" : option.label,
            })),
            photoSessionWindow,
            source: timeline.contextId === "all"
              ? "canonical_photo_history"
              : "goal_lifecycle_with_photo_baseline",
          }),
        });
      });
    },
  });
}
