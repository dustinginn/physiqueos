import TrainingLogger from "../../../components/training/TrainingLogger";
import { getProductionCoreNavigationReadService } from "../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export default async function TrainingLoggerPage() {
  const model = await getProductionCoreNavigationReadService().getTrainingLogger();
  return <TrainingLogger {...model} production />;
}
