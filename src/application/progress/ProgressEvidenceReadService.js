import {
  createProviderActivityEvidenceReport,
  createProviderNutritionEvidenceReports,
  createProviderWeightEvidenceReport,
} from "../../domain/services/ProgressReportingService.js";
import { createTrainingEvidenceContext } from "../../domain/services/TrainingEvidenceContextService.js";

export function createProgressEvidenceReadService({ store } = {}) {
  if (!store?.run) throw new Error("Progress evidence requires a read store.");

  return Object.freeze({
    getWeight({ context, currentDate = new Date() } = {}) {
      return store.run("progress.evidence.weight", async () => {
        const [user, goals, weights, dexaScans] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listWeightEntries(),
          store.listDEXAScans(),
        ]);
        const timeline = createEvidenceTimeline({
          context,
          currentDate,
          goals,
          label: "Weight",
          source: "canonical_weight_history",
          user,
        });
        return Object.freeze({
          timeline,
          report: createProviderWeightEvidenceReport({
            dateWindow: getDateWindow(timeline),
            dexaScans,
            goals,
            summaryContextId: timeline.contextId,
            weights,
          }),
        });
      });
    },

    getNutrition({ context, currentDate = new Date() } = {}) {
      return store.run("progress.evidence.nutrition", async () => {
        const [user, goals, nutritionContext, canonicalEvidenceObjects] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.getNutritionContext(),
          store.listCanonicalNutritionEvidenceObjects(),
        ]);
        const timeline = createEvidenceTimeline({
          context,
          currentDate,
          goals,
          label: "Nutrition",
          source: "canonical_nutrition_history",
          user,
        });
        const evidencePackages = canonicalEvidenceObjects.length
          ? []
          : await store.listEvidencePackages();
        const { globalReport, scopedReport } = createProviderNutritionEvidenceReports({
          canonicalEvidenceObjects,
          dateWindow: getDateWindow(timeline),
          evidencePackages,
          goals,
          nutritionContext,
        });
        return Object.freeze({
          timeline,
          report: timeline.goalScoped
            ? Object.freeze({
                ...scopedReport,
                currentNutritionProtocol: globalReport.currentNutritionProtocol,
                nutritionLibrary: globalReport.nutritionLibrary,
                nutritionReportingLinks: globalReport.nutritionReportingLinks,
              })
            : globalReport,
        });
      });
    },

    getActivity({ context, currentDate = new Date() } = {}) {
      return store.run("progress.evidence.activity", async () => {
        const [user, goals, canonicalEvidenceObjects] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listCanonicalActivityAndTrainingEvidenceObjects(),
        ]);
        const timeline = createEvidenceTimeline({
          context,
          currentDate,
          goals,
          label: "Activity",
          source: "canonical_activity_history",
          user,
        });
        const evidencePackages = canonicalEvidenceObjects.length
          ? []
          : await store.listEvidencePackages();
        return Object.freeze({
          timeline,
          report: createProviderActivityEvidenceReport({
            canonicalEvidenceObjects,
            dateWindow: getDateWindow(timeline),
            evidencePackages,
            goals,
          }),
        });
      });
    },
  });
}

function createEvidenceTimeline({ context, currentDate, goals, label, source, user }) {
  const timeline = createTrainingEvidenceContext({ context, currentDate, goals, user });
  return Object.freeze({
    ...timeline,
    selectedLabel: timeline.contextId === "all" ? `All ${label}` : timeline.selectedLabel,
    options: timeline.options.map((option) => ({
      ...option,
      label: option.id === "all" ? `All ${label}` : option.label,
    })),
    source: timeline.contextId === "all" ? source : "goal_lifecycle",
  });
}

function getDateWindow(timeline) {
  return timeline.goalScoped
    ? { startDate: timeline.startDate, endDate: timeline.endDate }
    : null;
}
