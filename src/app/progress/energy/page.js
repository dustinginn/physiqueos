import { getProductionProgressEvidenceReadService } from "../../../application/composition/productionApplicationComposition";
import { createProviderEnergyEvidenceReport } from "../../../domain/services/EnergyEvidenceService";
import EnergyEvidenceScreen from "../../../screens/EnergyEvidenceScreen";

export const dynamic = "force-dynamic";

export default async function EnergyProgressPage({ searchParams }) {
  const query = await searchParams;
  const input = await getProductionProgressEvidenceReadService().getEnergy({ context: query?.context });
  const report = createProviderEnergyEvidenceReport({
    ...input,
    contextId: input.timeline.contextId,
    timeline: input.timeline,
  });

  return <EnergyEvidenceScreen report={report} />;
}
