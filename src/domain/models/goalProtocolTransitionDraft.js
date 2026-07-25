export const GOAL_PROTOCOL_TRANSITION_STATUSES = ["draft", "ready", "applied", "abandoned"];
export const PROTOCOL_REVIEW_STATUSES = ["pending", "accepted", "editing", "reviewed", "blocked"];
export const PROTOCOL_DERIVATION_TYPES = ["cloned", "updated", "replaced", "new"];
export const PROTOCOL_DRAFT_STATUSES = ["draft", "valid", "ready", "discarded"];
export const PROTOCOL_TRANSITION_DISPOSITIONS = ["keep", "update", "replace", "pause", "leave_behind"];

export function stableGoalProtocolTransitionId(goalTransitionDraftId) {
  return `protocol_transition_${goalTransitionDraftId}`;
}

export function stableProtocolReviewId(transitionId, key) {
  return `${transitionId}_review_${normalizeKey(key)}`;
}

export function stablePreviewProtocolId(transitionId, reviewId, category, derivationType) {
  return `${transitionId}_preview_${normalizeKey(reviewId)}_${normalizeKey(category)}_${normalizeKey(derivationType)}`;
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
