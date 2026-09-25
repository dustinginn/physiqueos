import { createCoreNavigationReadService } from "../../../src/application/core/CoreNavigationReadService.js";
import { createPostgresCoreNavigationReadStore } from "../../../src/platform/database/PostgresCoreNavigationReadStore.js";
import { createActiveGoalReadService } from "../../../src/application/goals/ActiveGoalReadService.js";
import { createPostgresActiveGoalReadStore } from "../../../src/platform/database/PostgresActiveGoalReadStore.js";
import { createCompletedGoalReadService } from "../../../src/application/goals/CompletedGoalReadService.js";
import { createPostgresCompletedGoalReadStore } from "../../../src/platform/database/PostgresCompletedGoalReadStore.js";
import { createPriorityNavigationReadService } from "../../../src/application/priorities/PriorityNavigationReadService.js";
import { createPostgresPriorityNavigationReadStore } from "../../../src/platform/database/PostgresPriorityNavigationReadStore.js";
import { createRegistryReader } from "./registry.mjs";

export const GROUP = "core";
export function createReaders(options) {
  return {
    core: createCoreNavigationReadService({ store: createPostgresCoreNavigationReadStore(options), readCanonicalExerciseRegistry: createRegistryReader(options) }),
    activeGoal: createActiveGoalReadService({ store: createPostgresActiveGoalReadStore(options) }),
    completedGoal: createCompletedGoalReadService({ store: createPostgresCompletedGoalReadStore(options) }),
    priorities: createPriorityNavigationReadService({ store: createPostgresPriorityNavigationReadStore(options) }),
  };
}
export async function runGroup({ bench }) {
  const home = await bench("home", "home", { presentationVersion: "2" });
  const focus = Array.isArray(home?.data?.todaysFocus) ? home.data.todaysFocus : [];
  let index = 0;
  for (const item of focus.slice(0, 4)) {
    const priorityId = item?.executionContract?.priorityId ?? item?.completionId ?? item?.id;
    const occurrenceDate = item?.occurrenceDate ?? item?.completionContext?.occurrenceDate ?? item?.executionContract?.occurrenceDate;
    if (!priorityId) continue;
    index += 1;
    await bench(`priority#${index}`, "priority", occurrenceDate ? { priorityId, occurrenceDate } : { priorityId });
  }
  await bench("log.queue", "evidence-review-queue", {});
  await bench("goals", "goals", {});
  await bench("goal.active", "active-goal", {});
  await bench("goal.completed-visible-abs", "completed-goal", {});
  await bench("operating-plan", "operating-plan", {});
  await bench("morning-check-in", "morning-check-in", {});
}
