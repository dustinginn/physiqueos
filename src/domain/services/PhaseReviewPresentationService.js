export const PHASE_REVIEW_RECOMMENDATIONS = Object.freeze({
  BEGIN_NEXT_PHASE: "begin_next_phase",
  CONTINUE_CURRENT_PHASE: "continue_current_phase",
});

export function projectPhaseReviewSelection(review, selection = {}) {
  if (!review || !Object.values(PHASE_REVIEW_RECOMMENDATIONS).includes(review.recommendation)) {
    throw new Error("Phase Review projection requires a canonical presentation contract.");
  }
  const selectedOutcome = selection.selectedOutcome ?? review.recommendation;
  if (selectedOutcome === PHASE_REVIEW_RECOMMENDATIONS.BEGIN_NEXT_PHASE) {
    return Object.freeze({
      selectedOutcome,
      selectedDurationDays: null,
      customReviewDate: null,
      recommendedReviewDate: review.originalReviewDate,
      selectedReviewDate: review.originalReviewDate,
      projectedNextPhaseStart: review.originalReviewDate,
      projectedNextPhaseReview: addDays(review.originalReviewDate,
        review.nextPhaseReviewIntervalDays),
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
    selectedOutcome,
    selectedDurationDays: custom ? null : selectedDuration,
    customReviewDate: custom ? selectedReviewDate : null,
    recommendedReviewDate: shiftDate(review.originalReviewDate,
      review.recommendedDurationDays),
    selectedReviewDate,
    projectedNextPhaseStart: selectedReviewDate,
    projectedNextPhaseReview: addDays(selectedReviewDate,
      review.nextPhaseReviewIntervalDays),
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
  if (!isDate(value) || !Number.isInteger(days) || days < 1) {
    throw new Error("Phase Review projection dates are invalid.");
  }
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}
