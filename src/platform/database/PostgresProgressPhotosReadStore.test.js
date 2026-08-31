import { describe, expect, it, vi } from "vitest";
import { createPostgresProgressPhotosReadStore } from "./PostgresProgressPhotosReadStore.js";

describe("PostgreSQL Progress Photos read store", () => {
  it("uses seven bounded owner-scoped queries and no compatibility runtime", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresProgressPhotosReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });
    await store.run("progress.photos", async () => Promise.all([
      store.getUser(),
      store.listGoals(),
      store.listWeightEntries(),
      store.getPhotoInputs(),
      store.listPhotoAnalyses(),
      store.listPhotoBriefings(),
      store.listMediaObjects(),
    ]));
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls.every(([, values]) => values[0] === "owner-one")).toBe(true);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "progress.photos",
      queryCount: 7,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    }));
    const sql = query.mock.calls.map(([text]) => String(text)).join("\n");
    expect(sql).toContain("canonical_media_objects");
    expect(sql).toContain("'photo_session','progress_photo'");
    expect(sql).not.toContain("loadCanonicalRuntime");
  });
});
