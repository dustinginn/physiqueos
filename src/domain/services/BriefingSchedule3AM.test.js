import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { resolveBriefingCadenceRegistry } from "./BriefingCadenceRegistryService";
import {
  createMidweekEvidenceWindow,
  createMonthlyEvidenceWindow,
  createWeeklyEvidenceWindow,
} from "./BriefingEvidenceWindowService";
import { resolveBriefingDueInstant } from "./BriefingScheduleAuthority";
import { createMidweekBriefingService } from "./MidweekBriefingService";
import { createMonthlyBriefingService } from "./MonthlyBriefingService";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";
import { localDateTimeToUtc } from "./IntelligenceLifecycleIdentityService";

const LA = "America/Los_Angeles";
const MINUTE_MS = 60_000;

// Each simulated local day runs the executor every five minutes.
vi.setConfig({ testTimeout: 60_000 });

// The Founder's stored Coaching Updates preference at the time this authority
// was introduced: 05:30 for every recurring surface. It must not delay or
// otherwise change generation.
const STORED_PREFERENCE = {
  midweek: { enabled: true, day: "wednesday", localTime: "05:30" },
  weekly: { enabled: true, day: "sunday", localTime: "05:30" },
  monthly: { enabled: true, dayOfMonth: 1, localTime: "05:30" },
};

describe("recurring briefings generate at 03:00 local on their existing cadence dates", () => {
  it.each([
    ["Weekly on its Sunday", "2026-09-27", { weekly: 1 }, "2026-09-27T10:00:00.000Z",
      "weekly:2026-09-20:2026-09-26:America/Los_Angeles"],
    ["Midweek on its Wednesday", "2026-09-23", { midweek: 1 }, "2026-09-23T10:00:00.000Z",
      "midweek:2026-09-20:2026-09-22:America/Los_Angeles"],
    ["Monthly on the 1st", "2026-10-01", { monthly: 1 }, "2026-10-01T10:00:00.000Z",
      "monthly:2026-09-01:2026-09-30:America/Los_Angeles"],
    ["Weekly in standard time", "2026-12-06", { weekly: 1 }, "2026-12-06T11:00:00.000Z",
      "weekly:2026-11-29:2026-12-05:America/Los_Angeles"],
  ])("%s", async (_label, localDate, expectedCounts, expectedInstant, expectedWindow) => {
    const world = createWorld();
    await tickThroughLocalDay(world, localDate);
    expect(counts(world)).toEqual({ midweek: 0, weekly: 0, monthly: 0, ...expectedCounts });
    expect(world.generated).toHaveLength(1);
    expect(world.generated[0]).toMatchObject({
      asOf: expectedInstant,
      windowId: expectedWindow,
    });
    expect(world.generated[0].asOf).toBe(resolveBriefingDueInstant({
      localDate, timeZone: LA,
    }).toISOString());
  });

  it("does not generate on days that are not a cadence date", async () => {
    for (const localDate of ["2026-09-21", "2026-09-22", "2026-09-24", "2026-09-26", "2026-09-28"]) {
      const world = createWorld();
      await tickThroughLocalDay(world, localDate);
      expect(world.generated, localDate).toEqual([]);
    }
  });

  it("is not delayed by a stored later preferred time, and defaults to 03:00 with no stored schedule", async () => {
    const stored = createWorld({ schedule: STORED_PREFERENCE });
    await tickThroughLocalDay(stored, "2026-09-27");
    expect(stored.generated[0].asOf).toBe("2026-09-27T10:00:00.000Z");
    const unconfigured = createWorld({ schedule: null });
    await tickThroughLocalDay(unconfigured, "2026-09-27");
    expect(unconfigured.generated[0].asOf).toBe("2026-09-27T10:00:00.000Z");
  });

  it("makes each cadence eligible exactly at 03:00:00 and not at 02:59:59.999", async () => {
    const before = await registryAt("2026-09-27T09:59:59.999Z");
    expect(before.weekly).toMatchObject({
      eligible: false,
      eligibilityReason: "before_local_eligible_time",
      localTime: "02:59",
      localEligibleTime: "03:00",
    });
    const at = await registryAt("2026-09-27T10:00:00.000Z");
    expect(at.weekly).toMatchObject({
      eligible: true, eligibilityReason: "eligible", localTime: "03:00",
      dueAt: "2026-09-27T10:00:00.000Z",
    });
    const midweekBefore = await registryAt("2026-09-23T09:59:59.999Z");
    const midweekAt = await registryAt("2026-09-23T10:00:00.000Z");
    expect(midweekBefore.midweek.eligible).toBe(false);
    expect(midweekAt.midweek.eligible).toBe(true);
    const monthlyBefore = await registryAt("2026-10-01T09:59:59.999Z");
    const monthlyAt = await registryAt("2026-10-01T10:00:00.000Z");
    expect(monthlyBefore.monthly.eligible).toBe(false);
    expect(monthlyAt.monthly.eligible).toBe(true);
  });

  it("keeps every cadence window date-based and independent of the generation time within the day", async () => {
    const windows = ["2026-09-27T10:00:00.000Z", "2026-09-27T19:00:00.000Z", "2026-09-28T06:55:00.000Z"]
      .map((iso) => createWeeklyEvidenceWindow({ now: new Date(iso), timeZone: LA }));
    expect(new Set(windows.map((window) => window.id)).size).toBe(1);
    expect(windows[0]).toMatchObject({
      startDate: "2026-09-20",
      endDate: "2026-09-26",
      // End of the last completed local day: not moved by the 03:00 generation time.
      cutoff: "2026-09-27T06:59:59.999Z",
      sameDayEvidenceExcluded: true,
    });
    expect(createMidweekEvidenceWindow({ now: new Date("2026-09-23T10:00:00.000Z"), timeZone: LA }))
      .toMatchObject({
        startDate: "2026-09-20", endDate: "2026-09-22", cutoff: "2026-09-23T06:59:59.999Z",
      });
    expect(createMonthlyEvidenceWindow({ now: new Date("2026-10-01T10:00:00.000Z"), timeZone: LA }))
      .toMatchObject({
        startDate: "2026-09-01", endDate: "2026-09-30", cutoff: "2026-10-01T06:59:59.999Z",
        closed: true,
      });
  });
});

describe("Monthly precedence over Weekly and Midweek is unchanged", () => {
  it("supersedes Midweek when the 1st is the Midweek Wednesday", async () => {
    const world = createWorld();
    await tickThroughLocalDay(world, "2026-07-01");
    expect(counts(world)).toEqual({ midweek: 0, weekly: 0, monthly: 1 });
    expect(world.generated[0]).toMatchObject({
      asOf: "2026-07-01T10:00:00.000Z",
      windowId: "monthly:2026-06-01:2026-06-30:America/Los_Angeles",
    });
    const at = await registryAt("2026-07-01T10:00:00.000Z");
    expect(at.midweek).toMatchObject({
      eligible: false, eligibilityReason: "superseded_by_monthly", supersededByCadence: "monthly",
    });
  });

  it("supersedes Weekly when the 1st is the Weekly Sunday, on the fall-back day", async () => {
    const world = createWorld();
    await tickThroughLocalDay(world, "2026-11-01");
    expect(counts(world)).toEqual({ midweek: 0, weekly: 0, monthly: 1 });
    expect(world.generated[0]).toMatchObject({
      asOf: "2026-11-01T11:00:00.000Z",
      windowId: "monthly:2026-10-01:2026-10-31:America/Los_Angeles",
    });
    const at = await registryAt("2026-11-01T11:00:00.000Z");
    expect(at.weekly).toMatchObject({
      eligible: false, eligibilityReason: "superseded_by_monthly",
    });
  });
});

describe("daylight-saving days produce exactly one intended generation", () => {
  it("spring-forward Sunday: 02:00-02:59 never occurs and 03:00 generates once", async () => {
    const world = createWorld();
    const ticks = await tickThroughLocalDay(world, "2027-03-14");
    // The local day is 23 hours long.
    expect(ticks.length).toBe(23 * 12);
    expect(ticks.some((tick) => tick.local.time >= "02:00" && tick.local.time < "03:00")).toBe(false);
    expect(counts(world)).toEqual({ midweek: 0, weekly: 1, monthly: 0 });
    expect(world.generated[0]).toMatchObject({
      asOf: "2027-03-14T10:00:00.000Z",
      windowId: "weekly:2027-03-07:2027-03-13:America/Los_Angeles",
    });
  });

  it("fall-back Sunday: the repeated 01:00 hour generates nothing and 03:00 generates once", async () => {
    const world = createWorld();
    const ticks = await tickThroughLocalDay(world, "2027-11-07");
    // The local day is 25 hours long and 01:00-01:59 occurs twice.
    expect(ticks.length).toBe(25 * 12);
    expect(ticks.filter((tick) => tick.local.time === "01:30")).toHaveLength(2);
    expect(counts(world)).toEqual({ midweek: 0, weekly: 1, monthly: 0 });
    expect(world.generated[0]).toMatchObject({
      asOf: "2027-11-07T11:00:00.000Z",
      windowId: "weekly:2027-10-31:2027-11-06:America/Los_Angeles",
    });
  });

  it("stays idempotent when the worker restarts and re-ticks after generation", async () => {
    const world = createWorld();
    await tickThroughLocalDay(world, "2027-03-14");
    const restarted = createWorld({ artifacts: world.store.artifacts });
    await tickThroughLocalDay(restarted, "2027-03-14");
    expect(restarted.generated).toEqual([]);
  });
});

describe("historical published artifacts are never regenerated or changed", () => {
  it("leaves every historical artifact byte-identical and generates only the new occurrence", async () => {
    const historical = [
      historicalArtifact("weekly", "weekly:2026-09-13:2026-09-19:America/Los_Angeles", "2026-09-20T12:34:05.415Z"),
      historicalArtifact("midweek", "midweek:2026-09-13:2026-09-15:America/Los_Angeles", "2026-09-16T07:04:38.549Z"),
      historicalArtifact("monthly", "monthly:2026-08-01:2026-08-31:America/Los_Angeles", "2026-09-01T16:16:40.008Z"),
    ];
    const before = JSON.stringify(historical);
    const world = createWorld({ artifacts: historical });
    await tickThroughLocalDay(world, "2026-09-27");
    expect(JSON.stringify(world.store.artifacts.slice(0, historical.length))).toBe(before);
    expect(world.generated.map((item) => item.windowId)).toEqual([
      "weekly:2026-09-20:2026-09-26:America/Los_Angeles",
    ]);
  });

  it("does not regenerate an already-published occurrence when its window is reached at 03:00", async () => {
    const existing = historicalArtifact(
      "weekly", "weekly:2026-09-20:2026-09-26:America/Los_Angeles", "2026-09-27T12:34:05.415Z",
    );
    const world = createWorld({ artifacts: [existing] });
    await tickThroughLocalDay(world, "2026-09-27");
    expect(world.generated).toEqual([]);
    expect(world.store.artifacts).toEqual([existing]);
  });

  it("never invokes a generator with a historical window override", async () => {
    const world = createWorld();
    await tickThroughLocalDay(world, "2026-09-23");
    for (const call of world.calls) {
      // `timeZone` is the executor-resolved recurring-briefing zone (additive
      // input); there is still no window override or historical-window input.
      expect(Object.keys(call).sort()).toEqual(["asOf", "timeZone", "userId"]);
      expect(call.timeZone).toBe("America/Los_Angeles");
    }
  });
});

describe("each generator's own gate agrees with the scheduler at 03:00 local", () => {
  const gate = { weekly: "not_weekly_day", midweek: "not_wednesday", monthly: "before_monthly_eligibility" };

  const generate = (cadence, iso) => {
    const { repositories } = createWorld();
    const asOf = new Date(iso);
    const service = {
      weekly: () => createWeeklyNarrativeService({ repositories, now: () => asOf }),
      midweek: () => createMidweekBriefingService({ repositories, now: () => asOf }),
      monthly: () => createMonthlyBriefingService({
        repositories,
        now: () => asOf,
        publicationService: {},
        occurrencePreparer: async () => ({ prepared: true }),
        occurrencePublisher: async () => ({ state: "completed", artifact: { id: "monthly" } }),
      }),
    }[cadence]();
    return service.generateForCurrentWindow({ userId: "user_founder_001", asOf });
  };

  it.each([
    ["weekly", "2026-09-27"],
    ["midweek", "2026-09-23"],
    ["monthly", "2026-10-01"],
  ])("%s is not eligible at 02:59:59.999 and passes its gate at 03:00:00 despite a stored 05:30", async (cadence, localDate) => {
    const due = resolveBriefingDueInstant({ localDate, timeZone: LA });
    const before = await generate(cadence, new Date(due.valueOf() - 1).toISOString());
    expect(before).toMatchObject({ state: "not_eligible", reason: gate[cadence] });
    const at = await generate(cadence, due.toISOString());
    expect(at.reason).not.toBe(gate[cadence]);
  });

  it("no longer opens the Monthly generator at local midnight", async () => {
    const midnight = localDateTimeToUtc({ date: "2026-10-01", time: "00:00:00", timeZone: LA });
    expect(await generate("monthly", midnight.toISOString())).toMatchObject({
      state: "not_eligible", reason: "before_monthly_eligibility",
    });
  });
});

describe("event-triggered briefings are not scheduled", () => {
  it("registers only Midweek, Weekly, and Monthly with the scheduler", async () => {
    const entries = await resolveBriefingCadenceRegistry({
      repositories: createWorld().repositories, generators: {}, now: new Date("2026-09-27T10:00:00.000Z"),
    });
    expect(entries.map((entry) => entry.cadence)).toEqual(["midweek", "weekly", "monthly"]);
  });

  it("keeps the DEXA and Photo event paths free of the schedule authority", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const eventSources = [
      "app/evidence/photos/actions.js",
      "domain/services/PhotoEventNarrativeService.js",
      "domain/services/DEXAEventContextService.js",
      "domain/services/ConfirmedDexaEventRecoveryService.js",
      "domain/services/ConfirmedPhotoEventRecoveryService.js",
      "domain/services/EventBriefingHomeRelevanceService.js",
    ];
    for (const relative of eventSources) {
      const source = fs.readFileSync(path.join(root, relative), "utf8");
      expect(source, relative).not.toMatch(
        /BriefingScheduleAuthority|hasReachedBriefingGenerationTime|resolveBriefingDueInstant|resolveBriefingCadenceRegistry|selectScheduledBriefingCadence/
      );
    }
  });
});

async function registryAt(iso) {
  const entries = await resolveBriefingCadenceRegistry({
    repositories: createWorld().repositories,
    generators: {},
    now: new Date(iso),
  });
  return Object.fromEntries(entries.map((entry) => [entry.cadence, entry]));
}

function counts(world) {
  const result = { midweek: 0, weekly: 0, monthly: 0 };
  for (const item of world.generated) result[item.cadence] += 1;
  return result;
}

// Ticks the executor every five minutes (the production worker poll interval)
// across one local calendar day, from local midnight to the next local midnight.
async function tickThroughLocalDay(world, localDate) {
  const next = new Date(`${localDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const start = localDateTimeToUtc({ date: localDate, time: "00:00:00", timeZone: LA });
  const end = localDateTimeToUtc({
    date: next.toISOString().slice(0, 10), time: "00:00:00", timeZone: LA,
  });
  const ticks = [];
  for (let at = start.valueOf(); at < end.valueOf(); at += 5 * MINUTE_MS) {
    const asOf = new Date(at);
    await world.executor.execute({ asOf });
    ticks.push({ asOf, local: localClock(asOf) });
  }
  return ticks;
}

function createWorld({ schedule = STORED_PREFERENCE, artifacts = [] } = {}) {
  const store = { artifacts: structuredClone(artifacts) };
  const generated = [];
  const calls = [];
  const publish = (cadence, windowFor) => vi.fn(async (input) => {
    calls.push(input);
    const window = windowFor(input.asOf);
    const artifact = {
      id: `${cadence}_${window.id}`,
      cadence,
      lifecycle: { generationStatus: "completed" },
      evidenceWindow: window,
      briefing: {},
      generatedAt: input.asOf.toISOString(),
    };
    store.artifacts.push(artifact);
    generated.push({ cadence, asOf: input.asOf.toISOString(), windowId: window.id });
    return { state: "completed", artifact };
  });
  const generators = {
    midweek: { generateForCurrentWindow: publish("midweek", (asOf) =>
      createMidweekEvidenceWindow({ now: asOf, timeZone: LA, coachingUpdates: schedule })) },
    weekly: { generateForCurrentWindow: publish("weekly", (asOf) =>
      createWeeklyEvidenceWindow({ now: asOf, timeZone: LA })) },
    monthly: { generateForCurrentWindow: publish("monthly", (asOf) =>
      createMonthlyEvidenceWindow({ now: asOf, timeZone: LA })) },
  };
  const repositories = createRepositories({ store, schedule });
  const executor = createBriefingCadenceExecutor({
    repositories,
    generators,
    executionStore: {
      createExecutionId: () => "run",
      async record() {},
      async getRetryState() {
        return {
          terminalFailure: false,
          consecutiveTransientFailures: 0,
          lastFailureAt: null,
          lastFailureCategory: null,
        };
      },
    },
    executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
    source: "test",
  });
  return { store, generated, calls, repositories, executor };
}

function createRepositories({ store, schedule }) {
  const user = { id: "user_founder_001", timeZone: LA };
  const protocol = schedule
    ? { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v1" }
    : null;
  return {
    users: {
      getCurrentUser: vi.fn(async () => user),
      getUserById: vi.fn(async () => user),
    },
    protocols: { listActiveProtocols: vi.fn(async () => protocol ? [protocol] : []) },
    protocolVersions: {
      getCurrentVersion: vi.fn(async () => schedule ? {
        id: "briefings-v1",
        protocolId: "briefings",
        effectiveAt: "2026-09-17",
        coachingUpdates: {
          schemaVersion: "coaching_updates_schedule_v1",
          timeZone: LA,
          ...schedule,
          daily: { enabled: false },
          eventBriefings: { photo: true, dexa: true },
          notificationPreference: "notify_when_ready",
        },
      } : null),
    },
    goals: { getActiveGoal: vi.fn(async () => null) },
    dailyBriefings: {
      // Generators that pass their gate stop at the canonical claim.
      claimScheduledBriefing: vi.fn(async () => ({ acquired: false, state: "in_progress", artifact: null })),
      getBriefingByEvidenceWindow: vi.fn(async (_userId, windowId) =>
        store.artifacts.find((artifact) => artifact.evidenceWindow?.id === windowId) ?? null),
    },
  };
}

function historicalArtifact(cadence, windowId, generatedAt) {
  const [, startDate, endDate] = windowId.split(":");
  return {
    id: `${cadence}_${windowId}`,
    cadence,
    artifactType: "scheduled",
    lifecycle: { generationStatus: "completed" },
    evidenceWindow: { id: windowId, startDate, endDate, timeZone: LA },
    briefing: { version: "locked" },
    generatedAt,
  };
}

function localClock(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: LA,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}
