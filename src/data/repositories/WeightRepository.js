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
      const matchingEntries = weightEntries.filter(
        (item) =>
          item.userId === entry.userId &&
          getDateKey(item.measuredAt) === getDateKey(entry.measuredAt)
      );

      if (matchingEntries.length > 0) {
        for (let index = weightEntries.length - 1; index >= 0; index -= 1) {
          const item = weightEntries[index];

          if (
            item.userId === entry.userId &&
            getDateKey(item.measuredAt) === getDateKey(entry.measuredAt)
          ) {
            weightEntries.splice(index, 1);
          }
        }

        weightEntries.push({
          ...entry,
          correctionHistory: [
            ...matchingEntries.flatMap((item) => item.correctionHistory ?? []),
            ...matchingEntries
              .filter(
                (item) => JSON.stringify(item.weight) !== JSON.stringify(entry.weight)
              )
              .map((item) => ({
                correctedAt: entry.updatedAt ?? new Date().toISOString(),
                previousEntry: item,
                reason: "Same-day authoritative weight correction.",
              })),
          ],
        });
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
