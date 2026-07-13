import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import TrainingKnowledgeScreen from "../../../../../screens/TrainingKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function TrainingReportingPage({ params }) {
  const { reportId } = await params;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport("training");

  if (!report?.reportingLinks?.some((item) => item.id === reportId)) notFound();

  return (
    <TrainingKnowledgeScreen
      backHref="/progress/training"
      mode="reporting"
      navigation={{
        breadcrumbs: [
          { href: "/progress/training", label: "Training" },
          { href: "/progress/training", label: "Reporting" },
        ],
        parentRoute: "/progress/training",
      }}
      report={report}
      slug={reportId}
    />
  );
}
