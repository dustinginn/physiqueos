import { notFound } from "next/navigation";
import ProtocolTransitionBuilderScreen from "../../../../../../screens/ProtocolTransitionBuilderScreen";
import { saveLiveTransitionProtocolDraft } from "../../actions";
import { loadLiveProtocolTransition } from "../../context";

export const dynamic = "force-dynamic";

export default async function LiveProtocolTransitionEditPage({ params, searchParams }) {
  const { category } = await params;
  const query = await searchParams;
  const { draft, handoff } = await loadLiveProtocolTransition();
  const review = draft.protocolReviews.find((item) => item.id === query.reviewId)
    ?? draft.protocolReviews.find((item) => item.category === category);
  if (!review) notFound();
  const protocolDraft = draft.protocolDrafts.find(
    (item) => item.reviewId === review.id
  ) ?? null;
  const route = "/goals/transition/protocols";
  const transitionContext = {
    goalTransitionDraftId: handoff.transitionDraftId,
    protocolTransitionDraftId: draft.id,
    pendingGoalDraftId: handoff.newGoalDraftId,
    sourceGoalId: handoff.completedSourceGoalId,
    sourceProtocolId: review.sourceProtocolId,
    sourceVersionId: review.sourceVersionId,
    sourceSnapshot: review.sourceSnapshot,
    selectedDisposition: review.intendedDisposition,
    acceptedPrimaryGoal: handoff.primaryGoal,
    guardrails: handoff.guardrails,
    calibrationState: handoff.calibrationState,
    supportingObjectives: handoff.supportingObjectives,
    openingBaseline: handoff.openingEvidenceBaseline,
    detailRoute: `${route}?section=protocols&protocol=${category}`,
    returnRoute: `${route}?section=protocols`,
  };
  const requestedStep = Number(query.step) || 1;
  return (
    <ProtocolTransitionBuilderScreen
      action={saveLiveTransitionProtocolDraft}
      initialStep={requestedStep >= 3 ? 2 : requestedStep}
      protocolDraft={protocolDraft}
      review={review}
      transitionContext={transitionContext}
    />
  );
}
