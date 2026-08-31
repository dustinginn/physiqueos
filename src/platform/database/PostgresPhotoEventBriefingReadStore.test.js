import { describe, expect, it, vi } from "vitest";
import { createPostgresPhotoEventBriefingReadStore } from "./PostgresPhotoEventBriefingReadStore.js";

describe("PostgreSQL Photo Event briefing read store", () => {
  it("uses three bounded queries and no compatibility runtime", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresPhotoEventBriefingReadStore({ pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 }, ownerUserId: "owner", onComplete: complete });
    await store.load({ sessionId: "photo-session" });
    expect(query).toHaveBeenCalledTimes(3);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ queryCount: 3, compatibilityRuntimeLoadCount: 0 }));
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("canonical_briefing_records");
    expect(sql).toContain("canonical_media_objects");
    expect(sql).not.toContain("loadCanonicalRuntime");
  });
});
