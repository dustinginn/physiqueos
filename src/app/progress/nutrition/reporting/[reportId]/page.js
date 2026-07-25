import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { getNutritionCaloriesReport } from "../../../../../domain/services/NutritionCaloriesReportingService";
import { getNutritionMacrosReport } from "../../../../../domain/services/NutritionMacrosReportingService";
import { getNutritionMealsReport } from "../../../../../domain/services/NutritionMealsReportingService";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import NutritionCaloriesReportScreen from "../../../../../screens/NutritionCaloriesReportScreen";
import NutritionMacrosReportScreen from "../../../../../screens/NutritionMacrosReportScreen";
import NutritionMealsReportScreen from "../../../../../screens/NutritionMealsReportScreen";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionReportingPage({ params, searchParams }) {
  const { reportId } = await params;
  const query = await searchParams;

  if (reportId === "calories") {
    const report = await getNutritionCaloriesReport({
      context: query?.context,
    });

    return <NutritionCaloriesReportScreen report={report} />;
  }

  if (reportId === "macros") {
    const report = await getNutritionMacrosReport({
      context: query?.context,
    });

    return <NutritionMacrosReportScreen report={report} />;
  }

  if (reportId === "meals") {
    const report = await getNutritionMealsReport({
      context: query?.context,
    });

    return <NutritionMealsReportScreen report={report} />;
  }

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
