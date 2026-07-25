import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createOperatingPlanEnergyStrategyService } from "../../../../../domain/services/OperatingPlanEnergyStrategyService";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) redirect("/profile/operating-plan");

  await createOperatingPlanEnergyStrategyService({
    repositories: FounderRepositories,
  }).getActiveStrategy(user.id);

  redirect("/profile/operating-plan");
}
