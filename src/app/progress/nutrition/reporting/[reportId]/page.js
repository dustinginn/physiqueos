import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionReportingPage({ params }) {
  const { reportId } = await params;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport("nutrition");

  if (!report?.nutritionReportingLinks?.some((item) => item.id === reportId)) {
    notFound();
  }

  return (
    <NutritionKnowledgeScreen
      backHref="/progress/nutrition"
      mode="reporting"
      report={report}
      slug={reportId}
    />
  );
}
