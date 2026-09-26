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

  it("reads the latest published V3 briefing: bounded metadata candidates, then one full artifact", async () => {
    const meta = (id, cadence, generatedAt, generationStatus) => ({ record_id: id, id, cadence, generatedAt,
      lifecycle: { generationStatus }, confidencePublication: { schemaVersion: "briefing_confidence_binding_v3" } });
    const published = { id: "midweek_published", cadence: "midweek", generatedAt: "2026-09-23T10:01:29.328Z",
      confidencePublication: { schemaVersion: "briefing_confidence_binding_v3" }, lifecycle: { generationStatus: "completed" },
      briefing: { narrativeV3: {} } };
    const query = vi.fn(async (sql, values) => {
      if (sql.includes("record_id=$2")) return { rows: values[1] === "midweek_published" ? [{ payload: published, version: 1 }] : [] };
      if (sql.includes("canonical_briefing_records")) return { rows: [
        meta("weekly_failed", "weekly", "2026-09-27T10:00:00.000Z", "failed"),
        meta("midweek_published", "midweek", "2026-09-23T10:01:29.328Z", "completed")] };
      return { rows: [] };
    });
    const store = createPostgresActiveGoalReadStore({ pool: { query }, ownerUserId: "owner" });
    const result = await store.load();
    const candidates = query.mock.calls.find(([sql]) => sql.includes("canonical_briefing_records") && sql.includes("LIMIT 5"));
    expect(candidates[1]).toEqual(["owner"]);
    expect(candidates[0]).toMatch(/owner_user_id=\$1/);
    expect(candidates[0]).toMatch(/briefing_confidence_binding_v3/);
    expect(candidates[0]).not.toMatch(/SELECT payload,version/);
    expect(query.mock.calls.filter(([sql]) => sql.includes("record_id=$2")).map(([, values]) => values)).toEqual([["owner", "midweek_published"]]);
    expect(result.latestBriefing.id).toBe("midweek_published");
  });
});
