import { ForecastTimelinePhase } from "./ForecastRuntimeContract";
import { dateOnly } from "./forecastRuntimeUtils";

export function evaluateForecastTimeline(goalContract, structuredInterpretation) {
  const timeline = goalContract?.timeline ?? {};
  const startDate = dateOnly(timeline.startDate ?? timeline.activationDate);
  const targetDate = dateOnly(timeline.targetCompletionDate ?? timeline.targetDate);
  const cutoff = dateOnly(structuredInterpretation?.evaluationContext?.evidenceCutoff);
  const phase = classifyPhase(startDate, targetDate, cutoff);
  return {
    startDate,
    targetCompletionDate: targetDate,
    evidenceCutoff: cutoff,
    phase,
    remainingWindow: phase === ForecastTimelinePhase.OVERDUE
      ? "expired" : targetDate && cutoff ? "open" : "unknown",
    rationale: `timeline_${phase}`,
  };
}

function classifyPhase(startDate, targetDate, cutoff) {
  if (!startDate || !targetDate || !cutoff) return ForecastTimelinePhase.UNKNOWN;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const target = Date.parse(`${targetDate}T00:00:00.000Z`);
  const at = Date.parse(`${cutoff}T00:00:00.000Z`);
  if (![start, target, at].every(Number.isFinite) || target <= start) {
    return ForecastTimelinePhase.UNKNOWN;
  }
  if (at < start) return ForecastTimelinePhase.NOT_STARTED;
  if (at > target) return ForecastTimelinePhase.OVERDUE;
  return ForecastTimelinePhase.ACTIVE;
}
