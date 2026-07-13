import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import { buildTrainingLibraryNavigation } from "../../../../../navigation/navigationRegistry";
import TrainingKnowledgeScreen from "../../../../../screens/TrainingKnowledgeScreen";

export const dynamic = "force-dynamic";

export default async function TrainingLibraryPage({ params }) {
  const { path = [] } = await params;
  const legacyRedirect = getLegacyTrainingLibraryRedirect(path);

  if (legacyRedirect) redirect(legacyRedirect);

  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport("training");
  const navigation = buildTrainingLibraryNavigation(path);

  return (
    <TrainingKnowledgeScreen
      mode="library"
      navigation={navigation}
      report={report}
      slug={path}
    />
  );
}

function getLegacyTrainingLibraryRedirect(path = []) {
  if (path[0] !== "resistance") return null;

  if (path.length <= 2) return "/progress/training/library";

  const region = path[2];

  if (path.length === 3) {
    if (region === "arms") return "/progress/training/library/biceps";
    return `/progress/training/library/${region}`;
  }

  if (path.length >= 5) {
    const exercise = path.at(-1);
    const targetRegion = region === "arms" ? "biceps" : region;

    return `/progress/training/library/${targetRegion}/${exercise}`;
  }

  return `/progress/training/library/${region}`;
}
