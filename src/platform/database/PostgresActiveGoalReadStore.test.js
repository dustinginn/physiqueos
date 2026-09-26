import { describe, expect, it, vi } from "vitest";
import { createPostgresActiveGoalReadStore } from "./PostgresActiveGoalReadStore.js";

describe("PostgresActiveGoalReadStore", () => {
  it("loads only screen inputs without compatibility-runtime reconstruction", async () => {
    const complete = vi.fn();
    const query = vi.fn(async (sql) => ({ rows: sql.includes("collection_name=$2") ? [] : [] }));
    const store = createPostgresActiveGoalReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    });
    const result = await store.load();
    expect(result).toMatchObject({ goal: null, protocols: [], canonicalEvidence: [] });
    expect(query).toHaveBeenCalledTimes(10);
    expect(query.mock.calls.some(([sql]) => sql.includes("canonicalEvidenceObjects") && sql.includes("evidence_type"))).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "goals.active.build-lean-mass",
      queryCount: 10,
      compatibilityRuntimeLoadCount: 0,
    }));
  });

  it("reads the latest published V3 briefing with one bounded, owner-scoped, publication-ordered query", async () => {
    const published = { id: "midweek_published", cadence: "midweek", generatedAt: "2026-09-23T10:01:29.328Z",
      confidencePublication: { schemaVersion: "briefing_confidence_binding_v3" }, lifecycle: { generationStatus: "completed" },
      briefing: { narrativeV3: {} } };
    const failed = { ...published, id: "weekly_failed", cadence: "weekly", generatedAt: "2026-09-27T10:00:00.000Z", lifecycle: { generationStatus: "failed" } };
    const query = vi.fn(async (sql) => ({ rows: sql.includes("canonical_briefing_records")
      ? [{ payload: failed, version: 1 }, { payload: published, version: 1 }] : [] }));
    const store = createPostgresActiveGoalReadStore({ pool: { query }, ownerUserId: "owner" });
    const result = await store.load();
    const briefingCall = query.mock.calls.find(([sql]) => sql.includes("canonical_briefing_records"));
    expect(briefingCall[1]).toEqual(["owner"]);
    expect(briefingCall[0]).toMatch(/owner_user_id=\$1/);
    expect(briefingCall[0]).toMatch(/briefing_confidence_binding_v3/);
    expect(briefingCall[0]).toMatch(/DESC,record_id DESC\s+LIMIT 5/);
    expect(result.latestBriefing.id).toBe("midweek_published");
  });
});
