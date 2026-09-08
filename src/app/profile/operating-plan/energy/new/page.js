import { redirect } from "next/navigation";
import { loadProductionBoundedFounderReadContext } from "../../../../../application/composition/productionApplicationComposition";
import { createOperatingPlanEnergyStrategyService } from "../../../../../domain/services/OperatingPlanEnergyStrategyService";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "goals", "protocols"] });
  const user = await repositories.users.getCurrentUser();
  if (!user) redirect("/profile/operating-plan");

  await createOperatingPlanEnergyStrategyService({
    repositories,
  }).getActiveStrategy(user.id);

  redirect("/profile/operating-plan");
}
