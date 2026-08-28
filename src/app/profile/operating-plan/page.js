import { runInactiveLegacyWebReadScope } from "../../../application/auth/legacyWebContext";
import { createOperatingPlanReadService } from "../../../application/plan/OperatingPlanReadService";
import OperatingPlanScreen from "../../../screens/OperatingPlanScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanPage({ searchParams }) {
  const params = await searchParams;
  const plan = await runInactiveLegacyWebReadScope({
    readModel: "operating-plan.page",
    callback: async ({ composition, context: { principal } }) => createOperatingPlanReadService({ repositories: composition.repositories }).getOperatingPlan({ principal }),
  });

  return (
    <OperatingPlanScreen
      activityActivated={params?.activity === "activated"}
      planSections={plan.sections}
      trainingActivated={params?.training === "activated"}
      energyActivated={params?.energy === "activated"}
    />
  );
}
