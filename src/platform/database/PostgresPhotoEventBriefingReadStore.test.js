import { describe, expect, it, vi } from "vitest";
import { createPostgresPhotoEventBriefingReadStore } from "./PostgresPhotoEventBriefingReadStore.js";

describe("PostgreSQL Photo Event briefing read store", () => {
  it("uses three bounded queries and no compatibility runtime", async () => {
    const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
    const query = vi.fn(async (sql) => ({ rows: sql.includes("canonical_briefing_records") ? [{ payload: { briefing: { photoEventNarrative: { activeViews: [{ imageHref: `media://${mediaId}`, previousImageHref: "/api/private-evidence/founder/evidence/uploads/front.jpg" }] } } } }] : [] }));
    const complete = vi.fn();
    const store = createPostgresPhotoEventBriefingReadStore({ pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 }, ownerUserId: "owner", onComplete: complete });
    await store.load({ sessionId: "photo-session" });
    expect(query).toHaveBeenCalledTimes(3);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ queryCount: 3, compatibilityRuntimeLoadCount: 0 }));
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("canonical_briefing_records");
    expect(sql).toContain("canonical_media_objects");
    expect(sql).not.toContain("loadCanonicalRuntime");
    const mediaCall = query.mock.calls.find(([text]) => text.includes("canonical_media_objects"));
    expect(mediaCall[1][1]).toEqual([mediaId]);
    expect(mediaCall[1][2]).toContain("evidence/uploads/front.jpg");
    expect(mediaCall[1][3]).toEqual(["front.jpg"]);
  });
});
