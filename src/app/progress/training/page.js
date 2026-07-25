import { getTrainingTimelineReport } from "../../../domain/services/TrainingEvidenceContextService";
import { withTrainingTimelineContext } from "../../../navigation/trainingTimelineNavigation";
import ProgressPlaceholderScreen from "../../../screens/ProgressPlaceholderScreen";

export const dynamic = "force-dynamic";

export default async function TrainingProgressPage({ searchParams }) {
  const query = await searchParams;
  const { report, timeline } = await getTrainingTimelineReport({
    context: query?.context,
  });
  const currentPath = "/progress/training";

  return (
    <ProgressPlaceholderScreen
      evidenceContext={{
        ...timeline,
        adaptHref: (href) =>
          withTrainingTimelineContext(href, timeline.contextId, {
            returnTo: `${currentPath}?context=${timeline.contextId}`,
          }),
        currentPath,
      }}
      from={query?.from}
      report={report}
    />
  );
}
