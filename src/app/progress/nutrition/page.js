import { getNutritionTimelineReport } from "../../../domain/services/NutritionEvidenceContextService";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function NutritionProgressPage({ searchParams }) {
  const query = await searchParams;
  const { report, timeline } = await getNutritionTimelineReport({
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
