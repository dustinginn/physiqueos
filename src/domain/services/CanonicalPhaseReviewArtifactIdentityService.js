export const CANONICAL_PHASE_REVIEW_ARTIFACT_IDENTITY_VERSION =
  "canonical_phase_review_artifact_identity_v1";

export function resolveCanonicalPhaseReviewArtifactIdentity({ store, artifact,
  authorization } = {}) {
  if (!store || typeof store !== "object" || !artifact || typeof artifact !== "object" ||
      !authorization || typeof authorization !== "object") {
    fail("trusted_context_missing", "Trusted Phase Review identity context is required.");
  }
  const review = artifact.briefing?.phaseReview;
  const dexa = artifact.briefing?.dexaEventNarrative;
  const photo = artifact.briefing?.photoEventNarrative;
  const generic = artifact.briefing;
  const authorizationGoal = candidate("authorization.goalId", authorization.goalId);
  if (!authorizationGoal) {
    fail("goal_identity_unresolved", "Trusted authorization Goal identity is missing.");
  }
  const goalId = resolveIdentity("goal", [
    authorizationGoal,
    candidate("artifact.goalId", artifact.goalId),
    candidate("phaseReview.actionRequest.goalId", review?.actionRequest?.goalId),
    candidate("dexa.context.activeGoal.id", dexa?.context?.activeGoal?.id),
    candidate("dexa.context.activePhase.reviewMilestone.goalId",
      dexa?.context?.activePhase?.reviewMilestone?.goalId),
    candidate("dexa.goalConfidence.assessmentContext.goalId",
      dexa?.goalConfidence?.assessmentContext?.goalId),
    candidate("photo.goalContext.activeGoal.id", photo?.goalContext?.activeGoal?.id),
    candidate("briefing.activeGoal.id", generic?.activeGoal?.id),
  ]);
  const authorizationPhase = candidate("authorization.currentPhaseId",
    authorization.currentPhaseId);
  if (!authorizationPhase) {
    fail("phase_identity_unresolved", "Trusted authorization phase identity is missing.");
  }
  const phaseId = resolveIdentity("phase", [
    authorizationPhase,
    candidate("artifact.phaseId", artifact.phaseId),
    candidate("phaseReview.actionRequest.currentPhaseId", review?.actionRequest?.currentPhaseId),
    candidate("phaseReview.currentPhase.id", review?.currentPhase?.id),
    candidate("dexa.context.activePhase.id", dexa?.context?.activePhase?.id),
    candidate("dexa.context.activePhase.reviewMilestone.phaseId",
      dexa?.context?.activePhase?.reviewMilestone?.phaseId),
    candidate("dexa.goalConfidence.assessmentContext.phaseId",
      dexa?.goalConfidence?.assessmentContext?.phaseId),
    candidate("photo.goalContext.activePhase.id", photo?.goalContext?.activePhase?.id),
    candidate("briefing.activePhase.id", generic?.activePhase?.id),
  ]);
  const goal = (store.goals ?? []).find((item) => item.id === goalId);
  if (!goal) fail("goal_binding_mismatch", "Resolved Phase Review Goal does not exist.");
  const phase = goal.phases?.find((item) => item.id === phaseId);
  if (!phase) {
    fail("phase_binding_mismatch", "Resolved Phase Review phase does not belong to the Goal.");
  }
  if (phase.goalId != null && phase.goalId !== goal.id) {
    fail("goal_binding_mismatch", "Resolved phase contradicts its Goal ownership.");
  }
  if (goal.currentPhaseId != null && goal.currentPhaseId !== phase.id) {
    fail("phase_binding_mismatch", "Resolved phase is not the Goal's current review phase.");
  }
  return deepFreeze({ schemaVersion: CANONICAL_PHASE_REVIEW_ARTIFACT_IDENTITY_VERSION,
    goalId, phaseId });
}

function candidate(source, value) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    fail("trusted_context_malformed",
      "Trusted Phase Review identity at " + source + " is malformed.");
  }
  return { source, value: value.trim() };
}

function resolveIdentity(kind, candidates) {
  const present = candidates.filter(Boolean);
  if (!present.length) {
    fail(kind + "_identity_unresolved",
      "Trusted Phase Review " + kind + " identity is missing.");
  }
  const identities = new Set(present.map((item) => item.value));
  if (identities.size !== 1) {
    fail(kind + "_binding_mismatch",
      "Trusted Phase Review " + kind + " identities disagree.");
  }
  return present[0].value;
}

function fail(reason, message) {
  const error = new Error(message);
  error.code = "PHASE_REVIEW_ARTIFACT_INELIGIBLE";
  error.reason = reason;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
