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

  it("loads one exact Confidence analysis without reconstructing the runtime", async () => {
    const complete = vi.fn();
    const query = vi.fn(async () => ({ rows: [{ payload: { id: "analysis-one" }, version: 2 }] }));
    const result = await createPostgresBriefingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
      onComplete: complete,
    }).getAnalysis({ analysisId: "analysis-one" });

    expect(result).toEqual({ id: "analysis-one", version: 2 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "confidence.analysis",
      queryCount: 1,
      compatibilityRuntimeLoadCount: 0,
    }));
  });

  it("loads only the assessment referenced by a briefing", async () => {
    const query = vi.fn(async (sql, values) => {
      if (sql.includes("canonical_briefing_records")) return { rows: [{
        payload: { id: "monthly", briefing: { confidenceAssessmentId: "assessment-one" } },
        version: 1,
      }] };
      if (values?.[2] === "goal_confidence_history_v2|assessment-one") {
        return { rows: [{ payload: { assessment: { id: "assessment-one" } }, version: 1 }] };
      }
      if (sql.includes("canonical_runtime_metadata")) return { rows: [{ revision: 1 }] };
      return { rows: [] };
    });
    const result = await createPostgresBriefingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner",
    }).getArtifact({ artifactId: "monthly" });
    expect(result.confidenceAssessment).toEqual({ id: "assessment-one" });
    const confidenceCall = query.mock.calls.find(([, values]) =>
      values?.includes("goal_confidence_history_v2|assessment-one"));
    expect(confidenceCall).toBeDefined();
    expect(confidenceCall[0]).toContain("record_id=$3");
  });
});
