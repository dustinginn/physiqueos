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
    expect(query).toHaveBeenCalledTimes(9);
    expect(query.mock.calls.some(([sql]) => sql.includes("canonicalEvidenceObjects") && sql.includes("evidence_type"))).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "goals.active.build-lean-mass",
      queryCount: 9,
      compatibilityRuntimeLoadCount: 0,
    }));
  });
});
