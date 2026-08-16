import { createPhaseReviewMilestone, isPhaseReviewMilestone } from
  "../models/phaseReviewMilestone";

export const CANONICAL_PHASE_REVIEW_MUTATION_BASELINE_VERSION =
  "canonical_phase_review_mutation_baseline_v1";

export function createCanonicalPhaseReviewMutationBaseline({ store, request } = {}) {
  if (!store || typeof store !== "object" || !request?.originatingArtifactId) {
    fail("trusted_context_missing", "Persisted Phase Review context is required.");
  }
  const baseline = structuredClone(store);
  if (hasReplay(baseline, request)) {
    return deepFreeze({ store: baseline, hydrated: false, replay: true, milestone: null });
  }
  const artifact = [...(baseline.dailyBriefings ?? []),
    ...(baseline.confidenceInitializationArtifacts ?? [])]
    .find((item) => item.id === request.originatingArtifactId);
  const authorization = artifact?.phaseReviewAuthorization;
  const binding = artifact?.phaseReviewEligibilityBinding;
  if (!artifact || !authorization || authorization.eligible !== true || !binding) {
    fail("trusted_context_missing", "Trusted Phase Review artifact context is incomplete.");
  }
  requiredSame(binding.artifactIdentity, artifact.id, "artifact_binding_mismatch");
  requiredSame(authorization.goalId, artifact.goalId, "goal_binding_mismatch");
  requiredSame(authorization.currentPhaseId, artifact.phaseId, "phase_binding_mismatch");
  requiredSame(authorization.designatedArtifactType, binding.artifactType,
    "artifact_type_mismatch");
  optionalSame(authorization.designatedArtifactIdentity, artifact.id,
    "artifact_binding_mismatch");
  optionalSame(authorization.designatedEvidenceIdentity, binding.evidenceIdentity,
    "evidence_binding_mismatch");

  const goal = (baseline.goals ?? []).find((item) => item.id === authorization.goalId);
  const phase = goal?.phases?.find((item) => item.id === authorization.currentPhaseId);
  if (!goal || !phase || !authorization.milestoneId || !authorization.unresolvedReviewId) {
    fail("trusted_context_missing", "Trusted Goal, phase, or milestone context is missing.");
  }
  const presentation = artifact.briefing?.phaseReview;
  optionalSame(presentation?.milestoneId, authorization.milestoneId,
    "milestone_binding_mismatch");
  optionalSame(presentation?.unresolvedReviewId, authorization.unresolvedReviewId,
    "unresolved_review_mismatch");

  const raw = phase.reviewMilestone;
  if (isPhaseReviewMilestone(raw)) {
    const milestone = createPhaseReviewMilestone(raw);
    validateCanonicalScope({ milestone, authorization, binding, artifact, goal, phase });
    return deepFreeze({ store: baseline, hydrated: false, replay: false, milestone });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      typeof raw.type !== "string" || !raw.type.trim()) {
    fail("legacy_milestone_malformed", "Legacy Phase Review milestone is malformed.");
  }
  optionalSame(raw.goalId ?? raw.GoalId, goal.id, "goal_binding_mismatch");
  optionalSame(raw.phaseId, phase.id, "phase_binding_mismatch");
  optionalSame(raw.milestoneId, authorization.milestoneId, "milestone_binding_mismatch");
  optionalSame(raw.unresolvedReviewId, authorization.unresolvedReviewId,
    "unresolved_review_mismatch");
  optionalSame(raw.designatedArtifactIdentity,
    authorization.designatedArtifactIdentity ?? null, "artifact_binding_mismatch");
  optionalSame(raw.designatedEvidenceIdentity,
    authorization.designatedEvidenceIdentity ?? null, "evidence_binding_mismatch");
  if (raw.eligibleArtifactTypes != null &&
      (!Array.isArray(raw.eligibleArtifactTypes) ||
       !raw.eligibleArtifactTypes.includes(binding.artifactType))) {
    fail("artifact_type_mismatch", "Legacy milestone contradicts the trusted artifact type.");
  }
  if ((raw.requiredEvidence != null && !Array.isArray(raw.requiredEvidence)) ||
      (raw.lineage != null && !Array.isArray(raw.lineage))) {
    fail("legacy_milestone_malformed", "Legacy milestone collections are malformed.");
  }
  if ((raw.reviewRequired != null &&
       raw.reviewRequired !== (authorization.reviewRequired === true)) ||
      (raw.decisionRequired != null &&
       raw.decisionRequired !== (phase.completionDecisionRequired !== false)) ||
      (raw.recommendationRequired != null && raw.recommendationRequired !== true) ||
      raw.consumed === true || raw.resolvedReviewId != null) {
    fail("milestone_state_mismatch",
      "Legacy milestone lifecycle state contradicts the unresolved authorization.");
  }

  const dates = [raw.plannedAt, raw.originatingMilestoneAt, raw.earliestEligibleDate,
    phase.plannedReviewAt]
    .filter((value) => value != null);
  if (dates.length < 1 || dates.some((value) => !isDate(value)) ||
      new Set(dates).size !== 1) {
    fail("milestone_date_mismatch", "Legacy milestone date does not match the active phase review.");
  }
  const revision = raw.revision == null ? 0 : Number(raw.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    fail("milestone_revision_invalid", "Legacy milestone revision is invalid.");
  }
  const milestone = createPhaseReviewMilestone({
    milestoneId: authorization.milestoneId,
    goalId: goal.id,
    phaseId: phase.id,
    milestoneType: raw.milestoneType ?? "planned_phase_review",
    reviewType: raw.reviewType ?? "phase_completion_review",
    requiredEvidence: Array.isArray(raw.requiredEvidence) ? raw.requiredEvidence : [],
    eligibleArtifactTypes: Array.isArray(raw.eligibleArtifactTypes)
      ? raw.eligibleArtifactTypes : [binding.artifactType],
    designatedArtifactIdentity: authorization.designatedArtifactIdentity ?? null,
    designatedEvidenceIdentity: authorization.designatedEvidenceIdentity ?? null,
    earliestEligibleDate: dates[0],
    latestEligibleDate: raw.latestEligibleDate ?? null,
    earlyReviewPolicy: raw.earlyReviewPolicy ?? "prohibited",
    reviewRequired: authorization.reviewRequired === true,
    unresolvedReviewId: authorization.unresolvedReviewId,
    resolvedReviewId: null,
    decisionRequired: phase.completionDecisionRequired !== false,
    recommendationRequired: true,
    consumed: false,
    lineage: Array.isArray(raw.lineage) ? raw.lineage : [{
      type: "canonical_phase_review_mutation_projection",
      id: `${CANONICAL_PHASE_REVIEW_MUTATION_BASELINE_VERSION}|${artifact.id}`,
    }],
    revision,
  });
  validateCanonicalScope({ milestone, authorization, binding, artifact, goal, phase });
  phase.reviewMilestone = structuredClone(milestone);
  return deepFreeze({ store: baseline, hydrated: true, replay: false, milestone });
}

function validateCanonicalScope({ milestone, authorization, binding, artifact, goal, phase }) {
  requiredSame(milestone.goalId, goal.id, "goal_binding_mismatch");
  requiredSame(milestone.phaseId, phase.id, "phase_binding_mismatch");
  requiredSame(milestone.milestoneId, authorization.milestoneId,
    "milestone_binding_mismatch");
  requiredSame(milestone.unresolvedReviewId, authorization.unresolvedReviewId,
    "unresolved_review_mismatch");
  if (!milestone.eligibleArtifactTypes.includes(binding.artifactType)) {
    fail("artifact_type_mismatch", "Canonical milestone excludes the trusted artifact type.");
  }
  optionalSame(milestone.designatedArtifactIdentity,
    authorization.designatedArtifactIdentity ?? null, "artifact_binding_mismatch");
  optionalSame(milestone.designatedEvidenceIdentity,
    authorization.designatedEvidenceIdentity ?? null, "evidence_binding_mismatch");
  optionalSame(milestone.designatedArtifactIdentity, artifact.id,
    "artifact_binding_mismatch", true);
  optionalSame(milestone.designatedEvidenceIdentity, binding.evidenceIdentity,
    "evidence_binding_mismatch", true);
}

function hasReplay(store, request) {
  return (store.phaseReviewDecisions ?? []).some((item) =>
    item.decisionId === request.decisionId || item.idempotencyKey === request.idempotencyKey);
}
function requiredSame(actual, expected, reason) {
  if (actual == null || expected == null || actual !== expected) {
    fail(reason, "Trusted Phase Review identities do not match.");
  }
}
function optionalSame(actual, expected, reason, expectedMayBeNull = false) {
  if (actual == null) return;
  if ((!expectedMayBeNull && expected == null) || actual !== expected) {
    fail(reason, "Phase Review milestone context is contradictory.");
  }
}
function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
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
