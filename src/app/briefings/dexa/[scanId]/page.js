import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDEXAEventNarrativeService } from "../../../../domain/services/DEXAEventNarrativeService";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";
import PhaseReviewCard from "../../../../components/goals/PhaseReviewCard";
import { submitProductionPhaseReviewDecision } from "./actions";
import { loadApplicationCanonicalRuntime } from "../../../../application/runtime/ApplicationCanonicalRuntime";
import { resolvePhaseReviewArtifactRead } from
  "../../../../domain/services/PhaseReviewArtifactReadService";
import { projectDEXAEventNarrativePresentation } from
  "../../../../domain/services/DEXAEventNarrativePresentationService";

export const dynamic = "force-dynamic";
export default async function DEXAEventPage({ params }) {
  const { scanId } = await params;
  const user = await FounderRepositories.users.getCurrentUser();
  const artifact = await createDEXAEventNarrativeService({ repositories: FounderRepositories })
    .getByScanId({ userId: user.id, scanId });
  if (!artifact) notFound();
  const store = await loadApplicationCanonicalRuntime();
  const phaseReviewRead = resolvePhaseReviewArtifactRead({ artifact, store,
    decisionHistory: store.phaseReviewDecisions ?? [] });
  return <DEXAEventBriefingScreen
    narrative={projectDEXAEventNarrativePresentation(artifact.briefing.dexaEventNarrative)}
    phaseReview={phaseReviewRead
      ? <PhaseReviewCard readOnly={phaseReviewRead.readOnly} review={phaseReviewRead.review}
          submitDecision={phaseReviewRead.readOnly ? null : submitProductionPhaseReviewDecision}/>
      : null}
  />;
}
