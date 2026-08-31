import { notFound } from "next/navigation";
import TrainingTimelineSelector from "../../../../../components/training/TrainingTimelineSelector";
import { getProductionTrainingNavigationReadService } from "../../../../../application/composition/productionApplicationComposition";
import { withTrainingTimelineContext } from "../../../../../navigation/trainingTimelineNavigation";
import TrainingKnowledgeScreen from "../../../../../screens/TrainingKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function TrainingReportingPage({ params, searchParams }) {
  const { reportId } = await params;
  const query = await searchParams;
  const { report, timeline } = await getProductionTrainingNavigationReadService().getReporting({
    context: query?.context,
  });
  const currentPath = `/progress/training/reporting/${reportId}`;
  const returnTo = withTrainingTimelineContext(currentPath, timeline.contextId);
  const adaptHref = (href) =>
    withTrainingTimelineContext(href, timeline.contextId, { returnTo });

  if (!report?.reportingLinks?.some((item) => item.id === reportId)) notFound();

  return (
    <TrainingKnowledgeScreen
      backHref={adaptHref("/progress/training")}
      mode="reporting"
      navigation={{
        breadcrumbs: [
          { href: adaptHref("/progress/training"), label: "Training" },
          { href: adaptHref("/progress/training"), label: "Reporting" },
        ],
        parentRoute: adaptHref("/progress/training"),
      }}
      report={report}
      slug={reportId}
      trainingEvidenceContext={{
        adaptHref,
        selector: (
          <TrainingTimelineSelector currentPath={currentPath} timeline={timeline} />
        ),
      }}
    />
  );
}
