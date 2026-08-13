import { createInactiveLegacyWebContext } from "../../../application/auth/legacyWebContext";
import { createOperatingPlanReadService } from "../../../application/plan/OperatingPlanReadService";
import { getProductionApplicationComposition } from "../../../application/composition/productionApplicationComposition";
import OperatingPlanScreen from "../../../screens/OperatingPlanScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanPage({ searchParams }) {
  const params = await searchParams;
  const composition = await getProductionApplicationComposition();
  const { principal } = await createInactiveLegacyWebContext({ repositories: composition.repositories });
  const plan = await createOperatingPlanReadService({ repositories: composition.repositories }).getOperatingPlan({ principal });

  return (
    <OperatingPlanScreen
      activityActivated={params?.activity === "activated"}
      planSections={plan.sections}
      trainingActivated={params?.training === "activated"}
      energyActivated={params?.energy === "activated"}
    />
  );
}
