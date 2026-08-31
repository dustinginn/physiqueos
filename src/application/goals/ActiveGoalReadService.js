import { composePhaseAwareActiveGoalPreview } from "../../domain/services/PhaseAwareActiveGoalPreviewService.js";

export function createActiveGoalReadService({ store } = {}) {
  if (!store?.load) throw new Error("Active Goal navigation requires a read store.");
  return Object.freeze({
    async getPreview({ currentDate = new Date() } = {}) {
      const input = await store.load({ currentDate });
      return composePhaseAwareActiveGoalPreview({ ...input, currentDate });
    },
  });
}
