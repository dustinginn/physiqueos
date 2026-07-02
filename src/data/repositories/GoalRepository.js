import { seedGoals } from "../seed/goals";
import { byUserId } from "./repositoryUtils";

export function createGoalRepository(goals = [], options = {}) {
  return {
    async listGoals(userId) {
      return byUserId(goals, userId);
    },

    async getActiveGoal(userId) {
      return goals.find((goal) => goal.userId === userId && goal.primary) ?? null;
    },

    async getGoalById(goalId) {
      return goals.find((goal) => goal.id === goalId) ?? null;
    },

    async saveGoal(goal) {
      const existingIndex = goals.findIndex((item) => item.id === goal.id);

      if (existingIndex >= 0) {
        goals[existingIndex] = goal;
      } else {
        goals.push(goal);
      }

      options.onChange?.();

      return goal;
    },

    async updateGoal(goalId, patch) {
      const goal = goals.find((item) => item.id === goalId);
      const goalIndex = goals.findIndex((item) => item.id === goalId);

      if (!goal || goalIndex < 0) return null;

      const updatedGoal = {
        ...goal,
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      goals[goalIndex] = updatedGoal;
      options.onChange?.();

      return updatedGoal;
    },
  };
}

export const GoalRepository = createGoalRepository(seedGoals);
