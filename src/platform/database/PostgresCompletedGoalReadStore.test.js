import { describe, expect, it, vi } from "vitest";
import { createPostgresCompletedGoalReadStore } from "./PostgresCompletedGoalReadStore.js";

describe("PostgresCompletedGoalReadStore", () => {
  it("uses two bounded queries and zero compatibility-runtime loads", async () => {
    const query = vi.fn(async (sql) => ({ rows: sql.includes("completed_goal_inputs") ? [
      { record_kind: "goal", record_id: "goal_visible_abs_at_rest", version: 1, payload: { id: "goal_visible_abs_at_rest", status: "completed" } },
      { record_kind: "goal", record_id: "active", version: 2, payload: { id: "active", status: "active", primary: true } },
      { record_kind: "photo", record_id: "photo", version: 1, payload: { id: "photo", imagePath: "private/founder/photos/front.jpeg", date: "2026-05-21", view: "front", pose: "relaxed", relatedGoalIds: ["goal_visible_abs_at_rest"] } },
    ] : [] }));
    const complete = vi.fn();
    const store = createPostgresCompletedGoalReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    });

    const result = await store.load();

    expect(query).toHaveBeenCalledTimes(2);
    expect(result.currentGoal.id).toBe("active");
    expect(result.progressPhotos).toHaveLength(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "goals.completed.visible-abs",
      queryCount: 2,
      compatibilityRuntimeLoadCount: 0,
    }));
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("canonical_goal_records");
    expect(sql).toContain("canonical_evidence_records");
    expect(sql).toContain("canonical_briefing_records");
    expect(sql).toContain("canonical_media_objects");
    expect(sql).not.toContain("loadCanonicalRuntime");
    const mediaCall = query.mock.calls.find(([text]) => text.includes("canonical_media_objects"));
    expect(mediaCall[1][2]).toContain("photos/front.jpeg");
    expect(mediaCall[1][3]).toEqual(["front.jpeg"]);
  });
});
