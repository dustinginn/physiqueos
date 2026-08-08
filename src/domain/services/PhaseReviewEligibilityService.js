import { createPhaseReviewMilestone, PhaseReviewEarlyPolicy } from
  "../models/phaseReviewMilestone";
import { isActivePhaseStatus } from "../models/canonicalGoalPhase";

export const PHASE_REVIEW_ELIGIBILITY_VERSION = "phase_review_eligibility_v1";

export function evaluatePhaseReviewEligibility(input = {}) {
  let milestone;
  try { milestone = createPhaseReviewMilestone(input.reviewMilestone); }
  catch { return result(false, "milestone_invalid"); }
  const goal = input.activeGoal;
  const phase = input.activePhase;
  if (!goal?.id || milestone.goalId !== goal.id) return result(false, "goal_mismatch", milestone);
  if (!phase?.id || milestone.phaseId !== phase.id) return result(false, "phase_mismatch", milestone);
  if (!isActivePhaseStatus(phase.status)) return result(false, "phase_inactive", milestone);
  if (!milestone.reviewRequired || !milestone.decisionRequired) {
    return result(false, "review_not_required", milestone);
  }
  if (["not_required", "decision_committed"].includes(input.reviewState)) {
    return result(false, "review_state_ineligible", milestone);
  }
  if (milestone.consumed || milestone.resolvedReviewId ||
      isConsumed(input.decisionHistory, milestone)) {
    return result(false, "review_resolved", milestone);
  }
  if (!milestone.eligibleArtifactTypes.includes(input.artifactType)) {
    return result(false, "artifact_type_ineligible", milestone);
  }
  if (milestone.designatedArtifactIdentity &&
      milestone.designatedArtifactIdentity !== identity(input.currentArtifact)) {
    return result(false, "designated_artifact_mismatch", milestone);
  }
  if (milestone.designatedEvidenceIdentity &&
      milestone.designatedEvidenceIdentity !== input.evidenceIdentity) {
    return result(false, "designated_evidence_mismatch", milestone);
  }
  if (!requiredEvidencePresent(milestone.requiredEvidence, input)) {
    return result(false, "required_evidence_missing", milestone);
  }
  const artifactDate = dateKey(input.artifactTimestamp ?? input.publicationTimestamp);
  const currentDate = dateKey(input.currentDate ?? input.publicationTimestamp);
  if (!artifactDate || !currentDate) return result(false, "date_invalid", milestone);
  if (milestone.latestEligibleDate && artifactDate > milestone.latestEligibleDate) {
    return result(false, "eligibility_window_closed", milestone);
  }
  if (artifactDate < milestone.earliestEligibleDate) {
    return earlyResult(milestone, input);
  }
  return result(true, "milestone_eligible", milestone, true, true);
}

function earlyResult(milestone, input) {
  if (milestone.earlyReviewPolicy === PhaseReviewEarlyPolicy.ALLOWED) {
    return result(true, "early_review_allowed", milestone, true, true);
  }
  if (milestone.earlyReviewPolicy === PhaseReviewEarlyPolicy.RECOMMENDATION_ONLY) {
    return result(true, "early_recommendation_only", milestone, true, false);
  }
  if (milestone.earlyReviewPolicy === PhaseReviewEarlyPolicy.USER_INITIATED &&
      input.currentArtifact?.userInitiatedReview === true) {
    return result(true, "early_user_initiated", milestone, true, true);
  }
  if (milestone.earlyReviewPolicy === PhaseReviewEarlyPolicy.EVIDENCE_THRESHOLD &&
      input.currentArtifact?.evidenceThresholdSatisfied === true) {
    return result(true, "early_evidence_threshold_met", milestone, true, true);
  }
  return result(false, "before_earliest_eligible_date", milestone);
}
function requiredEvidencePresent(required, input) {
  if (!required.length) return true;
  const available = new Set([
    input.evidenceIdentity,
    ...(input.currentArtifact?.evidenceIdentities ?? []),
    ...(input.currentArtifact?.evidenceTypes ?? []),
  ].filter(Boolean));
  return required.every((entry) => available.has(typeof entry === "string"
    ? entry : entry.identity ?? entry.type));
}
function isConsumed(history = [], milestone) {
  return history.some((decision) => decision.unresolvedReviewId === milestone.unresolvedReviewId ||
    decision.milestoneId === milestone.milestoneId);
}
function identity(artifact) { return artifact?.id ?? artifact?.artifactId ?? null; }
function dateKey(value) {
  const raw = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw); return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10) : null;
}
function result(eligible, reason, milestone = null,
  recommendationAllowed = false, authorizationAllowed = false) {
  return Object.freeze({ schemaVersion: PHASE_REVIEW_ELIGIBILITY_VERSION,
    eligible, reason, recommendationAllowed, authorizationAllowed,
    unresolvedReviewId: milestone?.unresolvedReviewId ?? null,
    designatedReviewIdentity: milestone?.milestoneId ?? null,
    milestoneLineage: structuredClone(milestone?.lineage ?? []) });
}
