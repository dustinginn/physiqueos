import { loadProductionBoundedFounderReadContext } from "../../../../../application/composition/productionApplicationComposition";
import { getLocalDateKey } from "../../../../../domain/utils/localDate";
import SupplementStrategyEditorScreen from "../../../../../screens/SupplementStrategyEditorScreen";
import { addSupplement } from "./actions";

export const dynamic = "force-dynamic";

export default async function AddSupplementPage() {
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "goals"] });
  const user = await repositories.users.getCurrentUser();
  const goals = (await repositories.goals.listGoals(user.id)).filter((goal) => goal.status === "active");
  return <SupplementStrategyEditorScreen
    action={addSupplement}
    goals={goals}
    mode="create"
    model={{ goalId: goals[0]?.id ?? "", initialStatus: "active", name: "", purpose: "", role: "", startDate: getLocalDateKey() }}
  />;
}
