import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import NutritionKnowledgeScreen from "../../../../../screens/NutritionKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function NutritionDayPage({ params }) {
  const { dayId } = await params;
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport("nutrition");
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
