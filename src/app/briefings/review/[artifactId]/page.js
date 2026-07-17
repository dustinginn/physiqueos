import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../../domain/services/DailyBriefingService";
import BriefingReviewScreen from "../../../../screens/BriefingReviewScreen";
import PhotoEventBriefingScreen from "../../../../screens/PhotoEventBriefingScreen";
import WeeklyBriefingScreen from "../../../../screens/WeeklyBriefingScreen";
import DEXAEventBriefingScreen from "../../../../screens/DEXAEventBriefingScreen";
import { resolveBriefingReviewArtifact } from "../../../../domain/services/BriefingReviewArtifactResolver";

export const dynamic = "force-dynamic";

export default async function BriefingReviewPage({ params, searchParams }) {
  const { artifactId } = await params;
  const query = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const artifacts = await FounderRepositories.dailyBriefings.listDailyBriefings(user?.id);
  const artifact = resolveBriefingReviewArtifact(artifacts, { artifactId, version: query.version ?? null });
  if (!artifact) notFound();
  const preview = query.preview === "1"
    ? await createDailyBriefingService({ repositories: FounderRepositories }).previewBriefingArtifact(artifact)
    : null;
  if (artifact.briefing?.photoEventNarrative) return <PhotoEventBriefingScreen narrative={artifact.briefing.photoEventNarrative}/>;
  if (artifact.briefing?.dexaEventNarrative) return <DEXAEventBriefingScreen narrative={artifact.briefing.dexaEventNarrative}/>;
  if (artifact.briefing?.weeklyNarrative) return <WeeklyBriefingScreen narrative={artifact.briefing.weeklyNarrative}/>;
  return <BriefingReviewScreen artifact={artifact} preview={preview}/>;
}
