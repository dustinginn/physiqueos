import { getProductionCoreNavigationReadService } from "../../../../application/composition/productionApplicationComposition";
import TrackingScreen from "../../../../screens/TrackingScreen";

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  const { morningWeighIn } = await getProductionCoreNavigationReadService().getTracking();
  return <TrackingScreen morningWeighIn={morningWeighIn} />;
}
