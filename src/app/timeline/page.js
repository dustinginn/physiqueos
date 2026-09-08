import { getProductionEvidenceTimelineReadService } from "../../application/composition/productionApplicationComposition";
import EvidenceTimelineScreen from "../../screens/EvidenceTimelineScreen";

export const dynamic = "force-dynamic";

export default async function TimelinePage({ searchParams }) {
  const query = await searchParams;
  const page = await getProductionEvidenceTimelineReadService().getPage({ limit: query?.limit });

  return <EvidenceTimelineScreen {...page} />;
}
