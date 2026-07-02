import { latestByDate } from "./repositoryUtils";

export function createDailyBriefingRepository(dailyBriefings = [], options = {}) {
  return {
    async listDailyBriefings(userId) {
      return dailyBriefings.filter((briefing) => briefing.userId === userId);
    },

    async getLatestDailyBriefing(userId) {
      return latestByDate(
        dailyBriefings.filter((briefing) => briefing.userId === userId),
        "generatedAt"
      );
    },

    async createDailyBriefing(briefing) {
      dailyBriefings.push(briefing);
      options.onChange?.();

      return briefing;
    },
  };
}
