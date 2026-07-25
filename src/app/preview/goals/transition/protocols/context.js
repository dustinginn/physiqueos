import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createGoalProtocolTransitionService } from "../../../../../domain/services/GoalProtocolTransitionService";
import { buildGoalTransitionProtocolReviewHandoff } from "../../../../../presentation/goalTransitionProtocolReviewHandoff";

const SOURCE_GOAL_ID = "goal_visible_abs_at_rest";

export async function loadProtocolTransitionPreview() {
  const user = await FounderRepositories.users.getCurrentUser();
  const goalTransition = await FounderRepositories.goalTransitionDrafts.getLatestActiveForSourceGoal(user.id, SOURCE_GOAL_ID);
  if (!goalTransition) throw new Error("Complete Goal Creation before reviewing protocols.");
  const handoff = buildGoalTransitionProtocolReviewHandoff(goalTransition);
  const historicalProtocols = await FounderRepositories.protocols.listActiveProtocols(user.id);
  const service = createGoalProtocolTransitionService({ repositories: FounderRepositories });
  const draft = await service.getOrPreview({ handoff, historicalProtocols });
  return { draft, handoff, historicalProtocols, service, user };
}
