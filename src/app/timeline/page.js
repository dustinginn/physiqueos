import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createEvidenceTimelineService } from "../../domain/services/EvidenceTimelineService";
import EvidenceTimelineScreen from "../../screens/EvidenceTimelineScreen";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const service = createEvidenceTimelineService({
    repositories: FounderRepositories,
  });
  const items = await service.getTimeline();

  return <EvidenceTimelineScreen items={items} />;
}
