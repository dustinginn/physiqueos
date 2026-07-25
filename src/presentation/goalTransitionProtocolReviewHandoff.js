export const GOAL_TRANSITION_PROTOCOL_REVIEW_ROUTE = "/preview/goals/transition/protocols";
export const GOAL_TRANSITION_REVIEW_RETURN_ROUTE = "/preview/goals/transition?section=review";

export function buildGoalTransitionProtocolReviewHandoff(
  draft,
  { returnRoute = GOAL_TRANSITION_REVIEW_RETURN_ROUTE } = {}
) {
  if (!draft?.id || !draft?.sourceGoalId || !draft?.primaryObjective) {
    throw new Error("A complete goal transition draft is required for protocol review.");
  }

  return {
    destination: GOAL_TRANSITION_PROTOCOL_REVIEW_ROUTE,
    transitionDraftId: draft.id,
    completedSourceGoalId: draft.sourceGoalId,
    newGoalDraftId: draft.primaryObjective.id,
    acceptedNextGoalDefinition: structuredClone(draft.primaryObjective),
    primaryGoal: structuredClone(draft.primaryObjective),
    guardrails: structuredClone(draft.guardrails),
    progressMeasurement: structuredClone(draft.evidenceStrategy),
    calibrationState: structuredClone(draft.operatingState),
    supportingObjectives: structuredClone(draft.supportingObjectives),
    briefingCadence: structuredClone(draft.briefingCadence),
    openingEvidenceBaseline: structuredClone(draft.openingBaseline),
    inheritedProtocolReferences: draft.protocolReviews.map((review) => ({
      reviewId: review.id,
      protocolId: review.protocolId,
      sourceVersionId: review.sourceVersionId,
      protocolType: review.protocolType,
    })),
    intendedProtocolDispositions: draft.protocolReviews.map((review) => ({
      reviewId: review.id,
      protocolId: review.protocolId,
      disposition: review.selectedDisposition,
      proposedChanges: structuredClone(review.proposedChanges),
    })),
    returnRoute,
  };
}
