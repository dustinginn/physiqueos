import { describe, expect, it, vi } from "vitest";
import { createPostgresPriorityNavigationReadStore } from "./PostgresPriorityNavigationReadStore.js";

describe("PostgresPriorityNavigationReadStore", () => {
  it("uses six targeted provider reads and an exact reminder identity", async () => {
    const complete = vi.fn();
    const query = vi.fn(async () => ({ rows: [] }));
    await createPostgresPriorityNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    }).load({ priorityId: "reminder-one" });
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.some(([sql, values]) => sql.includes("record_id=$3") && values[2] === "reminder-one")).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "priority.detail",
      queryCount: 6,
      compatibilityRuntimeLoadCount: 0,
    }));
  });
});
