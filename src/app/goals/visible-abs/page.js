import NarrativeGoalPreviewScreen from "../../../screens/NarrativeGoalPreviewScreen";
import { getNarrativeGoalPresentation } from "../../../domain/services/NarrativeGoalPresentationLoader";

export const dynamic = "force-dynamic";

export default async function VisibleAbsGoalPage() {
  const narrative = await getNarrativeGoalPresentation("visibleAbs");
  return <NarrativeGoalPreviewScreen narrative={narrative} />;
}
