import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";
import { createProgressReportingService } from "./ProgressReportingService";

const WEIGHT_CONTEXT_IDS = new Set([
  "build-lean-mass",
  "visible-abs",
  "all",
]);

export async function getWeightTimelineReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const timeline = await getTrainingEvidenceContext({
    context: WEIGHT_CONTEXT_IDS.has(context) ? context : "build-lean-mass",
    currentDate,
    repositories,
  });
  const report = await createProgressReportingService({
    repositories,
  }).getWeightReport(undefined, {
    dateWindow: timeline.goalScoped
      ? { startDate: timeline.startDate, endDate: timeline.endDate }
      : null,
    summaryContextId: timeline.contextId,
  });

  return {
    timeline: Object.freeze({
      ...timeline,
      selectedLabel:
        timeline.contextId === "all" ? "All Weight" : timeline.selectedLabel,
      options: timeline.options.map((option) => ({
        ...option,
        label: option.id === "all" ? "All Weight" : option.label,
      })),
      source:
        timeline.contextId === "all"
          ? "canonical_weight_history"
          : "goal_lifecycle",
    }),
    report,
  };
}
