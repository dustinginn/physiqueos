import { describe, expect, it, vi } from "vitest";
import { resolveHomeBriefingSelection } from "./HomeBriefingRoutingService";
import { createDailyBriefingService } from "./DailyBriefingService";
import { mapBriefingCard } from "./HomeBriefingService";

const daily = { id: "daily", cadence: "daily", briefing: { version: "daily-briefing-v29-voice-calibration" } };
const weekly = { id: "weekly", cadence: "weekly", evidenceWindow: { startDate: "2026-07-05", endDate: "2026-07-11" } };
const photoEvent = { id: "event", artifactType: "event", generatedAt: "2026-07-12T18:00:00Z", trigger: { evidenceType: "photo_session", evidenceId: "session" }, lifecycle: {}, briefing: { photoEventNarrative: { eventDate: "2026-07-12" } } };
const dexaEvent = { id: "dexa-event", artifactType: "event", generatedAt: "2026-07-12T19:00:00Z", trigger: { evidenceType: "dexa", evidenceId: "dexa_2026_06_20" }, lifecycle: {}, briefing: { dexaEventNarrative: { scanDate: "2026-06-20" } } };
function select(now, overrides = {}) { return resolveHomeBriefingSelection({ dailyArtifact: daily, weeklyArtifact: weekly, now, timeZone: "America/Los_Angeles", ...overrides }); }

describe("Home briefing routing", () => {
  it("selects Weekly on Sunday", () => expect(select(new Date("2026-07-12T18:00:00Z")).briefingType).toBe("weekly"));
  it("links Sunday to the direct Weekly route", () => expect(select(new Date("2026-07-12T18:00:00Z")).href).toBe("/briefings/weekly"));
  it("selects Daily Monday through Saturday", () => expect(select(new Date("2026-07-13T18:00:00Z")).briefingType).toBe("daily"));
  it("links weekdays to the direct Daily route", () => expect(select(new Date("2026-07-13T18:00:00Z")).href).toBe("/briefing/daily"));
  it("uses Founder local time across the UTC Sunday boundary", () => expect(select(new Date("2026-07-12T06:30:00Z")).briefingType).toBe("daily"));
  it("switches after local midnight without a UTC off-by-one", () => expect(select(new Date("2026-07-12T07:30:00Z")).briefingType).toBe("weekly"));
  it("gives an active same-day Photo Event precedence", () => expect(select(new Date("2026-07-12T18:00:00Z"), { eventArtifact: photoEvent }).href).toBe("/briefings/photo/session"));
  it("routes an active DEXA Event through its stable direct route", () => expect(select(new Date("2026-07-12T18:00:00Z"), { eventArtifact: dexaEvent }).href).toBe("/briefings/dexa/dexa_2026_06_20"));
  it("resumes scheduled cadence after an event is consumed", () => expect(select(new Date("2026-07-12T18:00:00Z"), { eventArtifact: { ...photoEvent, lifecycle: { consumedAt: "x" } } }).briefingType).toBe("weekly"));
  it("does not promote an old unconsumed photo event", () => expect(select(new Date("2026-07-13T18:00:00Z"), { eventArtifact: photoEvent }).briefingType).toBe("daily"));
  it("keeps a missing Sunday Weekly clearly unavailable without relabeling Daily", () => { const result = select(new Date("2026-07-12T18:00:00Z"), { weeklyArtifact: null }); expect(result.reason).toBe("scheduled_sunday_weekly_unavailable"); expect(result.artifact).toBeNull(); });
  it("builds the Sunday Home card from the selected Weekly artifact", () => {
    const selection = select(new Date("2026-07-12T18:00:00Z"));
    const card = mapBriefingCard({ selection, dexaScans: [{}], progressPhotos: [], weightEntries: [], freshness: null, latestAnalysis: null, dailyEvent: null });
    expect(card.sectionLabel).toBe("Weekly Briefing"); expect(card.href).toBe("/briefings/weekly"); expect(card.id).toBe("weekly");
  });
  it("presents a missing eligible Daily as a real action with an explicit historical fallback", () => {
    const expectation = {
      artifactId: "daily_briefing_20260713",
      dailyEligible: true,
      evidenceThroughDate: "2026-07-13",
    };
    const card = mapBriefingCard({
      selection: { artifact: null, briefingType: "daily" },
      dexaScans: [{}],
      progressPhotos: [],
      weightEntries: [],
      freshness: { status: "missing" },
      latestAnalysis: null,
      dailyEvent: null,
      expectation,
      generationArtifact: null,
      historicalDailyBriefing: { id: "daily_briefing_20260712" },
    });
    expect(card).toMatchObject({
      id: "daily_briefing_20260713",
      freshnessState: "eligible_missing",
      actionKind: "generate_daily",
      href: null,
      historicalFallback: {
        href: "/briefings/review/daily_briefing_20260712",
        label: "View previous briefing",
      },
    });
    expect(`${card.title} ${card.prompt}`).not.toContain("Jul 12");
  });
  it("keeps direct Daily reads cadence-specific and non-mutating", async () => {
    const create = vi.fn(); const consume = vi.fn();
    const repositories = { users: { getCurrentUser: async () => ({ id: "u", timeZone: "America/Los_Angeles" }) }, dailyBriefings: { getBriefingByEvidenceWindow: vi.fn(async () => null), getLatestScheduledDailyBriefing: vi.fn(async () => daily), createDailyBriefing: create, markBriefingConsumed: consume } };
    const result = await createDailyBriefingService({ repositories, now: () => new Date("2026-07-12T18:00:00Z") }).getPersistedDailyBriefing();
    expect(result).toBeNull(); expect(create).not.toHaveBeenCalled(); expect(consume).not.toHaveBeenCalled();
  });
});
