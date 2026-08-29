import { getProductionCoreNavigationReadService } from "../../../application/composition/productionApplicationComposition";
import OperatingPlanScreen from "../../../screens/OperatingPlanScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanPage({ searchParams }) {
  const params = await searchParams;
  const plan = await getProductionCoreNavigationReadService().getOperatingPlan();

  return (
    <OperatingPlanScreen
      activityActivated={params?.activity === "activated"}
      planSections={plan.sections}
      trainingActivated={params?.training === "activated"}
      energyActivated={params?.energy === "activated"}
    />
  );
}
