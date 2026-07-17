import NarrativeGoalPreviewScreen from "../../../screens/NarrativeGoalPreviewScreen";
import { getNarrativeGoalPresentation } from "../../../domain/services/NarrativeGoalPresentationLoader";

export const dynamic = "force-dynamic";

export default async function LeanMassGoalPage() {
  const narrative = await getNarrativeGoalPresentation("leanMass");
  return <NarrativeGoalPreviewScreen narrative={narrative} />;
}
