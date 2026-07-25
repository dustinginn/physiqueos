import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingTimelineReport } from "./TrainingEvidenceContextService";
import { buildTrainingLibraryNavigation } from "../../navigation/navigationRegistry";

export async function getTrainingRepresentativePathPreview({
  context = "build-lean-mass",
  repositories = FounderRepositories,
} = {}) {
  const { report, timeline } = await getTrainingTimelineReport({
    context,
    repositories,
  });
  const armsPath = ["resistance", "upper-body", "arms"];
  const spiderPath = ["resistance", "upper-body", "arms", "curl", "spider-curls"];

  return Object.freeze({
    timeline,
    report,
    links: {
      training: `/evidence/training/preview?context=${timeline.contextId}`,
      arms: `/evidence/training/preview/arms?context=${timeline.contextId}`,
      spiderCurl: `/evidence/training/preview/arms/spider-curl?context=${timeline.contextId}`,
    },
    slug: {
      arms: armsPath,
      spider: spiderPath,
    },
    navigation: {
      arms: previewNavigation(buildTrainingLibraryNavigation(armsPath), timeline.contextId),
      spider: previewNavigation(buildTrainingLibraryNavigation(spiderPath), timeline.contextId),
    },
  });
}

function previewNavigation(navigation, contextId) {
  const adapt = (href) => {
    if (href === "/progress/training") {
      return `/evidence/training/preview?context=${contextId}`;
    }
    if (/\/arms\/curl\/spider-curls$/.test(href)) {
      return `/evidence/training/preview/arms/spider-curl?context=${contextId}`;
    }
    if (/\/arms(?:\/curl)?$/.test(href)) {
      return `/evidence/training/preview/arms?context=${contextId}`;
    }
    return href;
  };
  return {
    ...navigation,
    breadcrumbs: navigation.breadcrumbs.map((item) => ({
      ...item,
      href: adapt(item.href),
    })),
    parentRoute: adapt(navigation.parentRoute),
    route: adapt(navigation.route),
  };
}
