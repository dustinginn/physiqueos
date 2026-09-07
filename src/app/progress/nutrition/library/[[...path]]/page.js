import { getProductionProgressEvidenceReadService } from "../../../../../application/composition/productionApplicationComposition";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionLibraryPage({ params }) {
  const { path = [] } = await params;
  const { report } = await getProductionProgressEvidenceReadService().getNutrition({ context: "all" });

  return (
    <NutritionKnowledgeScreen
      backHref="/progress/nutrition"
      mode="library"
      report={report}
      slug={path}
    />
  );
}
