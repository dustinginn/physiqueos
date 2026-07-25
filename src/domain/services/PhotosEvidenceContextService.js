import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { createProgressReportingService } from "./ProgressReportingService";

const PHOTO_CONTEXT_IDS = new Set(["build-lean-mass", "visible-abs", "all"]);

export async function getPhotosTimelineReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const timeline = await getTrainingEvidenceContext({
    context: PHOTO_CONTEXT_IDS.has(context) ? context : "all",
    currentDate,
    repositories,
  });
  const photoSessionWindow = getPhotoSessionWindow(timeline);
  const report = await createProgressReportingService({
    repositories,
  }).getPlaceholderReport("photos", undefined, { photoSessionWindow });

  return {
    timeline: Object.freeze({
      ...timeline,
      selectedLabel:
        timeline.contextId === "all" ? "All Photos" : timeline.selectedLabel,
      options: timeline.options.map((option) => ({
        ...option,
        label: option.id === "all" ? "All Photos" : option.label,
      })),
      photoSessionWindow,
      source:
        timeline.contextId === "all"
          ? "canonical_photo_history"
          : "goal_lifecycle_with_photo_baseline",
    }),
    report,
  };
}

export function getPhotoSessionWindow(timeline) {
  if (timeline.contextId === "all") return null;

  if (timeline.contextId === "build-lean-mass") {
    return Object.freeze({
      baselineDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
      startDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
      endDate: timeline.endDate,
    });
  }

  return EVIDENCE_CONTEXT_WINDOWS["visible-abs"];
}
