import { seedDEXAScans } from "../seed/dexaScans";
import { byUserId, latestByDate } from "./repositoryUtils";

export function createDEXARepository(dexaScans = [], options = {}) {
  return {
    async listDEXAScans(userId) {
      return byUserId(dexaScans, userId);
    },

    async getLatestDEXAScan(userId) {
      return latestByDate(byUserId(dexaScans, userId), "measuredAt");
    },

    async addDEXAScan(scan) {
      dexaScans.push(scan);
      options.onChange?.();

      return scan;
    },

    async attachDEXAFile(scanId, file) {
      const scan = dexaScans.find((item) => item.id === scanId);

      if (!scan) return null;

      scan.sourceFileId = file?.id ?? null;
      options.onChange?.();

      return scan;
    },
  };
}

export const DEXARepository = createDEXARepository(seedDEXAScans);
