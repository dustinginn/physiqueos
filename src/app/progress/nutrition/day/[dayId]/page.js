import { notFound } from "next/navigation";
import { getProductionProgressEvidenceReadService } from "../../../../../application/composition/productionApplicationComposition";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionDayPage({ params }) {
  const { dayId } = await params;
  const { report } = await getProductionProgressEvidenceReadService().getNutrition({ context: "all" });
  const day =
    dayId === "context"
      ? report.entries?.find((entry) => entry.href === "/progress/nutrition/day/context")
      : report.entries?.find((entry) => entry.id === dayId);

  if (!day) notFound();

  return (
    <NutritionKnowledgeScreen
      backHref="/progress/nutrition"
      day={day}
      mode="day"
      report={report}
    />
  );
}
