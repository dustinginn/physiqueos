import { redirect } from "next/navigation";
import { buildTrainingLibraryNavigation } from "../../../../../navigation/navigationRegistry";
import { withTrainingTimelineContext } from "../../../../../navigation/trainingTimelineNavigation";
import TrainingTimelineSelector from "../../../../../components/training/TrainingTimelineSelector";
import TrainingKnowledgeScreen, {
  getTrainingLibraryExercisePresentation,
} from "../../../../../screens/TrainingKnowledgeScreen";
import { resolveTrainingExerciseIdentity } from "../../../../../domain/models/trainingExerciseIdentity";
import { createTrainingLibraryMetadata } from "../../../../../presentation/trainingExercisePresentation";
import { getProductionTrainingNavigationReadService } from "../../../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { path = [] } = await params;
  const exerciseSlug = path.length >= 2 && path[0] !== "cardio"
    ? path.at(-1)
    : null;

  if (!exerciseSlug) return { title: "Training Library | PhysiqueOS" };

  const presentation = getTrainingLibraryExercisePresentation({
    exerciseSlug,
    report: { trainingDays: [] },
  });

  return createTrainingLibraryMetadata(presentation);
}

export default async function TrainingLibraryPage({ params, searchParams }) {
  const { path = [] } = await params;
  const { context, from } = await searchParams;
  const legacyRedirect = getLegacyTrainingLibraryRedirect(path);

  if (legacyRedirect) {
    redirect(withTrainingTimelineContext(legacyRedirect, context));
  }

  const exerciseIdentity =
    path.length >= 2 && path[0] !== "cardio"
      ? resolveTrainingExerciseIdentity(path.at(-1))
      : null;
  const trainingNavigation = getProductionTrainingNavigationReadService();
  const narrowRead = exerciseIdentity?.canonicalExerciseId
    ? await trainingNavigation.getExercise({
        context,
        exerciseSlug: path.at(-1),
      })
    : await trainingNavigation.getLibrary({ context, path });
  const { report, timeline, exerciseRecords = null } = narrowRead;
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
