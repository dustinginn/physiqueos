export const GOAL_TRANSITION_PREVIEW_SECTIONS = [
  "completion",
  "objective",
  "guardrails",
  "evidence",
  "operating",
  "strategy",
  "commitments",
  "cadence",
  "supporting",
  "review",
];

export function resolveGoalTransitionPreviewSection(params = {}) {
  const requested = first(params.section) || first(params.returnSection);
  return GOAL_TRANSITION_PREVIEW_SECTIONS.includes(requested) ? requested : "completion";
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
