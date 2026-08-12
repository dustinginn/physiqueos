import { describe, expect, it } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createBriefingReadService, getGenericBriefingType } from "./BriefingReadService.js";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });
const published = (id, generatedAt, extra = {}) => ({ id, userId: "owner-one", generatedAt, lifecycle: { generationStatus: "published" }, briefing: { title: id }, ...extra });

describe("generic briefing application boundary", () => {
  it("lists every published registry type by recency and excludes previews/failures", async () => {
    const artifacts = [
      published("custom", "2026-08-11T12:00:00Z", { cadence: "adaptive_coaching" }),
      published("photo", "2026-08-10T12:00:00Z", { artifactType: "event", trigger: { type: "progress_photo" }, briefing: { title: "Photo", photoEventNarrative: {} } }),
      { ...published("preview", "2026-08-12T12:00:00Z"), preview: true },
      { ...published("failed", "2026-08-13T12:00:00Z"), lifecycle: { generationStatus: "failed" } },
    ];
    const service = createBriefingReadService({ repositories: { dailyBriefings: { listDailyBriefings: async (userId) => userId === "owner-one" ? artifacts : [] } } });
    const list = await service.listBriefings({ principal });
    expect(list.map((item) => item.id)).toEqual(["custom", "photo"]);
    expect(list.map((item) => item.type)).toEqual(["adaptive_coaching", "photo_event"]);
    expect(await service.getBriefing({ principal, briefingId: "preview" })).toBeNull();
  });

  it("keeps unknown future types generic", () => {
    expect(getGenericBriefingType({ artifactType: "event", trigger: { type: "future_signal" }, briefing: {} })).toBe("future_signal");
  });
});
