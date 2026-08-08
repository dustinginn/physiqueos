export function resolvePhaseReviewArtifactRead({ artifact, decisionHistory = [] } = {}) {
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
  return active ? Object.freeze({ review, readOnly: false }) : null;
}
