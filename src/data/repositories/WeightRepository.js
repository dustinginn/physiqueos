import { seedWeightEntries } from "../seed/weights";
import { byDateRange, byUserId, latestByDate } from "./repositoryUtils";

export function createWeightRepository(weightEntries = [], options = {}) {
  return {
    async listWeightEntries(userId, range = {}) {
      return byDateRange(byUserId(weightEntries, userId), "measuredAt", range);
    },

    async getLatestWeightEntry(userId) {
      return latestByDate(byUserId(weightEntries, userId), "measuredAt");
    },

    async addWeightEntry(entry) {
      const existingIndex = weightEntries.findIndex(
        (item) =>
          item.userId === entry.userId &&
          getDateKey(item.measuredAt) === getDateKey(entry.measuredAt)
      );

      if (existingIndex >= 0) {
        weightEntries[existingIndex] = entry;
      } else {
        weightEntries.push(entry);
      }

      options.onChange?.();

      return entry;
    },

    async importWeightEntries(entries, source) {
      const importedEntries = entries.map((entry) => ({
        ...entry,
        source,
      }));

      weightEntries.push(...importedEntries);
      options.onChange?.();

      return importedEntries;
    },
  };
}

export const WeightRepository = createWeightRepository(seedWeightEntries);

function getDateKey(value) {
  return value?.slice(0, 10) ?? "";
}
