import { notFound } from "next/navigation";
import { loadProductionBoundedFounderReadContext } from "../../../../application/composition/productionApplicationComposition";
import { buildGoalEditDraft } from "../../../../domain/services/GoalEditDraftService";
import { extendGoalEditDraftWithPhases } from "../../../../domain/services/GoalEditPhaseDraftService";
import { getGoalPhaseCapabilityFromGoal } from "../../../../domain/services/GoalPhasePersistenceService";
import GoalEditWizardScreen from "../../../../screens/GoalEditWizardScreen";
import { resolveGoalNavigationHref } from "../../../../domain/services/GoalNavigationRouteResolver";
import { prepareGoalEditReview, prepareGoalPhaseReview, saveGoalEditChanges, saveGoalPhaseChanges } from "./actions";

export const dynamic = "force-dynamic";

export default async function GoalEditPage({ params }) {
  const { goalId } = await params;
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "goals"] });
  const user = await repositories.users.getCurrentUser();
  const goal = await repositories.goals.getGoalById(goalId);
  if (!goal || goal.userId !== user?.id || goal.status !== "active" || goal.primary !== true) notFound();
  const goalHref = resolveGoalNavigationHref(goal).href ?? "/goals";
  const capability = getGoalPhaseCapabilityFromGoal(goal, { founderUserId: user.id, sourceGoalId: goal.id });
  const initialDraft = extendGoalEditDraftWithPhases(buildGoalEditDraft(goal), { goal, capability });
  return <GoalEditWizardScreen goalHref={goalHref} initialDraft={initialDraft} prepareReview={prepareGoalEditReview} preparePhaseReview={prepareGoalPhaseReview} saveChanges={saveGoalEditChanges} savePhaseChanges={saveGoalPhaseChanges} />;
}
