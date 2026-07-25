import TrainingTimelineSelector from "../components/training/TrainingTimelineSelector";
import TrainingKnowledgeScreen from "./TrainingKnowledgeScreen";

export default function TrainingRepresentativePathPreviewScreen({ model, view }) {
  const currentPath =
    view === "arms"
      ? "/evidence/training/preview/arms"
      : "/evidence/training/preview/arms/spider-curl";

  return (
    <TrainingKnowledgeScreen
      mode="library"
      navigation={model.navigation[view]}
      report={model.report}
      slug={model.slug[view]}
      trainingEvidenceContext={{
        adaptHref: (href, item) =>
          item.label === "Spider Curls" ? model.links.spiderCurl : href,
        showSourceWorkouts: view !== "spider",
        selector: (
          <TrainingTimelineSelector
            currentPath={currentPath}
            timeline={model.timeline}
          />
        ),
      }}
    />
  );
}
