import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import SupplementStrategyEditorScreen from "../../../../../../screens/SupplementStrategyEditorScreen";
import { saveSupplementStrategy } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditSupplementPage({ params }) {
  const { protocolId } = await params;
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocol, version, allGoals] = await Promise.all([
    FounderRepositories.protocols.getProtocolById(protocolId),
    FounderRepositories.protocolVersions.getCurrentVersion(protocolId),
    FounderRepositories.goals.listGoals(user.id),
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
