export const GOAL_TRANSITION_STATUSES = ["draft", "ready", "applied", "abandoned"];
export const GOAL_OPERATING_STATES = ["calibration", "active", "adapting"];
export const PROTOCOL_DISPOSITIONS = ["keep", "modify", "replace", "pause", "remove"];
export const PROTOCOL_EDIT_STATUSES = ["unchanged", "review_required", "draft_changes", "reviewed"];
export const BRIEFING_CADENCES = ["daily", "twice_weekly", "weekly", "custom"];

export function stableTransitionId(sourceGoalId) {
  return `goal_transition_${sourceGoalId}`;
}

export function stableNestedId(draftId, kind, key) {
  return `${draftId}_${kind}_${String(key).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}
