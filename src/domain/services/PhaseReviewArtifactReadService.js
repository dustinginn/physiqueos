import { deriveGoalAwarePhaseReviewInputs, evaluateGoalAwarePhaseReview } from
  "./GoalAwarePhaseReviewRecommendationService";

export function resolvePhaseReviewArtifactRead({ artifact, decisionHistory = [], store = null,
  asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const review = artifact?.briefing?.phaseReview;
  if (!review || review.previewOnly !== false) return null;
  const decision = decisionHistory.find((item) =>
    item.unresolvedReviewId === review.unresolvedReviewId ||
    item.milestoneId === review.milestoneId) ?? null;
  if (decision) return Object.freeze({ review: Object.freeze({ ...structuredClone(review),
    eligible: false, unresolved: false, actionRequest: null,
    recordedDecision: structuredClone(decision) }), readOnly: true });
  const authorization = artifact.phaseReviewAuthorization;
  const request = review.actionRequest;
  const identitiesMatch = authorization?.milestoneId === review.milestoneId &&
    authorization?.unresolvedReviewId === review.unresolvedReviewId &&
    request?.milestoneId === review.milestoneId &&
    request?.unresolvedReviewId === review.unresolvedReviewId;
  const active = review.eligible === true && review.unresolved === true &&
    authorization?.eligible === true && authorization?.consumed !== true &&
    identitiesMatch;
  if (!active) return null;
  if (!store) return Object.freeze({ review, readOnly: false });
  const goal = (store.goals ?? []).find((item) => item.id === authorization.goalId);
  const phase = goal?.phases?.find((item) => item.id === authorization.currentPhaseId);
  const nextPhase = goal?.phases?.find((item) => Number(item.order) === Number(phase?.order) + 1) ?? null;
  const evidenceId = artifact.trigger?.scanId ?? artifact.trigger?.evidenceId ??
    artifact.phaseReviewEligibilityBinding?.evidenceIdentity ?? null;
  const canonicalScan = (store.dexaScans ?? []).find((item) => item.id === evidenceId) ?? null;
  const recommendation = evaluateGoalAwarePhaseReview(deriveGoalAwarePhaseReviewInputs({
    goal, phase, nextPhase, artifact, canonicalScan, extensionDays: review.recommendedDurationDays,
    asOf,
  }));
  const currentReview = {
    ...structuredClone(review),
    schemaVersion: "phase_review_presentation_v2",
    recommendation: recommendation.presentationRecommendation,
    recommendationLabel: recommendation.recommendation === "begin_next_phase"
      ? `Begin ${review.nextPhase?.name ?? "Next Phase"}`
      : `Continue ${review.currentPhase?.name ?? "Current Phase"}`,
    explanation: recommendation.explanation,
    originalRecommendation: review.recommendation,
    originalExplanation: review.explanation,
    currentRecommendation: recommendation,
    actionRequest: {
      ...structuredClone(request),
      expectedStoreRevision: Number(store.revision ?? 0),
      recommendationFingerprint: recommendation.fingerprint,
    },
  };
  return Object.freeze({ review: deepFreeze(currentReview), readOnly: false });
}

function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
