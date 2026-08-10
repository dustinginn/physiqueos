import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createHomeBriefingService,
  dedupeHomeBriefingCards,
  reconcileDailyBriefingAction,
  resolveHomeBriefingSlots,
} from "./HomeBriefingService";

const homeSource = fs.readFileSync(
  new URL("./HomeBriefingService.js", import.meta.url),
  "utf8"
);
const dailyRoute = fs.readFileSync(
  new URL("../../app/briefing/daily/page.js", import.meta.url),
  "utf8"
);
const reviewRoute = fs.readFileSync(
  new URL("../../app/briefings/review/[artifactId]/page.js", import.meta.url),
  "utf8"
);

describe("Home briefing availability", () => {
  it("suppresses the time-derived Daily CTA when the exact previous-day artifact is missing", () => {
    expect(reconcileDailyBriefingAction(actionPlan(), null)).toMatchObject({
      currentAction: null,
    });
  });

  it("routes a valid Daily CTA to the exact artifact", () => {
    expect(reconcileDailyBriefingAction(actionPlan(), {
      id: "daily_briefing_20260723",
    })).toMatchObject({
      currentAction: {
        label: "Open Daily Briefing",
        href: "/briefings/review/daily_briefing_20260723",
      },
    });
  });

  it("does not alter unrelated current actions", () => {
    const plan = {
      ...actionPlan(),
      currentAction: { id: "weight", label: "Morning Weight", href: "/check-in/morning" },
    };
    expect(reconcileDailyBriefingAction(plan, null)).toBe(plan);
  });

  it("keeps Home rendering read-only and checks the exact previous-day window", () => {
    expect(homeSource).toContain("createPreviousDayEvidenceWindow");
    expect(homeSource).toContain("getBriefingByEvidenceWindow");
    expect(homeSource).not.toContain("createMidweekBriefingService");
    expect(homeSource).not.toContain("generateForCurrentWindow");
  });

  it("keeps briefing GET routes read-only and exact artifact review type-safe", () => {
    expect(dailyRoute).not.toMatch(/\.createDailyBriefing\(|generateForCurrentWindow|\.publish\(|backfill/i);
    expect(reviewRoute).toContain("resolveBriefingReviewArtifact");
    expect(reviewRoute).toContain('artifact.cadence === "midweek"');
    expect(reviewRoute).not.toMatch(/\.createDailyBriefing\(|generateForCurrentWindow|\.publish\(/i);
  });

  it.each([
    ["Weekly", weeklyArtifact(), "weekly"],
    ["Midweek", midweekArtifact(), "midweek"],
    ["Monthly", monthlyArtifact(), "monthly"],
  ])("keeps an active Photo Event separate from the current %s", (_label, cadenceArtifact, cadence) => {
    const homeDate = cadenceArtifact.evidenceWindow.briefingDate;
    const slots = resolveHomeBriefingSlots({
      eventArtifact: photoEvent({
        generatedAt: `${homeDate}T17:30:00Z`,
        briefing: { photoEventNarrative: { eventDate: homeDate } },
      }),
      [`${cadence}Artifact`]: cadenceArtifact,
      now: new Date(homeDate + "T18:00:00Z"),
      timeZone: "America/Los_Angeles",
    });
    expect(slots.activeEventSelection).toMatchObject({
      briefingType: "event",
      artifact: { id: "photo-event" },
    });
    expect(slots.currentCadenceSelection).toMatchObject({
      briefingType: cadence,
      artifact: { id: `${cadence}-briefing` },
    });
  });

  it("preserves event-only, cadence-only, consumed-event, and DEXA behavior", () => {
    expect(resolveHomeBriefingSlots({
      eventArtifact: photoEvent(),
      now: new Date("2026-07-22T18:00:00Z"),
      timeZone: "America/Los_Angeles",
    })).toMatchObject({
      activeEventSelection: { briefingType: "event" },
      currentCadenceSelection: { briefingType: "none" },
    });
    expect(resolveHomeBriefingSlots({
      weeklyArtifact: weeklyArtifact(),
      now: new Date("2026-07-26T18:00:00Z"),
      timeZone: "America/Los_Angeles",
    })).toMatchObject({
      activeEventSelection: null,
      currentCadenceSelection: { briefingType: "weekly" },
    });
    expect(resolveHomeBriefingSlots({
      eventArtifact: photoEvent({
        generatedAt: "2026-07-26T17:30:00Z",
        briefing: { photoEventNarrative: { eventDate: "2026-07-26" } },
        lifecycle: { consumedAt: "2026-07-26T19:00:00Z" },
      }),
      weeklyArtifact: weeklyArtifact(),
      now: new Date("2026-07-26T18:00:00Z"),
      timeZone: "America/Los_Angeles",
    })).toMatchObject({
      activeEventSelection: null,
      currentCadenceSelection: { briefingType: "weekly" },
    });
    expect(resolveHomeBriefingSlots({
      eventArtifact: photoEvent({
        trigger: { evidenceType: "dexa", evidenceId: "scan" },
        briefing: { dexaEventNarrative: { hero: { body: "DEXA ready" } } },
      }),
      weeklyArtifact: weeklyArtifact(),
      now: new Date("2026-07-26T18:00:00Z"),
      timeZone: "America/Los_Angeles",
    })).toMatchObject({
      activeEventSelection: { briefingType: "event" },
      currentCadenceSelection: { briefingType: "weekly" },
    });
  });

  it("defensively suppresses duplicate briefing cards while preserving event-first order", () => {
    const event = { id: "event", sectionLabel: "Event Briefing" };
    const weekly = { id: "weekly", sectionLabel: "Weekly Briefing" };
    expect(dedupeHomeBriefingCards([event, weekly, { ...event }])).toEqual([event, weekly]);
  });

  it("projects late Photo Event and current Weekly into separate event-first Home slots", async () => {
    const event = {
      ...photoEvent(),
      id: "event_briefing_progress_photo_photo_session_user_founder_001_2026-08-08",
      generatedAt: "2026-08-10T02:08:18.679Z",
      trigger: { evidenceType: "photo_session", evidenceId: "photo_session_user_founder_001_2026-08-08" },
      briefing: { photoEventNarrative: { eventDate: "2026-08-08", hero: { body: "Photo update" } } },
    };
    const weekly = cadenceArtifact("weekly", "2026-08-09", "2026-08-02", "2026-08-08");
    const model = await createHomeBriefingService({
      repositories: homeRepositories({ event, weekly }),
      now: () => new Date("2026-08-10T02:30:00Z"),
    }).getHomeBriefing("user");

    expect(model.activeEventBriefing).toMatchObject({
      id: event.id,
      sectionLabel: "Event Briefing",
      href: "/briefings/photo/photo_session_user_founder_001_2026-08-08",
    });
    expect(model.currentCadenceBriefing).toMatchObject({
      id: weekly.id,
      sectionLabel: "Weekly Briefing",
      href: `/briefings/review/${weekly.id}`,
    });
    expect(model.briefingCards.map((card) => card.id)).toEqual([event.id, weekly.id]);
    expect(model.latestAnalysis.id).toBe(event.id);
  });
});

function actionPlan() {
  return {
    currentAction: {
      id: "daily-briefing",
      label: "Open Daily Briefing",
      href: "/briefing/daily",
    },
    upcomingActions: [],
    deferredActions: [],
    expiredActions: [],
  };
}

function photoEvent(overrides = {}) {
  return {
    id: "photo-event",
    artifactType: "event",
    cadence: "event",
    generatedAt: "2026-07-22T18:00:00Z",
    trigger: { evidenceType: "photo_session", evidenceId: "session" },
    lifecycle: {},
    briefing: { photoEventNarrative: { eventDate: "2026-07-22" } },
    ...overrides,
  };
}

function weeklyArtifact() {
  return cadenceArtifact("weekly", "2026-07-26", "2026-07-19", "2026-07-25");
}

function midweekArtifact() {
  return cadenceArtifact("midweek", "2026-07-22", "2026-07-19", "2026-07-21");
}

function monthlyArtifact() {
  return cadenceArtifact("monthly", "2026-08-01", "2026-07-01", "2026-07-31");
}

function cadenceArtifact(cadence, briefingDate, startDate, endDate) {
  return {
    id: `${cadence}-briefing`,
    artifactType: "scheduled",
    cadence,
    generatedAt: `${briefingDate}T17:00:00Z`,
    deliveryDate: cadence === "monthly" ? briefingDate : undefined,
    evidenceWindow: {
      id: `${cadence}:${startDate}:${endDate}:America/Los_Angeles`,
      cadence,
      closed: true,
      briefingDate,
      deliveryDate: cadence === "monthly" ? briefingDate : undefined,
      startDate,
      endDate,
    },
    lifecycle: { generationStatus: "completed" },
    briefing: cadence === "midweek"
      ? { hero: { summary: "Week so far" } }
      : cadence === "monthly"
        ? { monthlyPresentation: { hero: { thesis: "Completed month" } } }
        : { weeklyNarrative: { cards: { hero: { body: "Completed week" } } } },
  };
}

function homeRepositories({ event, weekly }) {
  const goal = { id: "goal", userId: "user", type: "general", title: "Current Goal", status: "active", primary: true };
  return {
    users: { getUserById: async () => ({ id: "user", firstName: "Founder", timeZone: "America/Los_Angeles" }) },
    goals: { listGoals: async () => [goal], getActiveGoal: async () => goal },
    dailyCheckIns: { listCheckIns: async () => [] },
    dexaScans: { listDEXAScans: async () => [] },
    weights: { listWeightEntries: async () => [], getLatestWeightEntry: async () => null },
    protocols: { listActiveProtocols: async () => [] },
    reminders: { listReminders: async () => [] },
    operatingPlan: { getOperatingPlan: async () => null },
    executionItems: { listExecutionItems: async () => [] },
    nutritionContext: { getNutritionContext: async () => null },
    progressPhotos: { listPhotos: async () => [{ id: "photo", userId: "user", capturedAt: "2026-08-08" }] },
    analyses: { getLatestAnalysis: async () => null, listAnalyses: async () => [] },
    dailyBriefings: {
      getLatestScheduledDailyBriefing: async () => null,
      getLatestMidweekBriefing: async () => null,
      getLatestWeeklyBriefing: async () => weekly,
      getLatestMonthlyBriefing: async () => null,
      getLatestActiveEventBriefing: async () => event,
      getBriefingByEvidenceWindow: async () => null,
    },
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] },
    protocolVersions: { getCurrentVersion: async () => null },
  };
}
