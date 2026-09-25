import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository.js";
import { resolveBriefingCadenceRegistry } from "./BriefingCadenceRegistryService";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { createCoachingUpdatesReadService } from "./CoachingUpdatesReadService";
import {
  attachEvidenceSettlement,
  createSettlementGeneratorInput,
} from "./BriefingEvidenceSettlementArtifact.js";
import { SettlementReasonCode } from "./BriefingEvidenceSettlementPolicy.js";
import {
  BRIEFING_DEFAULT_TIME_ZONE,
  resolveBriefingTimeZone,
  resolveBriefingTimeZoneAuthority,
} from "./BriefingScheduleAuthority";
import { resolveRecurringBriefingTimeZone } from "./RecurringBriefingTimeZoneAuthority";
import { createMidweekBriefingService } from "./MidweekBriefingService";
import { createMonthlyBriefingService } from "./MonthlyBriefingService";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";
import { createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";

// ONE canonical recurring-briefing timezone authority. The REAL registry, the
// REAL Coaching Updates read service, the REAL executor and the REAL
// Midweek / Weekly / Monthly generators run over in-memory repositories; only
// persistence commit points that are irrelevant to the window are stubbed
// (Weekly persistence commit, Monthly preparer/publisher), and each stub
// captures the window the generator ACTUALLY built.

const OWNER = "user_founder_001";
const HOUR = 3_600_000;
const LA = "America/Los_Angeles";

function coachingVersion(timeZone) {
  return {
    id: "briefings-v2", protocolId: "briefings", effectiveAt: "2026-09-17",
    coachingUpdates: {
      schemaVersion: "coaching_updates_schedule_v1",
      ...(timeZone === undefined ? {} : { timeZone }),
      midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
      weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      monthly: { enabled: true, dayOfMonth: 1, localTime: "00:00" },
      daily: { enabled: false }, notificationPreference: "notify_when_ready",
    },
  };
}

// coaching: undefined => NO briefings protocol at all; null => protocol whose
// stored version carries no explicit timezone; string => explicit stored zone.
function makeRepositories({ user, coaching }) {
  const protocol = { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v2" };
  const artifactRecords = [];
  const dailyBriefings = createDailyBriefingRepository(artifactRecords);
  return {
    artifactRecords,
    users: { getCurrentUser: async () => user, getUserById: async () => user },
    protocols: { listActiveProtocols: async () => (coaching === undefined ? [] : [protocol]) },
    protocolVersions: { getCurrentVersion: async () => coachingVersion(coaching === null ? undefined : coaching) },
    dailyBriefings: Object.assign(dailyBriefings, {
      listCompletedBriefingsInWindow: async () => [],
      getLatestWeeklyBriefing: async () => null,
      listDailyBriefings: async () => [],
    }),
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] },
    weights: { listWeightEntries: async () => [] },
    dexaScans: { listDEXAScans: async () => [] },
    goals: {
      getActiveGoal: async () => ({ id: "goal-build", title: "Build Lean Mass", status: "active", primary: true, type: "fat_loss", phases: [] }),
      listGoals: async () => [],
    },
  };
}

// Real generators; `captured` records the window each one built and the
// artifact each returned.
function makeGenerators(repositories, clock) {
  const captured = { midweek: [], weekly: [], monthly: [] };
  const midweekService = createMidweekBriefingService({ repositories, now: () => clock.value });
  const commit = vi.fn(async (prepared) => ({ status: "created", artifact: prepared.artifact, revision: 2, commitId: "c" }));
  const weeklyService = createWeeklyNarrativeService({
    repositories, now: () => clock.value,
    weeklyPersistence: { captureBaseline: () => ({ revision: 1, semanticDigest: "t", fileHash: "t" }), commit },
  });
  const monthlyService = createMonthlyBriefingService({
    repositories, publicationService: {}, now: () => clock.value,
    occurrencePreparer: async ({ window, timeZone }) => ({ artifact: { id: `monthly_${window.id}`, evidenceWindow: window, timeZone, briefing: {} } }),
    occurrencePublisher: async ({ prepared }) => ({ state: "completed", artifact: prepared.artifact }),
  });
  const wrap = (cadence, service) => ({
    async generateForCurrentWindow(input) {
      const result = await service.generateForCurrentWindow(input);
      captured[cadence].push({ input, result });
      return result;
    },
  });
  return {
    captured,
    generators: { midweek: wrap("midweek", midweekService), weekly: wrap("weekly", weeklyService), monthly: wrap("monthly", monthlyService) },
    raw: { midweek: midweekService, weekly: weeklyService, monthly: monthlyService },
  };
}

// Weekly persistence returns the artifact from `commit`; Midweek/Monthly return
// it directly. This reads the evidenceWindow of whatever the generator returned.
const windowOf = (result) => result?.artifact?.evidenceWindow ?? null;
const shape = (window) => window && ({
  id: window.id, startDate: window.startDate, endDate: window.endDate, timeZone: window.timeZone,
});

// Runs the scheduler (registry) hour by hour and, for every cadence the
// scheduler calls eligible, asserts the window each generator builds is
// identical: with the executor-supplied timeZone AND on its own.
async function sweep({ user, coaching, start, hours, expectedZone }) {
  const seen = { midweek: 0, weekly: 0, monthly: 0 };
  for (let index = 0; index < hours; index += 1) {
    const asOf = new Date(Date.parse(start) + index * HOUR);
    const registry = await resolveBriefingCadenceRegistry({
      repositories: makeRepositories({ user, coaching }), generators: {}, userId: OWNER, now: asOf,
    });
    for (const entry of registry.filter((item) => item.eligible)) {
      expect(entry.timeZone).toBe(expectedZone);
      const withSupplied = makeGenerators(makeRepositories({ user, coaching }), { value: asOf });
      const supplied = await withSupplied.generators[entry.cadence]
        .generateForCurrentWindow({ userId: OWNER, asOf, timeZone: entry.timeZone });
      const standalone = makeGenerators(makeRepositories({ user, coaching }), { value: asOf });
      const direct = await standalone.generators[entry.cadence]
        .generateForCurrentWindow({ userId: OWNER, asOf });
      const context = `${entry.cadence} @ ${asOf.toISOString()}`;
      expect(supplied.state, context).toBe("completed");
      expect(direct.state, context).toBe("completed");
      expect(shape(windowOf(supplied)), context).toEqual(shape(entry.evidenceWindow));
      expect(shape(windowOf(direct)), context).toEqual(shape(entry.evidenceWindow));
      expect(entry.evidenceWindow.timeZone, context).toBe(expectedZone);
      seen[entry.cadence] += 1;
    }
  }
  return seen;
}

describe("shared resolver precedence", () => {
  it("explicit Coaching Updates zone, then stored user timeZone, then legacy timezone, then the product default LAST", () => {
    expect(resolveBriefingTimeZoneAuthority({
      coachingUpdates: { timeZone: "Asia/Tokyo" }, user: { timeZone: "Europe/Berlin", timezone: "Europe/Paris" },
    })).toEqual({ timeZone: "Asia/Tokyo", source: "coaching_updates" });
    expect(resolveBriefingTimeZoneAuthority({ user: { timeZone: "Europe/Berlin", timezone: "Europe/Paris" } }))
      .toEqual({ timeZone: "Europe/Berlin", source: "user_profile" });
    expect(resolveBriefingTimeZoneAuthority({ user: { timezone: "Europe/Paris" } }))
      .toEqual({ timeZone: "Europe/Paris", source: "user_profile" });
    expect(resolveBriefingTimeZoneAuthority({ user: { id: OWNER, timezone: null } }))
      .toEqual({ timeZone: BRIEFING_DEFAULT_TIME_ZONE, source: "product_default" });
    expect(resolveBriefingTimeZoneAuthority({}))
      .toEqual({ timeZone: LA, source: "product_default" });
    // The string helper keeps its existing contract.
    expect(resolveBriefingTimeZone({ coachingUpdates: { timeZone: "Asia/Tokyo" }, user: { timeZone: LA } })).toBe("Asia/Tokyo");
    expect(resolveBriefingTimeZone({ user: { timezone: "Europe/Paris" } })).toBe("Europe/Paris");
  });

  it("the async helper reads the real Coaching Updates read model and reports the honest source", async () => {
    const explicit = await resolveRecurringBriefingTimeZone({
      repositories: makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: "Pacific/Auckland" }),
      userId: OWNER, user: { id: OWNER, timeZone: LA },
    });
    expect(explicit).toMatchObject({ timeZone: "Pacific/Auckland", source: "coaching_updates" });
    expect(explicit.coachingUpdates.midweek.day).toBe("wednesday");

    // Protocol exists but stores no explicit zone: the user profile supplies it
    // (both key spellings), the product default only when neither exists.
    for (const user of [{ id: OWNER, timeZone: "Europe/Berlin" }, { id: OWNER, timezone: "Europe/Berlin" }]) {
      expect(await resolveRecurringBriefingTimeZone({
        repositories: makeRepositories({ user, coaching: null }), userId: OWNER, user,
      })).toMatchObject({ timeZone: "Europe/Berlin", source: "user_profile" });
    }
    expect(await resolveRecurringBriefingTimeZone({
      repositories: makeRepositories({ user: { id: OWNER }, coaching: null }), userId: OWNER, user: { id: OWNER },
    })).toMatchObject({ timeZone: LA, source: "product_default" });

    // No protocol at all.
    expect(await resolveRecurringBriefingTimeZone({
      repositories: makeRepositories({ user: { id: OWNER, timezone: "Asia/Tokyo" }, coaching: undefined }),
      userId: OWNER, user: { id: OWNER, timezone: "Asia/Tokyo" },
    })).toMatchObject({ timeZone: "Asia/Tokyo", source: "user_profile", coachingUpdates: null });
  });

  it("the read model returned by getCurrent is unchanged by the additive source channel", async () => {
    const repositories = makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: "Asia/Tokyo" });
    const service = createCoachingUpdatesReadService({ repositories });
    const plain = await service.getCurrent({ userId: OWNER });
    const withSource = await service.getCurrentWithTimeZoneSource({ userId: OWNER });
    expect(withSource.model).toEqual(plain);
    expect(withSource.timeZoneSource).toBe("coaching_updates");
    expect(Object.keys(plain)).not.toContain("timeZoneSource");
  });
});

describe("scheduler and every generator build identical windows (hourly sweeps)", () => {
  // [scenario, user, coaching, expected zone]
  const scenarios = [
    ["coaching Asia/Tokyo differs from user America/Los_Angeles", { id: OWNER, timeZone: LA }, "Asia/Tokyo", "Asia/Tokyo"],
    ["coaching Pacific/Auckland differs from user America/Los_Angeles", { id: OWNER, timeZone: LA }, "Pacific/Auckland", "Pacific/Auckland"],
    ["coaching absent (no protocol), user timeZone present", { id: OWNER, timeZone: "Europe/Berlin" }, undefined, "Europe/Berlin"],
    ["coaching protocol without explicit zone, user timeZone present", { id: OWNER, timeZone: "Europe/Berlin" }, null, "Europe/Berlin"],
    ["coaching absent, only the legacy lowercase user timezone", { id: OWNER, timezone: "Europe/Berlin" }, undefined, "Europe/Berlin"],
    ["coaching protocol without zone, only the legacy lowercase user timezone", { id: OWNER, timezone: "Europe/Berlin" }, null, "Europe/Berlin"],
    ["both absent: product default", { id: OWNER, timezone: null }, undefined, LA],
    ["protocol without zone and no user zone: product default", { id: OWNER }, null, LA],
  ];

  it.each(scenarios)("%s (2026-10-25 .. 11-08 incl. the 2026-11-01 fall-back)", async (_name, user, coaching, expectedZone) => {
    const seen = await sweep({ user, coaching, start: "2026-10-25T00:00:00Z", hours: 14 * 24, expectedZone });
    // The sweep is not vacuous: each cadence was scheduled and compared.
    expect(seen.midweek).toBeGreaterThan(0);
    expect(seen.weekly).toBeGreaterThan(0);
    expect(seen.monthly).toBeGreaterThan(0);
  }, 240_000);

  it("DST spring-forward 2027-03-14 America/Los_Angeles", async () => {
    const seen = await sweep({
      user: { id: OWNER, timeZone: "Asia/Tokyo" }, coaching: LA,
      start: "2027-03-10T00:00:00Z", hours: 8 * 24, expectedZone: LA,
    });
    expect(seen.weekly).toBeGreaterThan(0);
    expect(seen.midweek).toBeGreaterThan(0);
  }, 240_000);

  it("southern-hemisphere DST start (Australia/Sydney, 2026-10-04) with a differing user zone", async () => {
    const seen = await sweep({
      user: { id: OWNER, timeZone: LA }, coaching: "Australia/Sydney",
      start: "2026-09-30T00:00:00Z", hours: 9 * 24, expectedZone: "Australia/Sydney",
    });
    expect(seen.weekly).toBeGreaterThan(0);
    expect(seen.midweek).toBeGreaterThan(0);
  }, 240_000);

  it("a coaching-vs-user difference moves the local day: the window follows the coaching zone, not the user's", async () => {
    // 2026-09-16T18:00Z is Wed 11:00 in LA but already Thu 03:00 in Tokyo.
    const asOf = new Date("2026-09-16T18:00:00Z");
    const registry = await resolveBriefingCadenceRegistry({
      repositories: makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: "Asia/Tokyo" }),
      generators: {}, userId: OWNER, now: asOf,
    });
    expect(registry.find((entry) => entry.cadence === "midweek").eligible).toBe(false);
    const laRegistry = await resolveBriefingCadenceRegistry({
      repositories: makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: LA }),
      generators: {}, userId: OWNER, now: asOf,
    });
    expect(laRegistry.find((entry) => entry.cadence === "midweek").eligible).toBe(true);
    // The Midweek generator agrees with the scheduler in BOTH cases.
    const tokyo = makeGenerators(makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: "Asia/Tokyo" }), { value: asOf });
    expect(await tokyo.generators.midweek.generateForCurrentWindow({ userId: OWNER, asOf }))
      .toMatchObject({ state: "not_eligible", reason: "not_wednesday" });
    const la = makeGenerators(makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: LA }), { value: asOf });
    expect(windowOf(await la.generators.midweek.generateForCurrentWindow({ userId: OWNER, asOf })).id)
      .toBe("midweek:2026-09-13:2026-09-15:America/Los_Angeles");
  });
});

describe("Monthly stays day 1 in the canonical zone", () => {
  it("is eligible only on local day 1 at/after 03:00 in the coaching zone, per scheduler and generator", async () => {
    const user = { id: OWNER, timeZone: LA };
    const eligibleLocalDates = new Set();
    for (let index = 0; index < 62 * 24; index += 1) {
      const asOf = new Date(Date.parse("2026-09-15T00:00:00Z") + index * HOUR);
      const registry = await resolveBriefingCadenceRegistry({
        repositories: makeRepositories({ user, coaching: "Pacific/Auckland" }), generators: {}, userId: OWNER, now: asOf,
      });
      const monthly = registry.find((entry) => entry.cadence === "monthly");
      const generator = createMonthlyBriefingService({
        repositories: makeRepositories({ user, coaching: "Pacific/Auckland" }), publicationService: {}, now: () => asOf,
        occurrencePreparer: async ({ window }) => ({ artifact: { id: "m", evidenceWindow: window, briefing: {} } }),
        occurrencePublisher: async ({ prepared }) => ({ state: "completed", artifact: prepared.artifact }),
      });
      const result = await generator.generateForCurrentWindow({ userId: OWNER, asOf, timeZone: monthly.timeZone });
      // Registry eligibility and the generator's own gate agree at every hour.
      expect(result.state === "completed", asOf.toISOString()).toBe(monthly.eligible);
      if (monthly.eligible) eligibleLocalDates.add(monthly.localDate);
    }
    expect([...eligibleLocalDates].sort()).toEqual(["2026-10-01", "2026-11-01"]);
  }, 240_000);
});

describe("Founder production-shaped fixture is unchanged", () => {
  // Stored production facts: coachingUpdates.timeZone America/Los_Angeles
  // (explicit), user.timeZone ABSENT, only `timezone: null`.
  const founder = { id: OWNER, timezone: null, displayName: "Founder" };
  const repositories = () => makeRepositories({ user: founder, coaching: LA });

  it("resolves America/Los_Angeles from the explicit stored Coaching Updates zone", async () => {
    expect(await resolveRecurringBriefingTimeZone({ repositories: repositories(), userId: OWNER, user: founder }))
      .toMatchObject({ timeZone: LA, source: "coaching_updates" });
  });

  it("produces exactly today's Midweek / Weekly / Monthly windows, scheduler and generators alike", async () => {
    const expected = [
      ["midweek", "2026-09-16T12:00:00Z", "midweek:2026-09-13:2026-09-15:America/Los_Angeles", "2026-09-13", "2026-09-15"],
      ["weekly", "2026-09-27T12:00:00Z", "weekly:2026-09-20:2026-09-26:America/Los_Angeles", "2026-09-20", "2026-09-26"],
      ["monthly", "2026-10-01T12:00:00Z", null, "2026-09-01", "2026-09-30"],
    ];
    for (const [cadence, iso, id, startDate, endDate] of expected) {
      const asOf = new Date(iso);
      const registry = await resolveBriefingCadenceRegistry({ repositories: repositories(), generators: {}, userId: OWNER, now: asOf });
      const entry = registry.find((item) => item.cadence === cadence);
      expect(entry).toMatchObject({ eligible: true, timeZone: LA, timeZoneSource: "coaching_updates" });
      if (id) expect(entry.evidenceWindow.id).toBe(id);
      expect(shape(entry.evidenceWindow)).toMatchObject({ startDate, endDate, timeZone: LA });
      const world = makeGenerators(repositories(), { value: asOf });
      const built = await world.generators[cadence].generateForCurrentWindow({ userId: OWNER, asOf });
      expect(built.state).toBe("completed");
      expect(shape(windowOf(built))).toEqual(shape(entry.evidenceWindow));
    }
  });
});

describe("watermark timezone equals the generator window timezone", () => {
  const fakeGate = {
    beginTick() {},
    async evaluate() {
      return { action: "generate", reasonCode: SettlementReasonCode.NOT_APPLICABLE, unsettledDomains: [] };
    },
  };
  const executionStore = () => {
    const records = [];
    return {
      records,
      createExecutionId: () => `run-${records.length}`,
      async record(record) { records.push(record); },
      async getRetryState() {
        return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null };
      },
    };
  };
  const lock = { async acquire() { return { acquired: true, async release() {} }; } };

  async function firstEligible(cadence, { user, coaching, from }) {
    for (let index = 0; index < 24 * 45; index += 1) {
      const asOf = new Date(Date.parse(from) + index * HOUR);
      const registry = await resolveBriefingCadenceRegistry({
        repositories: makeRepositories({ user, coaching }), generators: {}, userId: OWNER, now: asOf,
      });
      if (registry.find((entry) => entry.cadence === cadence)?.eligible) return asOf;
    }
    throw new Error(`no eligible ${cadence}`);
  }

  it.each([
    ["midweek", { id: OWNER, timeZone: LA }, "Asia/Tokyo", "coaching_updates"],
    ["weekly", { id: OWNER, timeZone: LA }, "Pacific/Auckland", "coaching_updates"],
    ["monthly", { id: OWNER, timeZone: LA }, "Australia/Sydney", "coaching_updates"],
    ["midweek", { id: OWNER, timeZone: "Europe/Berlin" }, undefined, "user_profile"],
    ["weekly", { id: OWNER, timezone: "Europe/Berlin" }, null, "user_profile"],
    ["monthly", { id: OWNER, timezone: null }, undefined, "product_default"],
  ])("%s: real executor -> real generator persists a watermark in the window's zone (%j coaching %s, source %s)",
    async (cadence, user, coaching, source) => {
      const from = "2026-10-25T00:00:00Z";
      const asOf = await firstEligible(cadence, { user, coaching, from });
      const repositories = makeRepositories({ user, coaching });
      const world = makeGenerators(repositories, { value: asOf });
      const store = executionStore();
      const executor = createBriefingCadenceExecutor({
        repositories, generators: world.generators, settlementGate: fakeGate,
        executionStore: store, executionLock: lock, now: () => asOf, source: "test",
      });
      const result = await executor.execute({ asOf });
      const outcome = result.outcomes.find((item) => item.cadenceKey === cadence);
      expect(outcome.resultStatus).toBe("generation_completed");
      const built = world.captured[cadence][0];
      // The executor handed the generator the zone it scheduled under.
      expect(built.input.timeZone).toBe(outcome.timezone);
      const artifact = built.result.artifact;
      const mark = artifact.evidenceSettlement;
      expect(mark).toBeTruthy();
      expect(mark.timeZone).toBe(artifact.evidenceWindow.timeZone);
      expect(mark.timeZone).toBe(outcome.timezone);
      expect(mark.evidenceWindow.id).toBe(artifact.evidenceWindow.id);
      expect(mark.evidenceWindow.timeZone).toBe(artifact.evidenceWindow.timeZone);
      expect(mark.timeZoneAuthority).toBe(`briefing_schedule_authority:${source}`);
    }, 60_000);

  it("a generator that builds its window in a different zone than the scheduled watermark REFUSES to publish", async () => {
    // Simulates the old defect: watermark scheduled under LA, generator window in Tokyo.
    const asOf = new Date("2026-10-18T20:00:00Z");
    const laWindow = createWeeklyEvidenceWindow({ now: asOf, timeZone: LA });
    const settlement = createSettlementGeneratorInput({
      entry: { cadence: "weekly", timeZone: LA, evidenceWindow: laWindow, dueAt: asOf.toISOString() }, asOf,
      decision: { action: "generate", reasonCode: SettlementReasonCode.NOT_APPLICABLE, unsettledDomains: [] },
    });
    const world = makeGenerators(makeRepositories({ user: { id: OWNER, timeZone: LA }, coaching: LA }), { value: asOf });
    await expect(world.raw.weekly.generate({
      userId: OWNER, reason: "scheduled_weekly_cadence", asOf, settlement, timeZone: "Asia/Tokyo",
    })).rejects.toMatchObject({ code: "evidence_settlement_window_mismatch" });
    // The same window/timezone attaches cleanly.
    expect(attachEvidenceSettlement({ id: "a", evidenceWindow: laWindow }, settlement).evidenceSettlement.timeZone).toBe(LA);
  });

  it("attaching refuses a watermark whose timezone differs from the artifact window timezone even with an identical id and days", () => {
    const asOf = new Date("2026-10-18T20:00:00Z");
    const window = createWeeklyEvidenceWindow({ now: asOf, timeZone: LA });
    const settlement = createSettlementGeneratorInput({
      entry: { cadence: "weekly", timeZone: LA, evidenceWindow: window, dueAt: asOf.toISOString() }, asOf,
      decision: { action: "generate", reasonCode: SettlementReasonCode.NOT_APPLICABLE, unsettledDomains: [] },
    });
    expect(() => attachEvidenceSettlement({ id: "a", evidenceWindow: { ...window, timeZone: "Asia/Tokyo" } }, settlement))
      .toThrow(expect.objectContaining({ code: "evidence_settlement_timezone_mismatch" }));
  });

  it("the executor refuses a cadence whose scheduled zone differs from its evidence window zone", () => {
    const window = createWeeklyEvidenceWindow({ now: new Date("2026-10-18T20:00:00Z"), timeZone: LA });
    expect(() => createSettlementGeneratorInput({
      entry: { cadence: "weekly", timeZone: "Asia/Tokyo", evidenceWindow: window },
      asOf: new Date("2026-10-18T20:00:00Z"),
      decision: { action: "generate", reasonCode: SettlementReasonCode.NOT_APPLICABLE, unsettledDomains: [] },
    })).toThrow(expect.objectContaining({ code: "evidence_settlement_timezone_mismatch" }));
  });
});

describe("travel / device timezone cannot alter a recurring strategic window", () => {
  const TRANSIENT = {
    clientTimeZone: "Pacific/Kiritimati", deviceTimeZone: "Pacific/Kiritimati", requestTimeZone: "Pacific/Kiritimati",
    travelTimeZone: "Pacific/Kiritimati", currentTimeZone: "Pacific/Kiritimati",
    context: { metadata: { clientTimeZone: "Pacific/Kiritimati" } },
    metadata: { clientTimeZone: "Pacific/Kiritimati" },
  };

  it("ignores every request/device/travel style input on the registry, the resolver and all three generators", async () => {
    const user = { id: OWNER, timeZone: LA };
    const asOf = new Date("2026-09-16T12:00:00Z"); // Wed 05:00 PT; Thu 02:00 in Kiritimati
    const baseline = await resolveBriefingCadenceRegistry({
      repositories: makeRepositories({ user, coaching: LA }), generators: {}, userId: OWNER, now: asOf,
    });
    const noisy = await resolveBriefingCadenceRegistry({
      repositories: makeRepositories({ user, coaching: LA }), generators: {}, userId: OWNER, now: asOf, ...TRANSIENT,
    });
    expect(noisy.map((entry) => shape(entry.evidenceWindow))).toEqual(baseline.map((entry) => shape(entry.evidenceWindow)));
    expect(noisy.every((entry) => entry.timeZone === LA)).toBe(true);
    expect(await resolveRecurringBriefingTimeZone({
      repositories: makeRepositories({ user, coaching: LA }), userId: OWNER, user, ...TRANSIENT,
    })).toMatchObject({ timeZone: LA, source: "coaching_updates" });

    const midweek = makeGenerators(makeRepositories({ user, coaching: LA }), { value: asOf });
    expect(windowOf(await midweek.generators.midweek.generateForCurrentWindow({ userId: OWNER, asOf, ...TRANSIENT })).id)
      .toBe("midweek:2026-09-13:2026-09-15:America/Los_Angeles");
    const weekly = makeGenerators(makeRepositories({ user, coaching: LA }), { value: new Date("2026-09-27T12:00:00Z") });
    expect(windowOf(await weekly.generators.weekly.generateForCurrentWindow({
      userId: OWNER, asOf: new Date("2026-09-27T12:00:00Z"), ...TRANSIENT,
    })).timeZone).toBe(LA);
    const monthly = makeGenerators(makeRepositories({ user, coaching: LA }), { value: new Date("2026-10-01T12:00:00Z") });
    expect(windowOf(await monthly.generators.monthly.generateForCurrentWindow({
      userId: OWNER, asOf: new Date("2026-10-01T12:00:00Z"), ...TRANSIENT,
    })).timeZone).toBe(LA);
  });

  it("source check: no recurring-briefing timezone code reads a request/device/travel zone", () => {
    const files = [
      "BriefingScheduleAuthority.js", "RecurringBriefingTimeZoneAuthority.js", "BriefingCadenceRegistryService.js",
      "BriefingCadenceExecutorService.js", "MidweekBriefingService.js", "WeeklyNarrativeService.js", "MonthlyBriefingService.js",
      "BriefingEvidenceSettlementArtifact.js",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/clientTimeZone|clientTimezone|deviceTimeZone|TimeZone\.current|metadata\??\.time[zZ]one|requestTimeZone/);
    }
  });
});

describe("no generator-local fallback chain remains; event briefings keep their own semantics", () => {
  const read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

  it("the recurring generators, registry and previews contain no hard-coded default timezone fallback of their own", () => {
    for (const file of [
      "MidweekBriefingService.js", "WeeklyNarrativeService.js", "MonthlyBriefingService.js",
      "BriefingCadenceRegistryService.js", "MidweekBriefingPreviewService.js", "WeeklyBriefingV4PreviewService.js",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/user\??\.timeZone\s*\?\?/);
      expect(source, file).toContain("RecurringBriefingTimeZoneAuthority");
    }
  });

  it("DEXA / Photo event briefings and the event Home relevance rule do NOT use the recurring cadence timezone policy", () => {
    // Event briefings are triggered by the evidence itself and are not scheduled;
    // their timezone semantics are deliberately untouched by this change.
    for (const file of [
      "DailyBriefingService.js", "DEXAEventContextService.js", "DEXAEventNarrativeService.js", "PIDEXAEventLifecycleService.js",
      "PIDEXAEventPublicationService.js", "PhotoEventContextService.js", "PhotoEventNarrativeService.js",
      "PIPhotoEventLifecycleService.js", "PIPhotoEventPublicationService.js", "EventBriefingHomeRelevanceService.js",
      "DailyEventService.js",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/RecurringBriefingTimeZoneAuthority|resolveBriefingTimeZone/);
    }
    // ... and the event path still builds its window from the user's own zone.
    expect(read("DailyBriefingService.js")).toMatch(/user\?\.timeZone \?\? "America\/Los_Angeles"/);
  });
});
