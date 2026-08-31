import CompletedGoalPreviewScreen from "../../../screens/CompletedGoalPreviewScreen";
import { getProductionCompletedGoalReadService } from "../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export default async function VisibleAbsGoalPage({ searchParams }) {
  const params = await searchParams;
  const journey = await getProductionCompletedGoalReadService().getVisibleAbs();
  return <CompletedGoalPreviewScreen from={params?.from} journey={journey} />;
}
