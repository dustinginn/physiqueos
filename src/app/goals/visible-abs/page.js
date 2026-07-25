import CompletedGoalPreviewScreen from "../../../screens/CompletedGoalPreviewScreen";
import { getCompletedGoalPreview } from "../../../domain/services/CompletedGoalPreviewService";

export const dynamic = "force-dynamic";

export default async function VisibleAbsGoalPage() {
  const journey = await getCompletedGoalPreview();
  return <CompletedGoalPreviewScreen journey={journey} />;
}
