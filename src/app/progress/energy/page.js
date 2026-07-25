import { getEnergyEvidenceReport } from "../../../domain/services/EnergyEvidenceService";
import EnergyEvidenceScreen from "../../../screens/EnergyEvidenceScreen";

export const dynamic = "force-dynamic";

export default async function EnergyProgressPage({ searchParams }) {
  const query = await searchParams;
  const report = await getEnergyEvidenceReport({ context: query?.context });

  return <EnergyEvidenceScreen report={report} />;
}
