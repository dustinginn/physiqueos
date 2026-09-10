import { describe, expect, it, vi } from "vitest";
import { createPostgresFounderWeightReadStore } from "./PostgresFounderWeightReadStore.js";

describe("PostgresFounderWeightReadStore", () => {
  it("loads only the latest owner-local Weight day without reconstructing the canonical runtime", async () => {
    const query = vi.fn(async () => ({ rows: [{
      payload: { id: "weight_2026_09_09", measuredAt: "2026-09-09", weight: { value: 171.8, unit: "lb" } },
      version: 3,
    }] }));
    const onComplete = vi.fn();
    const result = await createPostgresFounderWeightReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "user_founder_001",
      onComplete,
    }).getLatest();
    expect(result).toMatchObject({ id: "weight_2026_09_09", userId: "user_founder_001", version: 3, weight: { value: 171.8 } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/canonical_checkin_records[\s\S]*collection_name='weightEntries'/);
    expect(query.mock.calls[0][1]).toEqual(["user_founder_001"]);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ queryCount: 1, compatibilityRuntimeLoadCount: 0 }));
  });
});
