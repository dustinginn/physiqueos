import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { createProgressReportingService } from "./ProgressReportingService";

const DEXA_CONTEXT_IDS = new Set([
  "build-lean-mass",
  "visible-abs",
  "all",
]);

export async function getDEXATimelineReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const timeline = await getTrainingEvidenceContext({
    context: DEXA_CONTEXT_IDS.has(context) ? context : "all",
    currentDate,
    repositories,
  });
  const scanWindow = getDEXAScanWindow(timeline);
  const report = await createProgressReportingService({
    repositories,
  }).getDEXAReport(undefined, { scanWindow });

  return {
    timeline: Object.freeze({
      ...timeline,
      selectedLabel:
        timeline.contextId === "all" ? "All DEXA" : timeline.selectedLabel,
      options: timeline.options.map((option) => ({
        ...option,
        label: option.id === "all" ? "All DEXA" : option.label,
      })),
      scanWindow,
      source:
        timeline.contextId === "all"
          ? "canonical_dexa_history"
          : "goal_lifecycle_with_dexa_baseline",
    }),
    report,
  };
}

export function getDEXAScanWindow(timeline) {
  if (timeline.contextId === "all") return null;

  if (timeline.contextId === "build-lean-mass") {
    return Object.freeze({
      baselineDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
      startDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
      endDate: timeline.endDate,
    });
  }

  return Object.freeze({
    startDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].startDate,
    endDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
  });
}
