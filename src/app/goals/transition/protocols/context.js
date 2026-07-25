import { ProductionGoalTransitionRepositories } from "../../../../data/repositories/productionGoalTransitionRepositories";
import { createGoalProtocolTransitionService } from "../../../../domain/services/GoalProtocolTransitionService";
import { buildGoalTransitionProtocolReviewHandoff } from "../../../../presentation/goalTransitionProtocolReviewHandoff";

export async function loadLiveProtocolTransition() {
  const user = await ProductionGoalTransitionRepositories.users.getCurrentUser();
  if (user?.id !== "user_founder_001") throw new Error("Founder context is required.");
  const goalTransition = await ProductionGoalTransitionRepositories.goalTransitionDrafts
    .getLatestActiveForSourceGoal(user.id, "goal_visible_abs_at_rest");
  if (!goalTransition?.liveProduction) {
    throw new Error("Complete the live Goal Creation flow before reviewing protocols.");
  }
  const handoff = buildGoalTransitionProtocolReviewHandoff(goalTransition);
  const historicalProtocols =
    await ProductionGoalTransitionRepositories.protocols.listActiveProtocols(user.id);
  const service = createGoalProtocolTransitionService({
    repositories: ProductionGoalTransitionRepositories,
  });
  const draft = await service.getOrPreview({ handoff, historicalProtocols });
  return { draft, handoff, historicalProtocols, service, user };
}
