import { createTrainingEvidenceContext } from "../../domain/services/TrainingEvidenceContextService.js";
import {
  createProviderPhotosEvidenceReport,
  scopePhotoSessionsToWindow,
} from "../../domain/services/ProgressReportingService.js";
import { createPhotoSessionReadModels } from "../../domain/services/CanonicalPhotoSessionReadService.js";
import {
  attachPhotoBriefingPublication,
  getPhotoSessionWindow,
} from "../../domain/services/PhotosEvidenceContextService.js";
import {
  createProgressPhotoMediaLookup,
  resolveProgressPhotoMedia,
} from "./ProgressPhotoMediaResolutionService.js";
import { projectNativePhotosRead } from "../native/NativeReadProjectionService.js";

const PHOTO_CONTEXT_IDS = new Set(["build-lean-mass", "visible-abs", "all"]);

export function createProgressPhotosReadService({ store } = {}) {
  if (!store?.run) throw new Error("Progress Photos requires a read store.");
  async function readPhotos({ context, currentDate = new Date(), nativeLimit = null } = {}) {
    return store.run("progress.photos", async () => {
      const [user, goals, weights, photoInputs, analyses, artifacts] = await Promise.all([
        store.getUser(),
        store.listGoals(),
        store.listWeightEntries(),
        store.getPhotoInputs(),
        store.listPhotoAnalyses(),
        store.listPhotoBriefings(),
      ]);
      const mediaObjects = await store.listMediaObjects(
        createProgressPhotoMediaLookup(photoInputs)
      );
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
      const photoSessions = createPhotoSessionReadModels({
        analyses,
        canonicalObjects: resolved.canonicalEvidenceObjects,
        legacyPhotos: resolved.progressPhotos,
        weights,
      });
      const report = attachPhotoBriefingPublication({
        artifacts,
        report: createProviderPhotosEvidenceReport({
          analyses,
          canonicalEvidenceObjects: resolved.canonicalEvidenceObjects,
          goals,
          photoSessionWindow,
          photoSessions,
          progressPhotos: resolved.progressPhotos,
          user,
          weights,
        }),
      });
      const projectedTimeline = Object.freeze({
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
      });
      if (nativeLimit != null) {
        return projectNativePhotosRead({
          timeline: projectedTimeline,
          photoSessions: scopePhotoSessionsToWindow(photoSessions, photoSessionWindow),
          limit: nativeLimit,
        });
      }
      return Object.freeze({ report, timeline: projectedTimeline });
    });
  }
  return Object.freeze({
    getPhotosTimeline: (input) => readPhotos(input),
    getNativePhotosTimeline: ({ limit = 12, ...input } = {}) => readPhotos({ ...input, nativeLimit: limit }),
  });
}
