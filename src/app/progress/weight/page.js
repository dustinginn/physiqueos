import { getWeightTimelineReport } from "../../../domain/services/WeightEvidenceContextService";
import WeightReportScreen from "../../../screens/WeightReportScreen";

export const dynamic = "force-dynamic";

export default async function WeightProgressPage({ searchParams }) {
  const params = await searchParams;
  const { report, timeline } = await getWeightTimelineReport({
    context: params?.context,
  });

  return (
    <WeightReportScreen
      evidenceContext={{
        ...timeline,
        currentPath: "/progress/weight",
        preservedParams: params?.from === "you" ? { from: "you" } : {},
      }}
      from={params?.from}
      report={report}
    />
  );
}
