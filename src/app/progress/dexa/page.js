import { getDEXATimelineReport } from "../../../domain/services/DEXAEvidenceContextService";
import DEXAReportScreen from "../../../screens/DEXAReportScreen";

export const dynamic = "force-dynamic";

export default async function DEXAProgressPage({ searchParams }) {
  const params = await searchParams;
  const { report, timeline } = await getDEXATimelineReport({
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
