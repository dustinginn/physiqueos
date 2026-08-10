import { describe, expect, it, vi } from "vitest";
import {
  isCadenceArtifactReady,
  isEventActiveForHome,
  resolveHomeBriefingSelection,
} from "./HomeBriefingRoutingService";
import { createDailyBriefingService } from "./DailyBriefingService";

const midweek = artifact("midweek", {
  generatedAt: "2026-07-22T17:04:26.525Z",
  window: {
    id: "midweek:2026-07-19:2026-07-21:America/Los_Angeles",
    briefingDate: "2026-07-22",
    startDate: "2026-07-19",
    endDate: "2026-07-21",
  },
});
const weekly = artifact("weekly", {
  generatedAt: "2026-07-26T16:00:00Z",
  window: {
    id: "weekly:2026-07-19:2026-07-25:America/Los_Angeles",
    briefingDate: "2026-07-26",
    startDate: "2026-07-19",
    endDate: "2026-07-25",
  },
});
const previousWeekly = artifact("weekly", {
  id: "weekly-previous",
  generatedAt: "2026-07-19T16:00:00Z",
  window: {
    id: "weekly:2026-07-12:2026-07-18:America/Los_Angeles",
    briefingDate: "2026-07-19",
    startDate: "2026-07-12",
    endDate: "2026-07-18",
  },
});
const monthly = artifact("monthly", {
  generatedAt: "2026-08-01T07:00:00Z",
  window: {
    id: "monthly:2026-07-01:2026-07-31:America/Los_Angeles",
    briefingDate: "2026-08-01",
    deliveryDate: "2026-08-01",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  },
});
const photoEvent = {
  id: "event",
  artifactType: "event",
  cadence: "event",
  generatedAt: "2026-07-22T18:00:00Z",
  trigger: { evidenceType: "photo_session", evidenceId: "session" },
  lifecycle: {},
  briefing: { photoEventNarrative: { eventDate: "2026-07-22" } },
};

const select = (date, extra = {}) => resolveHomeBriefingSelection({
  now: new Date(`${date}T18:00:00Z`),
  timeZone: "America/Los_Angeles",
  ...extra,
});

describe("artifact-backed Home briefing routing", () => {
  it("shows a valid Midweek artifact on Wednesday with an exact artifact route", () => {
    expect(select("2026-07-22", { midweekArtifact: midweek })).toMatchObject({
      briefingType: "midweek",
      artifact: midweek,
      href: "/briefings/review/midweek",
      reason: "scheduled_wednesday_midweek",
    });
  });

  it("suppresses Wednesday readiness when only the planned date exists", () => {
    expect(select("2026-07-22")).toMatchObject({
      briefingType: "none",
      artifact: null,
      href: null,
      reason: "scheduled_wednesday_midweek_unavailable",
    });
  });

  it("shows a valid Weekly artifact on Sunday with an exact artifact route", () => {
    expect(select("2026-07-26", { weeklyArtifact: weekly })).toMatchObject({
      briefingType: "weekly",
      artifact: weekly,
      href: "/briefings/review/weekly",
      reason: "scheduled_sunday_weekly",
    });
  });

  it("does not synthesize Weekly readiness on Sunday without an artifact", () => {
    expect(select("2026-07-26")).toMatchObject({
      briefingType: "none",
      artifact: null,
      href: null,
    });
  });

  it("keeps the valid Wednesday Midweek artifact until Sunday Weekly exists", () => {
    expect(select("2026-07-26", { midweekArtifact: midweek })).toMatchObject({
      briefingType: "midweek",
      artifact: midweek,
      reason: "sunday_weekly_pending_keep_midweek",
    });
  });

  it("lets the same-cycle Weekly artifact supersede Midweek on Sunday", () => {
    expect(select("2026-07-26", {
      midweekArtifact: midweek,
      weeklyArtifact: weekly,
    })).toMatchObject({
      briefingType: "weekly",
      artifact: weekly,
    });
  });

  it("keeps the current Midweek on later weekdays and retires prior-cycle Midweek", () => {
    expect(select("2026-07-24", { midweekArtifact: midweek })).toMatchObject({
      briefingType: "midweek",
      artifact: midweek,
    });
    expect(select("2026-07-30", { midweekArtifact: midweek })).toMatchObject({
      briefingType: "none",
      artifact: null,
    });
  });

  it("keeps the most recently completed Weekly artifact before current Midweek exists", () => {
    expect(select("2026-07-20", { weeklyArtifact: previousWeekly })).toMatchObject({
      briefingType: "weekly",
      artifact: previousWeekly,
    });
  });

  it("rejects missing content, type mismatches, and invalid lifecycle states", () => {
    expect(isCadenceArtifactReady({ ...midweek, briefing: null }, "midweek")).toBe(false);
    expect(isCadenceArtifactReady(midweek, "weekly")).toBe(false);
    for (const generationStatus of ["failed", "in_progress", "invalid", "retired", "superseded"]) {
      expect(isCadenceArtifactReady({
        ...midweek,
        lifecycle: { generationStatus },
      }, "midweek")).toBe(false);
    }
    expect(isCadenceArtifactReady({ ...midweek, status: "retired" }, "midweek")).toBe(false);
    expect(isCadenceArtifactReady({
      ...midweek,
      lifecycle: { status: "superseded" },
    }, "midweek")).toBe(false);
  });

  it("preserves same-day Event precedence and rejects superseded Events", () => {
    expect(select("2026-07-22", {
      eventArtifact: photoEvent,
      midweekArtifact: midweek,
    })).toMatchObject({
      briefingType: "event",
      href: "/briefings/photo/session",
    });
    expect(select("2026-07-22", {
      eventArtifact: {
        ...photoEvent,
        lifecycle: { generationStatus: "superseded" },
      },
      midweekArtifact: midweek,
    })).toMatchObject({
      briefingType: "midweek",
      artifact: midweek,
    });
  });

  it("promotes a Photo Event published one local day after its evidence over Weekly", () => {
    const latePhotoEvent = {
      ...photoEvent,
      id: "event_briefing_progress_photo_photo_session_user_founder_001_2026-08-08",
      generatedAt: "2026-08-10T02:08:18.679Z",
      trigger: {
        evidenceType: "photo_session",
        evidenceId: "photo_session_user_founder_001_2026-08-08",
      },
      briefing: { photoEventNarrative: { eventDate: "2026-08-08" } },
    };

    expect(select("2026-08-09", {
      eventArtifact: latePhotoEvent,
      weeklyArtifact: weekly,
    })).toMatchObject({
      artifact: latePhotoEvent,
      briefingType: "event",
      href: "/briefings/photo/photo_session_user_founder_001_2026-08-08",
    });
  });

  it("does not reactivate historical or more-than-one-day-late Photo Events", () => {
    expect(isEventActiveForHome({
      artifact: {
        ...photoEvent,
        generatedAt: "2026-07-02T18:00:00Z",
        briefing: { photoEventNarrative: { eventDate: "2026-07-01" } },
      },
      localDate: "2026-07-22",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
    expect(isEventActiveForHome({
      artifact: {
        ...photoEvent,
        generatedAt: "2026-07-22T18:00:00Z",
        briefing: { photoEventNarrative: { eventDate: "2026-07-20" } },
      },
      localDate: "2026-07-22",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
  });

  it("keeps consumed Photo Events suppressed and preserves DEXA lifecycle behavior", () => {
    expect(isEventActiveForHome({
      artifact: {
        ...photoEvent,
        lifecycle: { consumedAt: "2026-07-22T18:05:00Z" },
      },
      localDate: "2026-07-22",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
    expect(isEventActiveForHome({
      artifact: {
        ...photoEvent,
        generatedAt: "2026-07-01T18:00:00Z",
        trigger: { evidenceType: "dexa", evidenceId: "scan" },
        briefing: { dexaEventNarrative: { scanDate: "2026-07-01" } },
      },
      localDate: "2026-07-22",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
  });

  it("promotes Monthly on its delivery date without hiding an active Event", () => {
    expect(select("2026-08-01", {
      monthlyArtifact: monthly,
      weeklyArtifact: weekly,
    })).toMatchObject({
      briefingType: "monthly",
      artifact: monthly,
      href: "/briefings/monthly/monthly",
      reason: "monthly_delivery_day",
    });
    expect(select("2026-08-01", {
      eventArtifact: {
        ...photoEvent,
        briefing: {
          photoEventNarrative: { eventDate: "2026-08-01" },
        },
      },
      monthlyArtifact: monthly,
    })).toMatchObject({
      briefingType: "event",
    });
  });

  it("returns to routine cadence selection after Monthly delivery day", () => {
    expect(select("2026-08-02", {
      monthlyArtifact: monthly,
    })).toMatchObject({
      briefingType: "none",
      artifact: null,
    });
  });

  it("keeps direct Daily reads non-mutating", async () => {
    const create = vi.fn();
    const consume = vi.fn();
    const repositories = {
      users: { getCurrentUser: async () => ({ id: "u", timeZone: "America/Los_Angeles" }) },
      dailyBriefings: {
        getBriefingByEvidenceWindow: vi.fn(async () => null),
        getLatestScheduledDailyBriefing: vi.fn(async () => null),
        createDailyBriefing: create,
        markBriefingConsumed: consume,
      },
    };
    expect(await createDailyBriefingService({
      repositories,
      now: () => new Date("2026-07-24T18:00:00Z"),
    }).getPersistedDailyBriefing()).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
});

function artifact(cadence, { generatedAt, id = cadence, window }) {
  return {
    id,
    artifactType: "scheduled",
    cadence,
    generatedAt,
    evidenceWindow: {
      ...window,
      cadence,
      closed: true,
    },
    lifecycle: { generationStatus: "completed" },
    briefing: cadence === "midweek"
      ? { hero: { summary: "Week so far" } }
      : cadence === "monthly"
        ? { monthlyPresentation: { hero: { thesis: "Completed month" } } }
        : { weeklyNarrative: { cards: { hero: { body: "Completed week" } } } },
  };
}
