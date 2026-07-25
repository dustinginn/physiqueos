import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../../../data/repositories/founderRepositories";
import { createStrategyEditorModel } from "../../../../../../../domain/services/StrategyEditorService";
import { createCoachingUpdatesReadService } from "../../../../../../../domain/services/CoachingUpdatesReadService";
import { resolveCoachingUpdatesGoalCadencePolicy } from "../../../../../../../domain/services/CoachingUpdatesGoalCadencePolicyService";
import { createCoachingUpdatesEditorModel } from "../../../../../../../domain/services/CoachingUpdatesEditorService";
import StrategyEditorScreen from "../../../../../../../screens/StrategyEditorScreen";
import { saveStrategy } from "./actions";

export const dynamic = "force-dynamic";

export default async function StrategyEditPage({ params }) {
  const { strategyId, strategyType } = await params;
  if (!["briefings", "nutrition", "training"].includes(strategyType)) notFound();
  const user = await FounderRepositories.users.getCurrentUser();
  const protocol = await FounderRepositories.protocols.getProtocolById(strategyId);
  if (!protocol || protocol.userId !== user.id || protocol.status !== "active" ||
      (protocol.protocolType ?? protocol.category) !== strategyType) notFound();
  const version = await FounderRepositories.protocolVersions.getCurrentVersion(protocol.id);
  let model;
  if (strategyType === "briefings") {
    const [readModel, goal] = await Promise.all([
      createCoachingUpdatesReadService({ repositories: FounderRepositories })
        .getCurrent({ protocolId: protocol.id, userId: user.id }),
      FounderRepositories.goals.getActiveGoal(user.id),
    ]);
    model = createCoachingUpdatesEditorModel({
      readModel,
      policy: resolveCoachingUpdatesGoalCadencePolicy(goal),
    });
  } else {
    model = createStrategyEditorModel({ protocol, strategyType, version });
  }
  if (!model) notFound();
  const action = saveStrategy.bind(null, {
    expectedCurrentVersionId: version.id,
    protocolId: protocol.id,
    strategyType,
  });
  return <StrategyEditorScreen action={action} model={model}/>;
}
