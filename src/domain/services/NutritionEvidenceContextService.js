import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";
import { createProgressReportingService } from "./ProgressReportingService";

const NUTRITION_CONTEXT_IDS = new Set([
  "build-lean-mass",
  "visible-abs",
  "all",
]);

export async function getNutritionTimelineReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const timeline = await getTrainingEvidenceContext({
    context: NUTRITION_CONTEXT_IDS.has(context) ? context : "build-lean-mass",
    currentDate,
    repositories,
  });
  const reporting = createProgressReportingService({ repositories });
  const [globalReport, scopedReport] = await Promise.all([
    reporting.getPlaceholderReport("nutrition"),
    timeline.goalScoped
      ? reporting.getPlaceholderReport("nutrition", undefined, {
          dateWindow: {
            startDate: timeline.startDate,
            endDate: timeline.endDate,
          },
        })
      : null,
  ]);
  const report = scopedReport
    ? {
        ...scopedReport,
        currentNutritionProtocol: globalReport.currentNutritionProtocol,
        nutritionLibrary: globalReport.nutritionLibrary,
        nutritionReportingLinks: globalReport.nutritionReportingLinks,
      }
    : globalReport;

  return {
    timeline: Object.freeze({
      ...timeline,
      selectedLabel:
        timeline.contextId === "all" ? "All Nutrition" : timeline.selectedLabel,
      options: timeline.options.map((option) => ({
        ...option,
        label: option.id === "all" ? "All Nutrition" : option.label,
      })),
      source:
        timeline.contextId === "all"
          ? "canonical_nutrition_history"
          : "goal_lifecycle",
    }),
    report,
  };
}
