import { createPriorityDetailService } from "../../domain/services/PriorityDetailService.js";

export function createPriorityNavigationReadService({ store } = {}) {
  if (!store?.load) throw new Error("Priority navigation requires a read store.");
  return Object.freeze({
    async getPriorityDetail(priorityId) {
      const input = await store.load({ priorityId });
      if (!input.user) return null;
      return createPriorityDetailService({ repositories: repositoriesFrom(input) })
        .getPriorityDetail(priorityId, input.user.id);
    },
  });
}

function repositoriesFrom(input) {
  return Object.freeze({
    users: { getUserById: async () => input.user },
    goals: { listGoals: async () => input.goals },
    reminders: { getReminderById: async (id) => input.reminder?.id === id ? input.reminder : null },
    protocols: { listProtocols: async () => input.protocols },
    operatingPlan: { getOperatingPlan: async () => input.operatingPlan },
    operatingRhythm: { getOperatingRhythm: async () => input.operatingRhythm },
    executionItems: { listExecutionItems: async () => input.executionItems },
  });
}
