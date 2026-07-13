import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import DailyBriefingScreen from "../../../screens/DailyBriefingScreen";

export const dynamic = "force-dynamic";

export default async function DailyBriefingPage() {
  const service = createDailyBriefingService({
    repositories: FounderRepositories,
  });
  const briefing = await service.getDailyBriefing();

  if (!briefing) notFound();

  if (briefing.artifactType === "event" && briefing.artifactId) {
    await service.consumeBriefing(briefing.artifactId);
  }

  return <DailyBriefingScreen briefing={briefing} />;
}
