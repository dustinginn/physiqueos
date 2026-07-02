import { seedDailyCheckIns } from "../seed/dailyCheckIns";
import { byDateRange, byUserId } from "./repositoryUtils";

export function createDailyCheckInRepository(dailyCheckIns = [], options = {}) {
  return {
    async getCheckInForDate(userId, date) {
      return (
        dailyCheckIns.find(
          (checkIn) => checkIn.userId === userId && checkIn.date === date
        ) ?? null
      );
    },

    async listCheckIns(userId, range = {}) {
      return byDateRange(byUserId(dailyCheckIns, userId), "date", range);
    },

    async saveCheckIn(checkIn) {
      const existingIndex = dailyCheckIns.findIndex(
        (item) => item.userId === checkIn.userId && item.date === checkIn.date
      );

      if (existingIndex >= 0) {
        dailyCheckIns[existingIndex] = checkIn;
      } else {
        dailyCheckIns.push(checkIn);
      }

      options.onChange?.();

      return checkIn;
    },

    async updateCheckIn(checkInId, patch) {
      const checkInIndex = dailyCheckIns.findIndex((item) => item.id === checkInId);

      if (checkInIndex < 0) return null;

      dailyCheckIns[checkInIndex] = {
        ...dailyCheckIns[checkInIndex],
        ...patch,
      };

      options.onChange?.();

      return dailyCheckIns[checkInIndex];
    },
  };
}

export const DailyCheckInRepository =
  createDailyCheckInRepository(seedDailyCheckIns);
