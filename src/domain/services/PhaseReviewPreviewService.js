import { resolvePhaseTransitionDate } from "./PhaseTransitionDatePolicy";

export const PHASE_REVIEW_PREVIEW_VERSION = "phase_review_preview_v1";
export const PHASE_REVIEW_RECOMMENDATIONS = Object.freeze({
  BEGIN_NEXT_PHASE: "begin_next_phase",
  CONTINUE_CURRENT_PHASE: "continue_current_phase",
});

export function createPhaseReviewPreview({
  recommendation,
  recommendationLabel,
  explanation,
  currentPhase,
  nextPhase,
  originalReviewDate,
  recommendedDurationDays = 14,
  nextPhaseReviewIntervalDays = 28,
  reasoningLineage = [],
  decisionSource = "pi_phase_review_recommendation",
} = {}) {
  if (!Object.values(PHASE_REVIEW_RECOMMENDATIONS).includes(recommendation)) {
    throw new Error("Phase Review preview requires a supported recommendation.");
  }
  if (!recommendationLabel || !currentPhase?.name || !isDate(originalReviewDate)) {
    throw new Error("Phase Review preview requires its recommendation, current phase, and original review date.");
  }
  if (sentenceCount(explanation) > 2) {
    throw new Error("Phase Review explanation must contain no more than two sentences.");
  }
  if (recommendation === PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE && !nextPhase?.name) {
    throw new Error("Beginning a phase requires the next phase presentation.");
  }
  if (![7, 14, 21].includes(recommendedDurationDays)) {
    throw new Error("Phase Review requires a supported extension recommendation.");
  }
  if (!Number.isInteger(nextPhaseReviewIntervalDays) || nextPhaseReviewIntervalDays < 1) {
    throw new Error("Phase Review requires a future next-phase review interval.");
  }
  return deepFreeze({
    schemaVersion: PHASE_REVIEW_PREVIEW_VERSION,
    previewOnly: true,
    recommendation,
    recommendationLabel,
    explanation,
    currentPhase: { id: currentPhase.id ?? null, name: currentPhase.name,
      shortName: currentPhase.shortName ?? currentPhase.name },
    nextPhase: nextPhase ? { id: nextPhase.id ?? null, name: nextPhase.name,
      shortName: nextPhase.shortName ?? nextPhase.name } : null,
    originalReviewDate,
    recommendedDurationDays,
    nextPhaseReviewIntervalDays,
    durationOptions: [7, 14, 21, "custom"],
    reasoningLineage: [...reasoningLineage],
    decisionSource,
    persistence: "none_preview_only",
  });
}

export function projectPhaseReviewSelection(review, selection = {}) {
  if (review?.schemaVersion !== PHASE_REVIEW_PREVIEW_VERSION || review.previewOnly !== true) {
    throw new Error("Phase Review projection requires a preview-only review contract.");
  }
  const selectedOutcome = selection.selectedOutcome ?? review.recommendation;
  if (selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE) {
    const transition = resolvePhaseTransitionDate({ reviewMilestoneDate: review.originalReviewDate });
    return Object.freeze({
      selectedOutcome: "begin_next_phase",
      selectedDurationDays: null,
      customReviewDate: null,
      recommendedReviewDate: review.originalReviewDate,
      selectedReviewDate: review.originalReviewDate,
      projectedNextPhaseStart: transition.effectiveDate,
      projectedNextPhaseReview: addDays(
        transition.effectiveDate,
        review.nextPhaseReviewIntervalDays
      ),
    });
  }
  if (selectedOutcome !== PHASE_REVIEW_RECOMMENDATIONS.CONTINUE_CURRENT_PHASE) {
    throw new Error("Phase Review selection requires a supported decision.");
  }
  const selectedDuration = selection.durationDays ?? review.recommendedDurationDays;
  const custom = selectedDuration === "custom";
  const selectedReviewDate = custom
    ? requireFutureDate(selection.customReviewDate, review.originalReviewDate)
    : shiftDate(review.originalReviewDate, selectedDuration);
  return Object.freeze({
    selectedOutcome: "continue_current_phase",
    selectedDurationDays: custom ? null : selectedDuration,
    customReviewDate: custom ? selectedReviewDate : null,
    recommendedReviewDate: shiftDate(review.originalReviewDate, review.recommendedDurationDays),
    selectedReviewDate,
    projectedNextPhaseStart: selectedReviewDate,
    projectedNextPhaseReview: addDays(
      selectedReviewDate,
      review.nextPhaseReviewIntervalDays
    ),
  });
}

function requireFutureDate(value, originalReviewDate) {
  if (!isDate(value) || value <= originalReviewDate) {
    throw new Error("Custom review date must be after the original review date.");
  }
  return value;
}

function shiftDate(value, days) {
  if (![7, 14, 21].includes(days)) throw new Error("Unsupported Phase Review duration.");
  return addDays(value, days);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sentenceCount(value) {
  return String(value ?? "").split(/[.!?]+/u).filter((part) => part.trim()).length;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
