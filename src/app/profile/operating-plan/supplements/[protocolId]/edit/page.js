import { notFound } from "next/navigation";
import { loadProductionBoundedFounderReadContext } from "../../../../../../application/composition/productionApplicationComposition";
import SupplementStrategyEditorScreen from "../../../../../../screens/SupplementStrategyEditorScreen";
import { saveSupplementStrategy } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditSupplementPage({ params }) {
  const { protocolId } = await params;
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "goals", "protocols", "protocolVersions"] });
  const user = await repositories.users.getCurrentUser();
  const [protocol, version, allGoals] = await Promise.all([
    repositories.protocols.getProtocolById(protocolId),
    repositories.protocolVersions.getCurrentVersion(protocolId),
    repositories.goals.listGoals(user.id),
  ]);
  if (!protocol || protocol.userId !== user.id || protocol.category !== "supplement" || protocol.status !== "active" || !version) notFound();
  const goals = allGoals.filter((goal) => goal.status === "active" && protocol.relatedGoalIds?.includes(goal.id));
  const strategy = version.supplementStrategy ?? {};
  return <SupplementStrategyEditorScreen
    action={saveSupplementStrategy.bind(null, { protocolId, expectedCurrentVersionId: version.id })}
    goals={goals}
    mode="edit"
    model={{
      protocolId,
      name: strategy.name ?? protocol.name,
      purpose: strategy.purpose ?? protocol.purpose ?? "",
      role: strategy.role ?? protocol.notes ?? "",
      goalId: version.goalLinks?.[0]?.goalId ?? goals[0]?.id ?? "",
    }}
  />;
}
