import { describe, expect, it, vi } from "vitest";
import { createPostgresBriefingNavigationReadStore } from "./PostgresBriefingNavigationReadStore.js";

describe("PostgresBriefingNavigationReadStore", () => {
  it("projects a bounded Native history page without loading full Briefing artifacts", async () => {
    const query = vi.fn(async () => ({ rows: [{
      record_id: "monthly-august", artifact_id: "monthly-august", artifact_type: "scheduled", cadence: "monthly",
      publication_date: "2026-09-01", evidence_cutoff: "2026-09-01T06:59:59.999Z",
      evidence_window: { id: "august", startDate: "2026-08-01", endDate: "2026-08-31", hugeInternalField: "omit" },
      goal_context: { goalId: "goal-build", phaseId: "phase-2" },
      confidence_publication: { assessmentId: "confidence-62", publisherType: "monthly", intelligenceRunId: "omit" },
      lifecycle: { status: "completed" }, version: 4,
    }] }));
    const result = await createPostgresBriefingNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 }, ownerUserId: "owner",
    }).listNativeHistory({ limit: 20 });
    expect(result).toEqual({
      items: [{ artifactId: "monthly-august", artifactType: "scheduled", cadence: "monthly", label: "Monthly Briefing",
        publicationDate: "2026-09-01", evidenceCutoff: "2026-09-01T06:59:59.999Z",
        evidenceWindow: { id: "august", startDate: "2026-08-01", endDate: "2026-08-31" },
        goalContext: { goalId: "goal-build", phaseId: "phase-2" },
        confidence: { assessmentId: "confidence-62", publisherType: "monthly", publicationCutoff: null },
        status: "completed", detail: { resource: "briefing", artifactId: "monthly-august" }, version: 4 }],
      page: { limit: 20, hasMore: false, nextCursor: null },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toMatch(/SELECT\s+payload[,\s]/i);
    expect(query.mock.calls[0][0]).toContain("payload->>'cadence' IN ('weekly','midweek','monthly')");
    expect(query.mock.calls[0][1]).toEqual(["owner", null, 21]);
  });

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
