import { describe, expect, it, vi } from "vitest";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";
import { createMidweekBriefingService } from "./MidweekBriefingService";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { overlayGraduatedHealthKitSleepNights } from "./HealthKitSleepGraduation.js";
import { resolveHealthKitGraduationPolicy, HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION } from "./HealthKitGraduation.js";
import { resolveHealthKitSleepActivationPolicy, HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION } from "./HealthKitSleepPolicies.js";

// Graduated Sleep reaches only the V3 Recovery slot. The legacy Weekly path
// (PI selection, Energy, Training, V2 sections, the persisted artifact) must be
// byte-identical whether or not `sleep_night` evidence is in the array; only
// the V3 finalizer's period evidence carries the nights.

const TZ = "America/Los_Angeles";
const DATES = ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"];

function nights(dates = DATES, asOf = "2026-07-12T18:00:00Z") {
  const shift = (date, days) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  return overlayGraduatedHealthKitSleepNights({
    sleepDays: dates.map((sleepDay) => ({
      id: `healthkit_sleep_day_${sleepDay}`, userId: "user", sleepDay, revision: 1, algorithmVersion: "sleep-canon-v3", status: "asleep_recorded",
      ingestionPurpose: "operational", windowClosesAt: `${shift(sleepDay, 1)}T01:00:00.000Z`, computedAt: `${sleepDay}T15:00:00.000Z`, mainEpisodeIndex: 0,
      mainSleep: { asleepSeconds: 21600, awakeSeconds: 1800, inBedSeconds: 24000, coreSeconds: 12000, deepSeconds: 4800, remSeconds: 4800, unspecifiedSeconds: 0 },
      episodes: [{ kind: "main", start: `${shift(sleepDay, -1)}T06:30:00.000Z`, end: `${sleepDay}T13:00:00.000Z`, timeZone: TZ,
        primarySource: { sourceFamily: "oura" }, completeness: { asleepData: "present", stageDetail: "staged", sourceBasis: "sensor" } }],
    })),
    graduationPolicy: resolveHealthKitGraduationPolicy({ schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION, historicalBriefingRegeneration: false,
      evidenceEligibility: { enabled: true, domains: ["sleep"], startLocalDate: "2026-07-01", endLocalDate: null } }),
    activationPolicy: resolveHealthKitSleepActivationPolicy({ status: "enabled", schemaVersion: HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION,
      mode: "operational", effectiveSleepDay: "2026-07-01", timeZone: TZ, openEnded: true, strategicEvidenceEligibility: "quarantined", historicalBackfill: false }),
    asOf: new Date(asOf),
  }).objects;
}

function setup(canonicalObjects) {
  const briefings = new Map();
  const repositories = {
    users: { getCurrentUser: async () => ({ id: "user", timeZone: TZ }), getUserById: async () => ({ id: "user", timeZone: TZ }) },
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => canonicalObjects) },
    weights: { listWeightEntries: async () => DATES.map((date, index) => ({ id: `w-${date}`, measuredAt: `${date}T14:00:00.000Z`, weight: { value: 180 + index * 0.1, unit: "lb" } })) },
    dailyBriefings: {
      listCompletedBriefingsInWindow: async () => [],
      getLatestWeeklyBriefing: async () => [...briefings.values()].at(-1) ?? null,
      listDailyBriefings: async () => [...briefings.values()],
      getBriefingById: async (id) => briefings.get(id) ?? null,
    },
    goals: { getActiveGoal: async () => null, listGoals: async () => [] },
  };
  const publish = vi.fn(async ({ artifact }) => ({ committed: true, status: "created", artifact, revision: 2, commitId: "c" }));
  const service = createWeeklyNarrativeService({
    repositories,
    weeklyPersistence: { captureBaseline: () => ({ revision: 1, semanticDigest: "t", fileHash: "t" }), commit: vi.fn() },
    cadenceLifecycle: { publish },
    now: () => new Date("2026-07-12T18:00:00Z"),
  });
  return { service, publish };
}

const ordinary = () => DATES.flatMap((date, index) => [
  { canonicalId: `activity_day|${date}`, evidence_type: "activity_day", userId: "user", quality: { status: "active" }, lastObservedAt: date,
    payload: { evidence_type: "activity_day", observed_at: date, daily_activity: { move_calories: 600 + index * 10, exercise_minutes: 30 } } },
  { canonicalId: `nutrition|${date}|nutrition-day`, evidence_type: "nutrition", userId: "user", quality: { status: "active" }, lastObservedAt: date,
    payload: { evidence_type: "nutrition", observed_at: date, daily_totals: { calories: 2400, protein_g: 180, carbs_g: 250, fat_g: 70 },
      meals: [], metadata: { date, daily_totals_scope: "full_day_summary", completeness: "complete" } } },
]);

describe("Weekly legacy path is invariant to graduated Sleep", () => {
  it("publishes the identical artifact with and without sleep_night evidence; only the V3 period evidence differs", async () => {
    const withoutSleep = setup(ordinary());
    const sleep = nights();
    expect(sleep).toHaveLength(7);
    const withSleep = setup([...ordinary(), ...sleep]);
    await withoutSleep.service.generate({ userId: "user", reason: "scheduled_weekly_cadence" });
    await withSleep.service.generate({ userId: "user", reason: "scheduled_weekly_cadence" });
    const a = withoutSleep.publish.mock.calls[0][0];
    const b = withSleep.publish.mock.calls[0][0];
    expect(a.artifact.briefing.weeklyNarrative.references.length).toBeGreaterThan(0);
    expect(b.artifact).toEqual(a.artifact);
    expect(b.periodEvidence.canonicalObjects.filter((item) => item.evidence_type === "sleep_night")).toHaveLength(7);
  });
});

describe("Midweek legacy path is invariant to graduated Sleep", () => {
  it("persists the identical Midweek artifact with and without sleep_night evidence", async () => {
    const wednesday = new Date("2026-07-22T19:00:00Z");
    const dates = ["2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21"];
    const evidence = dates.flatMap((date, index) => [
      { canonicalId: `activity_day|${date}`, evidence_type: "activity_day", userId: "user-1", quality: { status: "active" }, lastObservedAt: date, updatedAt: `${date}T22:00:00Z`,
        payload: { id: `a-${date}`, evidence_type: "activity_day", observed_at: date, daily_activity: { move_calories: 650 + index, exercise_minutes: 30 } } },
    ]);
    const generate = async (canonicalObjects) => {
      const records = [];
      const user = { id: "user-1", timeZone: TZ };
      const repositories = { users: { getCurrentUser: async () => user, getUserById: async () => user }, dailyBriefings: createDailyBriefingRepository(records),
        canonicalEvidence: { listCanonicalEvidenceObjects: async () => canonicalObjects }, weights: { listWeightEntries: async () => [] },
        dexaScans: { listDEXAScans: async () => [] }, goals: { getActiveGoal: async () => ({ id: "goal-build", title: "Build Lean Mass", phases: [] }) } };
      const result = await createMidweekBriefingService({ repositories, now: () => wednesday }).generateForCurrentWindow({ asOf: wednesday });
      return result.artifact;
    };
    const sleep = nights(dates, "2026-07-22T10:00:00Z").map((item) => ({ ...item, userId: "user-1" }));
    expect(sleep).toHaveLength(6);
    const without = await generate(evidence);
    const withSleep = await generate([...evidence, ...sleep]);
    expect(without.dependencyManifest.canonicalDependencies.length).toBeGreaterThan(0);
    expect(withSleep).toEqual(without);
  });
});
