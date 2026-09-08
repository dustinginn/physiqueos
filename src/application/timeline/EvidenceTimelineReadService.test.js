import { describe, expect, it } from "vitest";
import { createEvidenceTimelineReadService } from "./EvidenceTimelineReadService.js";

describe("EvidenceTimelineReadService", () => {
  it("bounds the initial presentation while preserving an explicit older-history path", async () => {
    const weights = Array.from({ length: 125 }, (_, index) => ({
      id: `weight-${index}`,
      measuredAt: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
      weight: { value: 180, unit: "lb" },
    }));
    const page = await createEvidenceTimelineReadService({
      store: { load: async () => ({ weights }) },
    }).getPage();

    expect(page.items).toHaveLength(120);
    expect(page.hasMore).toBe(true);
    expect(page.totalCount).toBe(125);
  });
});
