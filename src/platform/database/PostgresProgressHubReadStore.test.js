import { describe, expect, it, vi } from "vitest";
import { createPostgresProgressHubReadStore } from "./PostgresProgressHubReadStore.js";

describe("PostgreSQL Progress hub read store", () => {
  it("uses six bounded owner-scoped queries and zero compatibility runtime loads", async () => {
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
        store.getProgressHubPhotoInputs(),
        store.listProtocols(),
        store.getNutritionContext(),
        store.listProgressHubCanonicalEvidenceObjects(),
      ]);
    });

    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.every(([, values]) => values[0] === "owner-one"))
      .toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "progress.hub",
      queryCount: 6,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    }));
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("ANY($2::text[])");
    expect(sql).toContain("'photo_session'");
    expect(sql).toContain("'progressPhotos'");
    expect(query.mock.calls.some(([, values]) =>
      Array.isArray(values?.[1]) && values[1].includes("photo_session")
    )).toBe(false);
    expect(sql).not.toContain("loadCanonicalRuntime");
  });
});
