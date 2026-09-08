import { describe, expect, it, vi } from "vitest";
import { createPostgresEvidenceTimelineReadStore } from "./PostgresEvidenceTimelineReadStore.js";

describe("PostgresEvidenceTimelineReadStore", () => {
  it("uses owner-scoped projections for oversized analysis, briefing, and package collections", async () => {
    const query = vi.fn(async (sql) => {
      if (sql.includes("canonical_confidence_records")) return { rows: [{ payload: { id: "analysis", createdAt: "2026-09-01", title: "Training", summary: { recent_pr_count: 2 } } }] };
      if (sql.includes("canonical_briefing_records")) return { rows: [] };
      if (sql.includes("collection_name='evidencePackages'")) return { rows: [] };
      return { rows: [] };
    });
    const pool = { query, totalCount: 1, idleCount: 1, waitingCount: 0 };
    const result = await createPostgresEvidenceTimelineReadStore({ pool, ownerUserId: "owner" }).load();

    expect(result.analyses[0].summary.recent_pr_count).toBe(2);
    expect(query).toHaveBeenCalledTimes(9);
    for (const [, values] of query.mock.calls) expect(values[0]).toBe("owner");
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("jsonb_build_object");
    expect(sql).toContain("collection_name='analyses'");
    expect(sql).not.toContain("SELECT *");
  });
});
