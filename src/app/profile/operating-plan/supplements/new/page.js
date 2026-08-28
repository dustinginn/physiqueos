import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { getLocalDateKey } from "../../../../../domain/utils/localDate";
import SupplementStrategyEditorScreen from "../../../../../screens/SupplementStrategyEditorScreen";
import { addSupplement } from "./actions";

export const dynamic = "force-dynamic";

export default async function AddSupplementPage() {
  return FounderRepositories.runInReadScope(async () => {
  const user = await FounderRepositories.users.getCurrentUser();
  const goals = (await FounderRepositories.goals.listGoals(user.id)).filter((goal) => goal.status === "active");
  return <SupplementStrategyEditorScreen
    action={addSupplement}
    goals={goals}
    mode="create"
    model={{ goalId: goals[0]?.id ?? "", initialStatus: "active", name: "", purpose: "", role: "", startDate: getLocalDateKey() }}
  />;
  }, { readModel: "route.supplement-new" });
}
