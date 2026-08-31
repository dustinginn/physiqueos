import { describe, expect, it, vi } from "vitest";
import { createPostgresBriefingNavigationReadStore } from "./PostgresBriefingNavigationReadStore.js";

describe("PostgresBriefingNavigationReadStore", () => {
  it("loads history with two bounded collection reads", async () => {
    const complete = vi.fn();
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await createPostgresBriefingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    }).listHistory();
    expect(result).toEqual({ artifacts: [], workItems: [] });
    expect(query).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "briefing.history",
      queryCount: 2,
      compatibilityRuntimeLoadCount: 0,
    }));
  });

  it("loads one exact artifact plus bounded live presentation context", async () => {
    const complete = vi.fn();
    const query = vi.fn(async (sql) => ({
      rows: sql.includes("record_id=$3")
        ? [{ payload: { id: "weekly" }, version: 3 }]
        : sql.includes("canonical_runtime_metadata") ? [{ revision: 29 }] : [],
    }));
    const result = await createPostgresBriefingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    }).getArtifact({ artifactId: "weekly" });
    expect(result).toMatchObject({ artifact: { id: "weekly", version: 3 }, revision: 29 });
    expect(query).toHaveBeenCalledTimes(7);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "briefing.artifact",
      queryCount: 7,
      compatibilityRuntimeLoadCount: 0,
    }));
  });
});
