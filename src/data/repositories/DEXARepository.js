import { seedDEXAScans } from "../seed/dexaScans";
import { byUserId, latestByDate } from "./repositoryUtils";
import { selectValidDexaScans } from "../../domain/services/DEXAReadModelAdapter";

export function createDEXARepository(dexaScans = [], options = {}) {
  return {
    async listDEXAScans(userId) {
      return selectValidDexaScans(byUserId(dexaScans, userId));
    },

    async listAllDEXAScans(userId) {
      return byUserId(dexaScans, userId);
    },

    async getLatestDEXAScan(userId) {
      return latestByDate(selectValidDexaScans(byUserId(dexaScans, userId)), "measuredAt");
    },

    async addDEXAScan(scan) {
      dexaScans.push(scan);
      options.onChange?.();

      return scan;
    },

    async upsertDEXAScan(scan) {
      const index = dexaScans.findIndex((item) => item.id === scan.id);
      if (index >= 0) dexaScans[index] = scan;
      else dexaScans.push(scan);
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
