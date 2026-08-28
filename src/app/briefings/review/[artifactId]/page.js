import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../../domain/services/DailyBriefingService";
import BriefingReviewScreen from "../../../../screens/BriefingReviewScreen";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";
import WeeklyBriefingScreen from "../../../../screens/WeeklyBriefingScreen";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";
import MidweekBriefingScreen from "../../../../screens/MidweekBriefingScreen";
import MonthlyBriefingScreen from "../../../../screens/MonthlyBriefingScreen";
import { resolveBriefingReviewArtifact } from "../../../../domain/services/BriefingReviewArtifactResolver";
import { prepareWeeklyBriefingReviewPresentation } from "../../../../domain/services/WeeklyBriefingReviewPresentationService";
import { prepareMidweekBriefingReviewPresentation } from "../../../../domain/services/MidweekBriefingPresentationService";
import PhaseReviewCard from "../../../../components/goals/PhaseReviewCard";
import { loadApplicationCanonicalRuntime } from "../../../../application/runtime/ApplicationCanonicalRuntime";
import { resolvePhaseReviewArtifactRead } from
  "../../../../domain/services/PhaseReviewArtifactReadService";
import { resolveWeeklyBriefingPhaseBoundary } from
  "../../../../domain/services/WeeklyBriefingPhaseBoundaryReadService";

export const dynamic = "force-dynamic";

export default async function BriefingReviewPage({ params, searchParams }) {
  const { artifactId } = await params;
  const query = await searchParams;
  return FounderRepositories.runInReadScope(async () => {
  const user = await FounderRepositories.users.getCurrentUser();
  const artifacts = await FounderRepositories.dailyBriefings.listDailyBriefings(user?.id);
  const artifact = resolveBriefingReviewArtifact(artifacts, { artifactId, version: query.version ?? null });
  if (!artifact) notFound();
  const preview = query.preview === "1"
    ? await createDailyBriefingService({ repositories: FounderRepositories }).previewBriefingArtifact(artifact)
    : null;
  if (artifact.briefing?.photoEventNarrative) return <PhotoEventBriefingScreen narrative={artifact.briefing.photoEventNarrative}/>;
  if (artifact.briefing?.dexaEventNarrative) {
    const review = resolvePhaseReviewArtifactRead({ artifact,
      decisionHistory: (await loadApplicationCanonicalRuntime()).phaseReviewDecisions ?? [] });
    return <DEXAEventBriefingScreen narrative={artifact.briefing.dexaEventNarrative}
      phaseReview={review?.readOnly
        ? <PhaseReviewCard readOnly review={review.review}/> : null}/>;
  }
  if (artifact.briefing?.weeklyNarrative) {
    const canonicalStore = await loadApplicationCanonicalRuntime();
    const weeklyGoalId = artifact.briefing.weeklyNarrative.context?.activeGoal?.id ??
      artifact.briefing.weeklyNarrative.context?.activeGoalSummary?.id ?? null;
    const weeklyGoal = (canonicalStore.goals ?? []).find((item) => item.id === weeklyGoalId) ?? null;
    const phaseBoundary = resolveWeeklyBriefingPhaseBoundary({ artifact, goal: weeklyGoal });
    const narrative = await prepareWeeklyBriefingReviewPresentation({
      artifact,
      repositories: FounderRepositories,
      userId: user.id,
      timeZone: user.timeZone,
      phaseBoundary,
    });
    return <WeeklyBriefingScreen narrative={narrative}/>;
  }
  if (artifact.cadence === "midweek" && artifact.briefing) {
    return <MidweekBriefingScreen briefing={prepareMidweekBriefingReviewPresentation({ artifact })}/>;
  }
  if (artifact.cadence === "monthly" && artifact.briefing?.monthlyPresentation) {
    return <MonthlyBriefingScreen presentation={artifact.briefing.monthlyPresentation}/>;
  }
  return <BriefingReviewScreen artifact={artifact} preview={preview}/>;
  }, { readModel: "route.briefing-review" });
}
