import { createEvidenceTimelineItems } from "../../domain/services/EvidenceTimelineService.js";

export function createEvidenceTimelineReadService({ store } = {}) {
  if (!store?.load) throw new Error("Evidence Timeline requires a read store.");
  return Object.freeze({
    async getPage({ limit = 120 } = {}) {
      const boundedLimit = Math.min(1000, Math.max(1, Number(limit) || 120));
      const items = createEvidenceTimelineItems(await store.load());
      return Object.freeze({
        items: Object.freeze(items.slice(0, boundedLimit)),
        hasMore: items.length > boundedLimit,
        totalCount: items.length,
        limit: boundedLimit,
      });
    },
  });
}
