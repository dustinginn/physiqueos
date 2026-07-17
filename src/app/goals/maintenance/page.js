import NarrativeGoalPreviewScreen from "../../../screens/NarrativeGoalPreviewScreen";
import { getNarrativeGoalPresentation } from "../../../domain/services/NarrativeGoalPresentationLoader";

export const dynamic = "force-dynamic";

export default async function MaintenanceGoalPage() {
  const narrative = await getNarrativeGoalPresentation("maintenance");
  return <NarrativeGoalPreviewScreen narrative={narrative} />;
}
