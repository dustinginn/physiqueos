import { seedMilestones } from "../seed/milestones";
import { byUserId } from "./repositoryUtils";

export function createMilestoneRepository(milestones = []) {
  return {
    async listMilestones(userId, goalId) {
      return byUserId(milestones, userId).filter((milestone) =>
        goalId ? milestone.goalId === goalId : true
      );
    },

    async saveMilestone(milestone) {
      return milestone;
    },

    async updateMilestone(milestoneId, patch) {
      const milestone = milestones.find((item) => item.id === milestoneId);

      return milestone ? { ...milestone, ...patch } : null;
    },
  };
}

export const MilestoneRepository = createMilestoneRepository(seedMilestones);
