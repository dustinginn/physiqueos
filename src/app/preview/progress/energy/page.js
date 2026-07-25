import { getEnergyEvidenceReport } from "../../../../domain/services/EnergyEvidenceService";
import EnergyEvidenceScreen from "../../../../screens/EnergyEvidenceScreen";

export const dynamic = "force-dynamic";

export default async function EnergyEvidencePreviewPage({ searchParams }) {
  const query = await searchParams;
  const report = await getEnergyEvidenceReport({
    context: query?.context,
    currentPath: "/preview/progress/energy",
  });

  return <EnergyEvidenceScreen report={report} />;
}
