import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../../domain/services/DailyBriefingService";
import BriefingReviewScreen from "../../../../screens/BriefingReviewScreen";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";
import WeeklyBriefingScreen from "../../../../screens/WeeklyBriefingScreen";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";
import MidweekBriefingScreen from "../../../../screens/MidweekBriefingScreen";
import MonthlyBriefingScreen from "../../../../screens/MonthlyBriefingScreen";
import { prepareWeeklyBriefingReviewPresentation } from "../../../../domain/services/WeeklyBriefingReviewPresentationService";
import { prepareMidweekBriefingReviewPresentation } from "../../../../domain/services/MidweekBriefingPresentationService";
import PhaseReviewCard from "../../../../components/goals/PhaseReviewCard";
import { getProductionBriefingNavigationReadService } from "../../../../application/composition/productionApplicationComposition";
import { resolvePhaseReviewArtifactRead } from
  "../../../../domain/services/PhaseReviewArtifactReadService";
import { resolveWeeklyBriefingPhaseBoundary } from
  "../../../../domain/services/WeeklyBriefingPhaseBoundaryReadService";
import { projectConfidenceExplanationForSurface } from
  "../../../../domain/presentation/confidenceExplanationPresentation";

export const dynamic = "force-dynamic";

export default async function BriefingReviewPage({ params, searchParams }) {
  const { artifactId } = await params;
  const query = await searchParams;
  const { artifact, user, goals, phaseReviewDecisions, confidenceAssessment } = await getProductionBriefingNavigationReadService()
    .getArtifact({ artifactId, version: query.version ?? null });
  if (!artifact) notFound();
  const preview = query.preview === "1"
    ? await createDailyBriefingService({ repositories: FounderRepositories }).previewBriefingArtifact(artifact)
    : null;
  if (artifact.briefing?.photoEventNarrative) {
    const narrative = artifact.briefing.photoEventNarrative;
    return <PhotoEventBriefingScreen narrative={{...narrative,
      goalConfidence: projectConfidenceExplanationForSurface(
        narrative.goalConfidence,
        { assessment: confidenceAssessment, surface: "photo_event",
          historicalContext: {
            matchedOnly: artifact.confidencePublication?.confidenceMode === "matched-only",
            eventDate: narrative.eventDate ?? artifact.evidenceCutoff,
          } }
      )}}/>;
  }
  if (artifact.briefing?.dexaEventNarrative) {
    const review = resolvePhaseReviewArtifactRead({ artifact,
      decisionHistory: phaseReviewDecisions });
    const narrative = artifact.briefing.dexaEventNarrative;
    return <DEXAEventBriefingScreen narrative={{...narrative,
      goalConfidence: projectConfidenceExplanationForSurface(
        narrative.goalConfidence,
        { assessment: confidenceAssessment, surface: "dexa_event",
          historicalContext: { eventDate: narrative.snapshot?.scanDate ?? artifact.evidenceCutoff } }
      )}}
      phaseReview={review?.readOnly
        ? <PhaseReviewCard readOnly review={review.review}/> : null}/>;
  }
  if (artifact.briefing?.weeklyNarrative) {
    const weeklyGoalId = artifact.briefing.weeklyNarrative.context?.activeGoal?.id ??
      artifact.briefing.weeklyNarrative.context?.activeGoalSummary?.id ?? null;
    const weeklyGoal = goals.find((item) => item.id === weeklyGoalId) ?? null;
    const phaseBoundary = resolveWeeklyBriefingPhaseBoundary({ artifact, goal: weeklyGoal });
    const narrative = await prepareWeeklyBriefingReviewPresentation({
      artifact,
      repositories: FounderRepositories,
      userId: user.id,
      timeZone: user.timeZone,
      phaseBoundary,
    });
    return <WeeklyBriefingScreen narrative={{...narrative,
      goalConfidence: projectConfidenceExplanationForSurface(
        narrative.goalConfidence,
        { assessment: confidenceAssessment, surface: "weekly" }
      )}}/>;
  }
  if (artifact.cadence === "midweek" && artifact.briefing) {
    const briefing = prepareMidweekBriefingReviewPresentation({ artifact });
    return <MidweekBriefingScreen briefing={{...briefing,
      goalConfidence: projectConfidenceExplanationForSurface(
        briefing.goalConfidence,
        { assessment: confidenceAssessment, surface: "midweek" }
      )}}/>;
  }
  if (artifact.cadence === "monthly" && artifact.briefing?.monthlyPresentation) {
    const presentation = artifact.briefing.monthlyPresentation;
    return <MonthlyBriefingScreen presentation={{...presentation, hero: {
      ...presentation.hero,
      confidence: projectConfidenceExplanationForSurface(
        presentation.hero?.confidence,
        { assessment: confidenceAssessment, surface: "monthly" }
      ),
    }}}/>;
  }
  return <BriefingReviewScreen artifact={artifact} preview={preview}/>;
}
