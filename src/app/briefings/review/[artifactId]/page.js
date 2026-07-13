import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../../domain/services/DailyBriefingService";
import BriefingReviewScreen from "../../../../screens/BriefingReviewScreen";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";
import WeeklyBriefingScreen from "../../../../screens/WeeklyBriefingScreen";
import { createWeeklyNarrativeService } from "../../../../domain/services/WeeklyNarrativeService";

export const dynamic = "force-dynamic";

export default async function BriefingReviewPage({ params, searchParams }) {
  const { artifactId } = await params;
  const query = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const artifacts = await FounderRepositories.dailyBriefings.listDailyBriefings(user?.id);
  let artifact = artifacts.find((item) => item.id === artifactId);
  if (!artifact && artifactId.startsWith("weekly_briefing_")) {
    artifact = await createWeeklyNarrativeService({ repositories: FounderRepositories }).getOrCreate({ userId: user?.id });
    if (artifact?.id !== artifactId) artifact = null;
  }
  if (artifact?.cadence === "weekly" && artifact.briefing?.version !== "weekly_narrative_v3") {
    const currentWeekly = await createWeeklyNarrativeService({ repositories: FounderRepositories }).getOrCreate({ userId: user?.id });
    if (currentWeekly?.id === artifactId) artifact = currentWeekly;
  }
  if (!artifact) notFound();
  const preview = query.preview === "1"
    ? await createDailyBriefingService({ repositories: FounderRepositories }).previewBriefingArtifact(artifact)
    : null;
  if (artifact.briefing?.photoEventNarrative) return <PhotoEventBriefingScreen narrative={artifact.briefing.photoEventNarrative}/>;
  if (artifact.briefing?.weeklyNarrative) return <WeeklyBriefingScreen narrative={artifact.briefing.weeklyNarrative}/>;
  return <BriefingReviewScreen artifact={artifact} preview={preview}/>;
}
