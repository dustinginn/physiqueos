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

  it("routes a published DEXA Event by its canonical scan identity", async () => {
    const scanId = "canonical-dexa-scan";
    const artifactId = `dexa_event_${scanId}`;
    const artifacts = [published(artifactId, "2026-08-15T19:02:57Z", {
      artifactType: "event",
      trigger: { evidenceType: "dexa", evidenceId: scanId },
      briefing: {
        dexaEventNarrative: { artifactId, scanId },
        phaseReview: { eligible: true },
      },
      confidencePublication: { assessmentId: "confidence-assessment" },
    })];
    const service = createBriefingReadService({ repositories: {
      dailyBriefings: { listDailyBriefings: async () => artifacts },
    } });

    const [summary] = await service.listBriefings({ principal });
    const detail = await service.getBriefing({ principal, briefingId: artifactId });

    expect(summary).toMatchObject({
      id: artifactId,
      type: "dexa_event",
      href: `/briefings/dexa/${scanId}`,
    });
    expect(detail).toMatchObject({
      id: artifactId,
      href: `/briefings/dexa/${scanId}`,
      presentation: {
        dexaEventNarrative: { artifactId, scanId },
        phaseReview: { eligible: true },
      },
    });
    expect(detail.href).not.toContain("dexa_event_dexa_event_");
    expect(await service.getBriefing({ principal, briefingId: scanId })).toBeNull();
  });

  it("keeps the established routes for non-DEXA briefing types", async () => {
    const artifacts = [
      published("weekly", "2026-08-14T12:00:00Z", { cadence: "weekly" }),
      published("midweek", "2026-08-13T12:00:00Z", { cadence: "midweek" }),
      published("monthly", "2026-08-12T12:00:00Z", { cadence: "monthly" }),
      published("photo", "2026-08-11T12:00:00Z", {
        artifactType: "event",
        trigger: { sessionId: "photo-session" },
        briefing: { photoEventNarrative: {} },
      }),
      published("adaptive", "2026-08-10T12:00:00Z", { cadence: "adaptive_coaching" }),
    ];
    const service = createBriefingReadService({ repositories: {
      dailyBriefings: { listDailyBriefings: async () => artifacts },
    } });

    const summaries = await service.listBriefings({ principal });

    expect(summaries.map(({ id, href }) => [id, href])).toEqual([
      ["weekly", "/briefings/weekly"],
      ["midweek", "/briefings/midweek/preview"],
      ["monthly", "/briefings/monthly/monthly"],
      ["photo", "/briefings/photo/photo-session"],
      ["adaptive", "/briefings/review/adaptive"],
    ]);
  });
});
