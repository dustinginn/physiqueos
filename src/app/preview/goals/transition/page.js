import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createGoalTransitionService } from "../../../../domain/services/GoalTransitionService";
import GoalTransitionPreviewScreen from "../../../../screens/GoalTransitionPreviewScreen";
import { resolveGoalTransitionPreviewSection } from "../../../../presentation/goalTransitionPreviewNavigation";
import { markGoalTransitionReady, saveGoalTransitionSection } from "./actions";

export const dynamic = "force-dynamic";

export default async function GoalTransitionPreviewPage({ searchParams }) {
  const query = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const draft = await createGoalTransitionService({ repositories: FounderRepositories }).getOrPreview({
    userId: user.id,
    sourceGoalId: "goal_visible_abs_at_rest",
  });
  return <GoalTransitionPreviewScreen draft={draft} initialSection={resolveGoalTransitionPreviewSection(query)} markReadyAction={markGoalTransitionReady} saveAction={saveGoalTransitionSection} />;
}
