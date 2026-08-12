import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createInactiveLegacyWebContext } from "../../../application/auth/legacyWebContext";
import { createOperatingPlanReadService } from "../../../application/plan/OperatingPlanReadService";
import OperatingPlanScreen from "../../../screens/OperatingPlanScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanPage({ searchParams }) {
  const params = await searchParams;
  const { principal } = await createInactiveLegacyWebContext({ repositories: FounderRepositories });
  const plan = await createOperatingPlanReadService({ repositories: FounderRepositories }).getOperatingPlan({ principal });

  return (
    <OperatingPlanScreen
      activityActivated={params?.activity === "activated"}
      planSections={plan.sections}
      trainingActivated={params?.training === "activated"}
      energyActivated={params?.energy === "activated"}
    />
  );
}
