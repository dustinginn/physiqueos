import { loadProductionBoundedFounderReadContext } from "../../../../../../application/composition/productionApplicationComposition";
import { createOperatingPlanStrategyDetailService } from "../../../../../../domain/services/OperatingPlanStrategyDetailService";
import OperatingPlanStrategyDetailScreen from "../../../../../../screens/OperatingPlanStrategyDetailScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanStrategyPage({ params }) {
  const { strategyId, strategyType } = await params;
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "goals", "protocols", "protocolVersions", "nutritionContext"] });
  const user = await repositories.users.getCurrentUser();
  const detail = await createOperatingPlanStrategyDetailService({ repositories })
    .getDetail({ strategyId, strategyType, userId: user.id });
  return <OperatingPlanStrategyDetailScreen detail={detail}/>;
}
