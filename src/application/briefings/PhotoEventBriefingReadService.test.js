import { describe, expect, it, vi } from "vitest";
import { createPhotoEventBriefingReadService } from "./PhotoEventBriefingReadService.js";

const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";

describe("Photo Event briefing read service", () => {
  it("resolves persisted historical media without rebuilding the event", async () => {
    const store = { load: vi.fn(async () => ({
      artifact: { id: "event", briefing: { photoEventNarrative: { activeViews: [{ imageHref: "/api/private-evidence/founder/evidence/uploads/front.jpg", previousImageHref: "media://media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57" }] } } },
      goal: { completion: { status: "complete" } },
      mediaObjects: [{ id: mediaId, original_filename: "front.jpg", provenance: { sourceRelativePath: "evidence/uploads/front.jpg" }, state: "verified" }],
    })) };
    const result = await createPhotoEventBriefingReadService({ store }).getPhotoEvent({ sessionId: "session" });
    expect(result.narrative.activeViews[0]).toMatchObject({
      imageHref: `/api/private-evidence/media/${mediaId}`,
      previousImageHref: `/api/private-evidence/media/${mediaId}`,
    });
    expect(result.completion).toEqual({ status: "complete" });
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it("fails closed when persisted media has no unambiguous provider mapping", async () => {
    const service = createPhotoEventBriefingReadService({ store: { load: async () => ({ artifact: { id: "event", briefing: { photoEventNarrative: { activeViews: [{ imageHref: "/api/private-evidence/founder/missing.jpg" }] } } }, goal: null, mediaObjects: [] }) } });
    expect((await service.getPhotoEvent({ sessionId: "session" })).narrative.activeViews[0].imageHref).toBeNull();
  });
});
