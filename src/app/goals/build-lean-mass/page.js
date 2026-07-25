import PhaseAwareActiveGoalPreviewScreen from "../../../screens/PhaseAwareActiveGoalPreviewScreen";
import { getPhaseAwareActiveGoalPreview } from "../../../domain/services/PhaseAwareActiveGoalPreviewService";

export const dynamic = "force-dynamic";

export default async function BuildLeanMassGoalPage() {
  const preview = await getPhaseAwareActiveGoalPreview();
  return <PhaseAwareActiveGoalPreviewScreen preview={preview}/>;
}
