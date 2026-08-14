import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDEXAEventNarrativeService } from "../../../../domain/services/DEXAEventNarrativeService";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";
import PhaseReviewCard from "../../../../components/goals/PhaseReviewCard";
import { submitProductionPhaseReviewDecision } from "./actions";
import { loadApplicationCanonicalRuntime } from "../../../../application/runtime/ApplicationCanonicalRuntime";
import { resolvePhaseReviewArtifactRead } from
  "../../../../domain/services/PhaseReviewArtifactReadService";

export const dynamic = "force-dynamic";
export default async function DEXAEventPage({ params }) {
  const { scanId } = await params;
  const user = await FounderRepositories.users.getCurrentUser();
  const artifact = await createDEXAEventNarrativeService({ repositories: FounderRepositories })
    .getByScanId({ userId: user.id, scanId });
  if (!artifact) notFound();
  const phaseReviewRead = resolvePhaseReviewArtifactRead({ artifact,
    decisionHistory: (await loadApplicationCanonicalRuntime()).phaseReviewDecisions ?? [] });
  return <DEXAEventBriefingScreen
    narrative={artifact.briefing.dexaEventNarrative}
    phaseReview={phaseReviewRead
      ? <PhaseReviewCard readOnly={phaseReviewRead.readOnly} review={phaseReviewRead.review}
          submitDecision={phaseReviewRead.readOnly ? null : submitProductionPhaseReviewDecision}/>
      : null}
  />;
}
