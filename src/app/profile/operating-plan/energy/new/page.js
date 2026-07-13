import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createCutEnergyStrategyService } from "../../../../../domain/services/CutEnergyStrategyService";
import CutEnergyStrategyBuilderScreen from "../../../../../screens/CutEnergyStrategyBuilderScreen";
import { activateCutEnergyStrategy } from "./actions";
export const dynamic = "force-dynamic";
export default async function Page() { const user = await FounderRepositories.users.getCurrentUser(); const context = await createCutEnergyStrategyService({ repositories: FounderRepositories }).getBuilderContext(user.id); if (context.link) redirect("/profile/operating-plan?energy=active"); return <CutEnergyStrategyBuilderScreen action={activateCutEnergyStrategy} context={context} />; }
