import { notFound } from "next/navigation";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";
import PhaseReviewCard from "../../../../components/goals/PhaseReviewCard";
import { submitProductionPhaseReviewDecision } from "./actions";
import { getProductionBriefingNavigationReadService } from "../../../../application/composition/productionApplicationComposition";
import { resolvePhaseReviewArtifactRead } from
  "../../../../domain/services/PhaseReviewArtifactReadService";
import { projectDEXAEventNarrativePresentation } from
  "../../../../domain/services/DEXAEventNarrativePresentationService";

export const dynamic = "force-dynamic";
export default async function DEXAEventPage({ params }) {
  const { scanId } = await params;
  const context = await getProductionBriefingNavigationReadService().getDexaArtifact({ scanId });
  const { artifact } = context;
  if (!artifact) notFound();
  const store = { goals: context.goals, dexaScans: context.dexaScans, revision: context.revision };
  const phaseReviewRead = resolvePhaseReviewArtifactRead({ artifact, store,
    decisionHistory: context.phaseReviewDecisions });
  return <DEXAEventBriefingScreen
    narrative={projectDEXAEventNarrativePresentation(artifact.briefing.dexaEventNarrative)}
    phaseReview={phaseReviewRead
      ? <PhaseReviewCard readOnly={phaseReviewRead.readOnly} review={phaseReviewRead.review}
          submitDecision={phaseReviewRead.readOnly ? null : submitProductionPhaseReviewDecision}/>
      : null}
  />;
}
