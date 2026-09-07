import { notFound } from "next/navigation";
import { getProductionProgressEvidenceReadService } from "../../../../../application/composition/productionApplicationComposition";
import { createNutritionCaloriesPageModel } from "../../../../../domain/services/NutritionCaloriesReportingService";
import { createNutritionMacrosPageModel } from "../../../../../domain/services/NutritionMacrosReportingService";
import { createNutritionMealsPageModel } from "../../../../../domain/services/NutritionMealsReportingService";
import NutritionCaloriesReportScreen from "../../../../../screens/NutritionCaloriesReportScreen";
import NutritionMacrosReportScreen from "../../../../../screens/NutritionMacrosReportScreen";
import NutritionMealsReportScreen from "../../../../../screens/NutritionMealsReportScreen";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionReportingPage({ params, searchParams }) {
  const { reportId } = await params;
  const query = await searchParams;
  const { report, timeline } = await getProductionProgressEvidenceReadService().getNutrition({
    context: query?.context,
  });

  if (reportId === "calories") {
    return <NutritionCaloriesReportScreen report={createNutritionCaloriesPageModel({ report, timeline })} />;
  }

  if (reportId === "macros") {
    return <NutritionMacrosReportScreen report={createNutritionMacrosPageModel({ report, timeline })} />;
  }

  if (reportId === "meals") {
    return <NutritionMealsReportScreen report={createNutritionMealsPageModel({ report, timeline })} />;
  }

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
