import { loadApplicationCanonicalRuntime } from "../../../application/runtime/ApplicationCanonicalRuntime";
import { ProductionGoalTransitionRepositories } from "../../../data/repositories/productionGoalTransitionRepositories";
import { createProductionGoalTransitionDraftService } from "../../../domain/services/ProductionGoalTransitionDraftService";
import GoalTransitionPreviewScreen from "../../../screens/GoalTransitionPreviewScreen";
import { resolveGoalTransitionPreviewSection } from "../../../presentation/goalTransitionPreviewNavigation";
import { markLiveGoalTransitionReady, saveLiveGoalTransitionSection } from "./actions";
import { redirect } from "next/navigation";
import {
  getProductionGoalTransitionResumeDestination,
} from "../../../domain/services/ProductionGoalTransitionEntryPointService";

export const dynamic = "force-dynamic";

export default async function LiveGoalTransitionPage({ searchParams }) {
  const query = await searchParams;
  const user = await ProductionGoalTransitionRepositories.users.getCurrentUser();
  const runtime = await loadApplicationCanonicalRuntime();
  const draft = await createProductionGoalTransitionDraftService({
    repositories: ProductionGoalTransitionRepositories,
    readStore: () => structuredClone(runtime),
  }).getOrCreateFresh({
    userId: user.id,
    sourceGoalId: "goal_visible_abs_at_rest",
  });
  const resumeDestination = getProductionGoalTransitionResumeDestination(
    structuredClone(await loadApplicationCanonicalRuntime()),
    draft.id
  );
  if (resumeDestination !== "/goals/transition") redirect(resumeDestination);
  return (
    <GoalTransitionPreviewScreen
      draft={draft}
      initialSection={resolveGoalTransitionPreviewSection(query)}
      markReadyAction={markLiveGoalTransitionReady}
      protocolReviewRoute="/goals/transition/protocols"
      routeBase="/goals/transition"
      saveAction={saveLiveGoalTransitionSection}
    />
  );
}
