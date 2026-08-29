import { describe, expect, it, vi } from "vitest";
import { createPostgresProgressHubReadStore } from "./PostgresProgressHubReadStore.js";

describe("PostgreSQL Progress hub read store", () => {
  it("uses seven bounded owner-scoped queries and zero compatibility runtime loads", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresProgressHubReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    await store.run("progress.hub", async () => {
      await Promise.all([
        store.getOwnerUserId(),
        store.listWeightEntries(),
        store.listDEXAScans(),
        store.listProgressPhotos(),
        store.listProtocols(),
        store.getNutritionContext(),
        store.listProgressHubCanonicalEvidenceObjects(),
        store.listAnalyses(),
      ]);
    });

    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls.every(([, values]) => values[0] === "owner-one"))
      .toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "progress.hub",
      queryCount: 7,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    }));
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("ANY($2::text[])");
    expect(sql).not.toContain("loadCanonicalRuntime");
  });
});
