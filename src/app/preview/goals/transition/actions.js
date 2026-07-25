"use server";

import { revalidatePath } from "next/cache";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createGoalTransitionService } from "../../../../domain/services/GoalTransitionService";

const SOURCE_GOAL_ID = "goal_visible_abs_at_rest";

export async function saveGoalTransitionSection(input) {
  const user = await FounderRepositories.users.getCurrentUser();
  const result = await createGoalTransitionService({ repositories: FounderRepositories }).saveSection({
    userId: user.id,
    sourceGoalId: SOURCE_GOAL_ID,
    ...input,
  });
  revalidatePath("/preview/goals/transition");
  return result;
}

export async function markGoalTransitionReady() {
  const user = await FounderRepositories.users.getCurrentUser();
  const result = await createGoalTransitionService({ repositories: FounderRepositories }).markReady({
    userId: user.id,
    sourceGoalId: SOURCE_GOAL_ID,
  });
  revalidatePath("/preview/goals/transition");
  return result;
}
