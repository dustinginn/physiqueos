import { redirect } from "next/navigation";
import { getTrainingTimelineReport } from "../../../../../domain/services/TrainingEvidenceContextService";
import { buildTrainingLibraryNavigation } from "../../../../../navigation/navigationRegistry";
import { withTrainingTimelineContext } from "../../../../../navigation/trainingTimelineNavigation";
import TrainingTimelineSelector from "../../../../../components/training/TrainingTimelineSelector";
import TrainingKnowledgeScreen from "../../../../../screens/TrainingKnowledgeScreen";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { resolveTrainingExerciseIdentity } from "../../../../../domain/models/trainingExerciseIdentity";
import { createTrainingLibraryExerciseRecordsReadModel } from "../../../../../domain/services/TrainingLibraryExerciseRecordsService";

export const dynamic = "force-dynamic";

export default async function TrainingLibraryPage({ params, searchParams }) {
  const { path = [] } = await params;
  const { context, from } = await searchParams;
  const legacyRedirect = getLegacyTrainingLibraryRedirect(path);

  if (legacyRedirect) {
    redirect(withTrainingTimelineContext(legacyRedirect, context));
  }

  const { report, timeline } = await getTrainingTimelineReport({ context });
  const exerciseIdentity =
    path.length >= 2 && path[0] !== "cardio"
      ? resolveTrainingExerciseIdentity(path.at(-1))
      : null;
  const trainingPerformanceEvents = exerciseIdentity?.canonicalExerciseId
    ? await FounderRepositories.trainingPerformanceEvents
      .listTrainingPerformanceEvents()
    : [];
  const exerciseRecords = createTrainingLibraryExerciseRecordsReadModel({
    canonicalExerciseId: exerciseIdentity?.canonicalExerciseId,
    events: trainingPerformanceEvents,
  });
  const baseNavigation = buildTrainingLibraryNavigation(path);
  const currentPath = baseNavigation.route;
  const returnTo = withTrainingTimelineContext(currentPath, timeline.contextId);
  const adaptHref = (href) =>
    withTrainingTimelineContext(href, timeline.contextId, { returnTo });
  const navigation = {
    ...baseNavigation,
    breadcrumbs: baseNavigation.breadcrumbs.map((item) => ({
      ...item,
      href: adaptHref(item.href),
    })),
    parentRoute: adaptHref(baseNavigation.parentRoute),
    route: baseNavigation.route,
  };

  return (
    <TrainingKnowledgeScreen
      mode="library"
      navigation={navigation}
      reportingOrigin={from === "reporting"}
      report={report}
      slug={path}
      exerciseRecords={exerciseRecords}
      trainingEvidenceContext={{
        adaptHref,
        selector: (
          <TrainingTimelineSelector currentPath={currentPath} timeline={timeline} />
        ),
        showSourceWorkouts: false,
      }}
    />
  );
}

export function getLegacyTrainingLibraryRedirect(path = []) {
  if (["seated_abductions", "seated-abductions"].includes(path.at(-1))) {
    return "/progress/training/library/glutes/seated-hip-adductions";
  }
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
