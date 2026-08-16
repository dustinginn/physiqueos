import { ForecastTimelinePhase } from "./ForecastRuntimeContract";
import { dateOnly } from "./forecastRuntimeUtils";

export function evaluateForecastTimeline(goalContract, structuredInterpretation) {
  const timeline = goalContract?.timeline ?? {};
  const startDate = dateOnly(timeline.startDate ?? timeline.activationDate);
  const targetDate = dateOnly(timeline.targetCompletionDate ?? timeline.targetDate);
  const cutoff = dateOnly(structuredInterpretation?.evaluationContext?.evidenceCutoff);
  const phase = classifyPhase(startDate, targetDate, cutoff);
  const constraintType = normalizeConstraint(timeline.constraintType ?? timeline.flexibility);
  const totalDays = daysBetween(startDate, targetDate);
  const elapsedDays = phase === ForecastTimelinePhase.NOT_STARTED ? 0 :
    boundedDays(startDate, cutoff, totalDays);
  const remainingDays = phase === ForecastTimelinePhase.OVERDUE ? 0 :
    boundedDays(cutoff, targetDate, totalDays);
  return {
    startDate,
    targetCompletionDate: targetDate,
    evidenceCutoff: cutoff,
    phase,
    constraintType,
    totalDays,
    elapsedDays,
    remainingDays,
    elapsedFraction: fraction(elapsedDays, totalDays),
    remainingFraction: fraction(remainingDays, totalDays),
    remainingWindow: phase === ForecastTimelinePhase.OVERDUE
      ? "expired" : targetDate && cutoff ? "open" : "unknown",
    rationale: `timeline_${phase}`,
  };
}

function normalizeConstraint(value) {
  return ["firm", "adaptive", "aspirational", "review_only"].includes(value)
    ? value : "unknown";
}
function daysBetween(start, end) {
  if (!start || !end) return null;
  const value = Math.round((Date.parse(`${end}T00:00:00.000Z`) -
    Date.parse(`${start}T00:00:00.000Z`)) / 86400000);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function boundedDays(start, end, total) {
  const value = daysBetween(start, end);
  return value == null || total == null ? null : Math.min(total, Math.max(0, value));
}
function fraction(value, total) {
  return value == null || !Number.isFinite(total) || total <= 0 ? null :
    Number((value / total).toFixed(6));
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
