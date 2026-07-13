import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionLibraryPage({ params }) {
  const { path = [] } = await params;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport("nutrition");

  return (
    <NutritionKnowledgeScreen
      backHref="/progress/nutrition"
      mode="library"
      report={report}
      slug={path}
    />
  );
}
