import {
  buildDEXAReport,
  createProviderActivityEvidenceReport,
  createProviderNutritionEvidenceReports,
  createProviderWeightEvidenceReport,
} from "../../domain/services/ProgressReportingService.js";
import { createTrainingEvidenceContext } from "../../domain/services/TrainingEvidenceContextService.js";
import { getDEXAScanWindow } from "../../domain/services/DEXAEvidenceContextService.js";

export function createProgressEvidenceReadService({ store } = {}) {
  if (!store?.run) throw new Error("Progress evidence requires a read store.");

  return Object.freeze({
    getDEXA({ context, currentDate = new Date() } = {}) {
      return store.run("progress.evidence.dexa", async () => {
        const [user, goals, scans] = await Promise.all([
          store.getUser(),
          store.listGoals(),
          store.listDEXAScans(),
        ]);
        const timeline = createEvidenceTimeline({
          context,
          currentDate,
          goals,
          label: "DEXA",
          source: "canonical_dexa_history",
          user,
        });
        const scanWindow = getDEXAScanWindow(timeline);
        const dexaScans = scanWindow ? scans.filter((scan) => inside(scan.measuredAt, scanWindow)) : scans;
        return Object.freeze({
          timeline: Object.freeze({
            ...timeline,
            scanWindow,
            source: timeline.contextId === "all"
              ? "canonical_dexa_history"
              : "goal_lifecycle_with_dexa_baseline",
          }),
          report: Object.freeze({ ...buildDEXAReport({ dexaScans, goals }), evidenceWindow: scanWindow }),
        });
      });
    },
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

function inside(value, window) {
  const date = String(value ?? "").slice(0, 10);
  return (!window.startDate || date >= window.startDate) && (!window.endDate || date <= window.endDate);
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
