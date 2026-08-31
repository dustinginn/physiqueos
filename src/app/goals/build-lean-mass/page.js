import PhaseAwareActiveGoalPreviewScreen from "../../../screens/PhaseAwareActiveGoalPreviewScreen";
import { getProductionActiveGoalReadService } from "../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export default async function BuildLeanMassGoalPage() {
  const preview = await getProductionActiveGoalReadService().getPreview();
  return <PhaseAwareActiveGoalPreviewScreen preview={preview}/>;
}
