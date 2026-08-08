import { ForecastMilestoneStatus } from "./ForecastRuntimeContract";
import { compareDates, dateOnly, uniqueStrings } from "./forecastRuntimeUtils";

export function evaluateForecastMilestones({
  goalContract,
  structuredInterpretation,
} = {}) {
  const cutoff = dateOnly(structuredInterpretation?.evaluationContext?.evidenceCutoff);
  const reconciled = structuredInterpretation?.evidenceReconciliation
    ?.reconciledConclusions ?? [];
  return (goalContract?.milestones ?? []).map((milestone) => {
    const conclusionRef = `milestone:${milestone.milestoneId}`;
    const conclusion = reconciled.find((item) =>
      item.conclusionRef === conclusionRef);
    const expectedWindow = normalizeWindow(milestone.timing);
    const status = milestoneStatus({ conclusion, expectedWindow, cutoff });
    return {
      milestoneId: milestone.milestoneId,
      status,
      required: milestone.required === true,
      expectedWindow,
      objectiveRefs: uniqueStrings(milestone.objectiveRefs),
      guardrailRefs: uniqueStrings(milestone.guardrailRefs),
      hypothesisRefs: uniqueStrings(milestone.hypothesisRefs),
      uncertaintyExpectedToReduce: uniqueStrings(
        milestone.uncertaintyExpectedToReduce),
      decisionBoundary: milestone.decisionBoundary ?? null,
      rationale: `milestone_${status}`,
    };
  }).sort((left, right) => left.milestoneId.localeCompare(right.milestoneId));
}

function milestoneStatus({ conclusion, expectedWindow, cutoff }) {
  if (conclusion?.contradictingEvidenceRefs?.length) {
    return ForecastMilestoneStatus.CONTRADICTED;
  }
  if (conclusion?.supportingEvidenceRefs?.length) {
    return ForecastMilestoneStatus.SUPPORTED;
  }
  if (!expectedWindow.start && !expectedWindow.end) {
    return ForecastMilestoneStatus.TIMING_UNKNOWN;
  }
  if (!cutoff) return ForecastMilestoneStatus.TIMING_UNKNOWN;
  if (expectedWindow.start && compareDates(cutoff, expectedWindow.start) < 0) {
    return ForecastMilestoneStatus.PENDING;
  }
  if (expectedWindow.end && compareDates(cutoff, expectedWindow.end) > 0) {
    return ForecastMilestoneStatus.OVERDUE_UNRESOLVED;
  }
  return ForecastMilestoneStatus.DUE_UNRESOLVED;
}

function normalizeWindow(timing = {}) {
  const value = timing.expectedDateOrWindow;
  if (typeof value === "string") {
    const date = dateOnly(value);
    return { start: date, end: date };
  }
  return {
    start: dateOnly(value?.start ?? value?.from),
    end: dateOnly(value?.end ?? value?.to ?? value?.start ?? value?.from),
  };
}
