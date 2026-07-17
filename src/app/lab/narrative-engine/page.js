import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import NarrativeEngineLabScreen from "../../../screens/NarrativeEngineLabScreen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Narrative Engine Lab | PhysiqueOS",
};

export default async function NarrativeEngineLabPage() {
  const service = createDailyBriefingService({
    repositories: FounderRepositories,
  });
  const briefing = await service.getLatestPersistedDailyBriefing();

  return <NarrativeEngineLabScreen baseBriefing={briefing} />;
}
