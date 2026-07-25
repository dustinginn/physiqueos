import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import { createOperatingPlanStrategyDetailService } from "../../../../../../domain/services/OperatingPlanStrategyDetailService";
import OperatingPlanStrategyDetailScreen from "../../../../../../screens/OperatingPlanStrategyDetailScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanStrategyPage({ params }) {
  const { strategyId, strategyType } = await params;
  const user = await FounderRepositories.users.getCurrentUser();
  const detail = await createOperatingPlanStrategyDetailService({ repositories: FounderRepositories })
    .getDetail({ strategyId, strategyType, userId: user.id });
  return <OperatingPlanStrategyDetailScreen detail={detail}/>;
}
