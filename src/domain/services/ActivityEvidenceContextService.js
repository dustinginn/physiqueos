import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";
import { createProgressReportingService } from "./ProgressReportingService";

const ACTIVITY_CONTEXT_IDS = new Set([
  "build-lean-mass",
  "visible-abs",
  "all",
]);

export async function getActivityTimelineReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const timeline = await getTrainingEvidenceContext({
    context: ACTIVITY_CONTEXT_IDS.has(context) ? context : "build-lean-mass",
    currentDate,
    repositories,
  });
  const report = await createProgressReportingService({
    repositories,
  }).getActivityReport(undefined, {
    dateWindow: timeline.goalScoped
      ? { startDate: timeline.startDate, endDate: timeline.endDate }
      : null,
  });

  return {
    timeline: Object.freeze({
      ...timeline,
      selectedLabel:
        timeline.contextId === "all" ? "All Activity" : timeline.selectedLabel,
      options: timeline.options.map((option) => ({
        ...option,
        label: option.id === "all" ? "All Activity" : option.label,
      })),
      source:
        timeline.contextId === "all"
          ? "canonical_activity_history"
          : "goal_lifecycle",
    }),
    report,
  };
}
