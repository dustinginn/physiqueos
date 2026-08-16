export const PhaseTransitionDatePolicy = Object.freeze({
  REVIEW_MILESTONE_BOUNDARY: "review_milestone_boundary",
});

export function resolvePhaseTransitionDate({
  policy = PhaseTransitionDatePolicy.REVIEW_MILESTONE_BOUNDARY,
  reviewMilestoneDate,
} = {}) {
  if (policy !== PhaseTransitionDatePolicy.REVIEW_MILESTONE_BOUNDARY) {
    throw new Error("Unsupported phase-transition date policy.");
  }
  if (!isDate(reviewMilestoneDate)) {
    throw new Error("The phase-transition review milestone date is required.");
  }
  return Object.freeze({
    policy,
    effectiveDate: reviewMilestoneDate,
    rule: "review_milestone_boundary",
  });
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
