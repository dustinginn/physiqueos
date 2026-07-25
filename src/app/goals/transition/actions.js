"use server";

import { revalidatePath } from "next/cache";
import { ProductionGoalTransitionRepositories } from "../../../data/repositories/productionGoalTransitionRepositories";
import { createGoalTransitionService } from "../../../domain/services/GoalTransitionService";

const SOURCE_GOAL_ID = "goal_visible_abs_at_rest";
const ROUTE = "/goals/transition";

export async function saveLiveGoalTransitionSection(input) {
  const user = await trustedFounder();
  const result = await createGoalTransitionService({
    repositories: ProductionGoalTransitionRepositories,
  }).saveSection({ userId: user.id, sourceGoalId: SOURCE_GOAL_ID, ...input });
  revalidatePath(ROUTE);
  return result;
}

export async function markLiveGoalTransitionReady() {
  const user = await trustedFounder();
  const result = await createGoalTransitionService({
    repositories: ProductionGoalTransitionRepositories,
  }).markReady({ userId: user.id, sourceGoalId: SOURCE_GOAL_ID });
  revalidatePath(ROUTE);
  return result;
}

async function trustedFounder() {
  const user = await ProductionGoalTransitionRepositories.users.getCurrentUser();
  if (user?.id !== "user_founder_001") throw new Error("Founder context is required.");
  return user;
}
