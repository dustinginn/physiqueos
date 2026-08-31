import { getProductionProgressEvidenceReadService } from "../../../application/composition/productionApplicationComposition";
import DEXAReportScreen from "../../../screens/DEXAReportScreen";

export const dynamic = "force-dynamic";

export default async function DEXAProgressPage({ searchParams }) {
  const params = await searchParams;
  const { report, timeline } = await getProductionProgressEvidenceReadService().getDEXA({
    context: params?.context,
  });

  return (
    <DEXAReportScreen
      evidenceContext={timeline}
      from={params?.from}
      report={report}
    />
  );
}
