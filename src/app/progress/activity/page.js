import { getActivityTimelineReport } from "../../../domain/services/ActivityEvidenceContextService";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function ActivityProgressPage({ searchParams }) {
  const query = await searchParams;
  const { report, timeline } = await getActivityTimelineReport({
    context: query?.context,
  });

  return (
    <ProgressPlaceholderScreen
      evidenceContext={timeline}
      from={query?.from}
      report={report}
    />
  );
}
