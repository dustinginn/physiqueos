import { byDateRange, byUserId } from "./repositoryUtils";
import {
  canonicalWeightDate,
  canonicalWeightEntries,
  prepareCanonicalWeightCorrection,
} from "../../domain/weight/canonicalWeight";

export function createWeightRepository(weightEntries = [], options = {}) {
  return {
    async listWeightEntries(userId, range = {}) {
      return byDateRange(
        canonicalWeightEntries(byUserId(weightEntries, userId)),
        "measuredAt",
        range
      );
    },

    async getLatestWeightEntry(userId) {
      return canonicalWeightEntries(byUserId(weightEntries, userId)).at(-1) ?? null;
    },

    async addWeightEntry(entry) {
      const matchingEntries = weightEntries.filter(
        (item) =>
          item.userId === entry.userId &&
          canonicalWeightDate(item.measuredAt) === canonicalWeightDate(entry.measuredAt)
      );

      if (matchingEntries.length > 0) {
        for (let index = weightEntries.length - 1; index >= 0; index -= 1) {
          const item = weightEntries[index];

          if (
            item.userId === entry.userId &&
            canonicalWeightDate(item.measuredAt) === canonicalWeightDate(entry.measuredAt)
          ) {
            weightEntries.splice(index, 1);
          }
        }

        weightEntries.push(prepareCanonicalWeightCorrection(entry, matchingEntries));
      } else {
        weightEntries.push(prepareCanonicalWeightCorrection(entry));
      }

      options.onChange?.();

      return weightEntries.find((item) =>
        item.userId === entry.userId &&
        canonicalWeightDate(item.measuredAt) === canonicalWeightDate(entry.measuredAt)
      );
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

export const WeightRepository = createWeightRepository([]);
