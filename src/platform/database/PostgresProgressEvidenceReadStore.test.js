import { describe, expect, it, vi } from "vitest";
import { createPostgresProgressEvidenceReadStore } from "./PostgresProgressEvidenceReadStore.js";

describe("PostgreSQL Progress evidence read store", () => {
  it.each([
    ["progress.evidence.weight", ["getUser", "listGoals", "listWeightEntries", "listDEXAScans"], 4],
    ["progress.evidence.nutrition", ["getUser", "listGoals", "getNutritionContext", "listCanonicalNutritionEvidenceObjects"], 4],
    ["progress.evidence.activity", ["getUser", "listGoals", "listCanonicalActivityAndTrainingEvidenceObjects"], 3],
  ])("uses bounded queries for %s", async (readModel, methods, expectedQueries) => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresProgressEvidenceReadStore({
      pool: { query, totalCount: 2, idleCount: 2, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    await store.run(readModel, () => Promise.all(methods.map((method) => store[method]())));

    expect(query).toHaveBeenCalledTimes(expectedQueries);
    expect(query.mock.calls.every(([, values]) => values[0] === "owner-one")).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel,
      queryCount: expectedQueries,
      rowCount: 0,
      payloadBytes: expectedQueries * 2,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 2, idleCount: 2, waitingCount: 0 },
    }));
  });

  it("filters canonical evidence to only the requested domains", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresProgressEvidenceReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
    });
    await store.listCanonicalNutritionEvidenceObjects();
    await store.listCanonicalActivityAndTrainingEvidenceObjects();

    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("evidence_type')='nutrition'");
    expect(sql).toContain("IN ('activity_day','training')");
    expect(sql).not.toMatch(/photo_session|dexa|analyses|briefing/);
    expect(sql).not.toContain("loadCanonicalRuntime");
  });
});
