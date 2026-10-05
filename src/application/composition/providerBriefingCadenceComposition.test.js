import { describe, expect, it, vi } from "vitest";

const captured = {};
vi.mock("../../domain/services/BriefingCadenceExecutorService", () => ({
  createBriefingCadenceExecutor: (options) => ({
    async execute() {
      captured.repositories = options.repositories;
      captured.generators = options.generators;
      captured.settlementObserver = options.settlementObserver;
      captured.settlementGate = options.settlementGate;
      captured.logger = options.logger;
      // Mimic the one real-executor action this file's tests care about:
      // beginTick() is the settlement gate's own per-tick reset. The real
      // executor always calls it; a stub that skipped it would hide a bug
      // where the composition relies on the executor for a reset the
      // composition itself must also guarantee before the overlay above runs.
      await options.settlementGate?.beginTick();
      // Additive hook: lets a test act like the executor's per-entry settlement
      // evaluation, INSIDE the tick (after beginTick, before the run ends).
      await captured.duringExecute?.(options);
      return { ok: true };
    },
  }),
}));
const readerCallOrder = [];
vi.mock("../../platform/database/HealthKitGraduationReader.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createHealthKitGraduationReader: (...args) => {
      const real = actual.createHealthKitGraduationReader(...args);
      return {
        ...real,
        beginRun: (...a) => { readerCallOrder.push("beginRun"); return real.beginRun(...a); },
        overlay: async (...a) => { readerCallOrder.push("overlay"); return real.overlay(...a); },
        readSettlementCoverage: async (...a) => { readerCallOrder.push("readSettlementCoverage"); return real.readSettlementCoverage(...a); },
      };
    },
  };
});
vi.mock("../../domain/services/WeeklyNarrativeService", () => ({
  createWeeklyNarrativeService: (options) => { captured.weekly = options; return {}; },
}));
vi.mock("../../domain/services/MidweekBriefingService", () => ({
  createMidweekBriefingService: (options) => { captured.midweek = options; return {}; },
}));
vi.mock("../../domain/services/MonthlyBriefingService", () => ({
  createFounderMonthlyBriefingService: (options) => { captured.monthly = options; return {}; },
}));
vi.mock("../../domain/services/CanonicalBriefingConfidencePublicationService", () => ({
  createCanonicalBriefingConfidencePublicationService: (options) => { captured.publication = options; return {}; },
}));
vi.mock("../../domain/services/PICadenceBriefingLifecycleService", () => ({
  createPICadenceBriefingLifecycleService: () => ({}),
}));
vi.mock("../../platform/database/PostgresBriefingCadenceExecution", () => ({
  createPostgresBriefingCadenceExecutionLock: () => ({}),
  createPostgresBriefingCadenceExecutionStore: () => ({}),
}));

import { createProviderBriefingCadenceRunner } from "./providerBriefingCadenceComposition.js";
import {
  oct2CanonicalWorkout,
  oct2CooldownInput,
  oct2StairStepperInput,
  oct2WalkInput,
} from "../../fixtures/healthKitOct2StairStepperCooldownFixture.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID as POLICY_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION as SCHEMA,
} from "../../domain/services/HealthKitGraduation.js";

const OWNER = "user_founder_001";
const DATE = "2026-09-21";
const policy = (evidenceEligibility, projection = { enabled: false }) => ({
  id: POLICY_ID, schemaVersion: SCHEMA, version: 1, historicalBriefingRegeneration: false, projection, evidenceEligibility,
});
const on = { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null };
const day = (domain, coverage = "complete_day") => ({
  id: `healthkit_canonical_day_${domain}_${DATE}`, domain, localDate: DATE, userId: OWNER, revision: 1, version: 1, semanticFingerprint: "s",
  createdAt: `${DATE}T15:00:00.000Z`, updatedAt: `${DATE}T22:00:00.000Z`,
  current: domain === "activity"
    ? { coverage, sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: 612, exercise_minutes: 41, stand_hours: 11 } } }
    : { coverage, sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: 2140 }, dailyTotalsScope: coverage === "complete_day" ? "full_day_summary" : "partial_meal_subtotal", mealObjects: 0 } },
  provenance: { sourceObservationIds: ["healthkit_observation_x"] },
});

async function run({ policyRecord = null, days = [], workouts = [], sleepActivation = null, sleepDays = [], asOf = "2026-09-22T10:00:00.000Z" } = {}) {
  const runtime = { user: { id: OWNER, timeZone: "America/Los_Angeles" }, canonicalEvidenceObjects: [] };
  sleepQueries.length = 0;
  const pool = { query: vi.fn(async (text, values = []) => {
    if (/record_id=\$3/.test(text) && values[2] === SLEEP_ACTIVATION_ID) return { rows: sleepActivation ? [{ payload: sleepActivation, version: 1 }] : [] };
    if (/record_id=\$3/.test(text)) return { rows: policyRecord ? [{ payload: policyRecord, version: 1 }] : [] };
    if (values[1] === "healthKitSleepDays") {
      sleepQueries.push({ text, values });
      const [, , startDate, endDate] = values;
      return { rows: sleepDays.filter((night) => night.sleepDay >= startDate && night.sleepDay <= endDate).map((payload) => ({ payload, version: 1 })) };
    }
    if (values[1] === "healthKitCanonicalDays") return { rows: days.map((payload) => ({ payload, version: 1 })) };
    if (values[1] === "healthKitCanonicalWorkouts") return { rows: workouts.map((payload) => ({ payload, version: 1 })) };
    return { rows: [] };
  }) };
  const authorityStore = { read: async () => ({ state: {
    authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
    firstProviderCanonicalWriteAt: "2026-09-01T00:00:00.000Z", firstProviderCommandId: "cmd",
  } }) };
  const runner = createProviderBriefingCadenceRunner({
    pool, ownerUserId: OWNER, authorityStore,
    loadCanonicalRuntime: async () => runtime,
    loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
  });
  await runner.execute({ asOf: new Date(asOf) });
  const seen = await captured.repositories.canonicalEvidence.listCanonicalEvidenceObjects(OWNER);
  return { runtime, seen };
}

describe("provider briefing cadence: graduated HealthKit evidence", () => {
  it("is unchanged when graduation is absent", async () => {
    const { seen } = await run({ days: [day("activity")] });
    expect(seen).toEqual([]);
  });

  it("gives generators complete graduated days as ordinary evidence only under the eligibility scope", async () => {
    const { seen, runtime } = await run({ policyRecord: policy(on), days: [day("activity"), day("nutrition")] });
    expect(seen.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
    expect(seen.every((object) => object.payload.evidenceEligibility.state === "eligible")).toBe(true);
    // The publication and Confidence stores keep the raw runtime.
    expect(runtime.canonicalEvidenceObjects).toEqual([]);
    expect(captured.publication.liveStore).toBe(runtime);
    expect(await captured.weekly.confidenceStoreResolver()).toBe(runtime);
    expect(await captured.midweek.confidenceStoreResolver()).toBe(runtime);
  });

  it("does not let projection alone reach generation (independence)", async () => {
    const { seen } = await run({ policyRecord: policy({ enabled: false }, on), days: [day("activity"), day("nutrition")] });
    expect(seen).toEqual([]);
  });

  it("never lets a partial day reach generation", async () => {
    const { seen } = await run({ policyRecord: policy(on), days: [day("activity", "partial_day"), day("nutrition", "partial_day")] });
    expect(seen).toEqual([]);
  });

  it("gives every cadence briefing generator (Weekly, Midweek and Monthly share one snapshot) a graduated Stair Stepper but never a Cooldown", async () => {
    const workouts = [
      oct2CanonicalWorkout(oct2WalkInput()),
      oct2CanonicalWorkout(oct2StairStepperInput()),
      oct2CanonicalWorkout(oct2CooldownInput()),
    ];
    const cardioOn = { enabled: true, domains: ["cardio_training"], startLocalDate: "2026-09-25", endLocalDate: null };
    const { seen, runtime } = await run({ policyRecord: policy(cardioOn), workouts });
    expect(seen.map((object) => object.payload.metadata.activity_type).sort()).toEqual(["Outdoor Walk", "Stair Stepper"]);
    expect(seen.every((object) => object.payload.evidenceEligibility.state === "eligible")).toBe(true);
    expect(JSON.stringify(seen)).not.toMatch(/cooldown/i);
    expect(captured.weekly.repositories).toBe(captured.repositories);
    expect(captured.midweek.repositories).toBe(captured.repositories);
    expect(captured.monthly.repositories).toBe(captured.repositories);
    // Confidence publication keeps the raw runtime (no HealthKit workout at all).
    expect(runtime.canonicalEvidenceObjects).toEqual([]);
    expect(await captured.weekly.confidenceStoreResolver()).toBe(runtime);
    // Same snapshot without the Cooldown: byte-identical generator evidence.
    const { seen: withoutCooldown } = await run({ policyRecord: policy(cardioOn), workouts: workouts.slice(0, 2) });
    expect(seen).toEqual(withoutCooldown);
  });

  it("keeps the generation snapshot read-only", async () => {
    await run({ policyRecord: policy(on), days: [day("activity")] });
    await expect(Promise.resolve().then(() => captured.repositories.canonicalEvidence.upsertCanonicalEvidenceObjects([{ canonicalId: "x" }])))
      .rejects.toMatchObject({ code: "PROVIDER_CADENCE_SNAPSHOT_WRITE_FORBIDDEN" });
  });

  it("begins a fresh reader run before the evidence overlay reads, on the SAME runner's second tick — not only its first", async () => {
    // The overlay above and the settlement gate share one reader instance,
    // constructed once per runner and reused across every execute() tick.
    // The reader only clears its per-run policy memo when beginRun() is
    // called explicitly; it does not expire on its own, and by the second
    // tick the executor's OWN settlementGate.beginTick() reset (mimicked by
    // this file's executor stub, see readerCallOrder above) has already run
    // once before. The overlay runs before the executor on every tick, so
    // execute() itself must call beginRun() again on tick two — relying on
    // tick one's now-stale reset would leave the overlay reading a memo left
    // over from the previous tick for as long as a cadence sits waiting.
    const policyRecord = policy(on);
    const days = [day("activity"), day("nutrition")];
    const runtime = { user: { id: OWNER, timeZone: "America/Los_Angeles" }, canonicalEvidenceObjects: [] };
    const pool = { query: async (text, values = []) => {
      if (/record_id=\$3/.test(text)) return { rows: [{ payload: policyRecord, version: 1 }] };
      if (values[1] === "healthKitCanonicalDays") return { rows: days.map((payload) => ({ payload, version: 1 })) };
      return { rows: [] };
    } };
    const authorityStore = { read: async () => ({ state: {
      authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
      firstProviderCanonicalWriteAt: "2026-09-01T00:00:00.000Z", firstProviderCommandId: "cmd",
    } }) };
    const runner = createProviderBriefingCadenceRunner({
      pool, ownerUserId: OWNER, authorityStore,
      loadCanonicalRuntime: async () => runtime,
      loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
    });
    readerCallOrder.length = 0;
    await runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") });
    const tickOneBeginRunCount = readerCallOrder.filter((event) => event === "beginRun").length;
    const tickOneOverlayIndex = readerCallOrder.indexOf("overlay");
    expect(readerCallOrder.lastIndexOf("beginRun", tickOneOverlayIndex)).toBe(0);
    expect(tickOneBeginRunCount).toBeGreaterThanOrEqual(1);

    readerCallOrder.length = 0;
    await runner.execute({ asOf: new Date("2026-09-22T10:05:00.000Z") });
    const tickTwoOverlayIndex = readerCallOrder.indexOf("overlay");
    // The critical assertion: on this SAME runner's SECOND tick, a beginRun()
    // still precedes the overlay — proving execute() resets before every
    // tick's overlay, not only the runner's first tick.
    expect(tickTwoOverlayIndex).toBeGreaterThan(0);
    expect(readerCallOrder.slice(0, tickTwoOverlayIndex)).toContain("beginRun");
  });
});

const SLEEP_ACTIVATION_ID = "healthkit_sleep_canonical_activation_policy";
const sleepQueries = [];
const sleepActivation = { id: SLEEP_ACTIVATION_ID, status: "enabled", schemaVersion: "healthkit-sleep-activation-policy-v1", mode: "validation_only",
  effectiveSleepDay: "2026-10-02", timeZone: "America/Los_Angeles", openEnded: true, strategicEvidenceEligibility: "quarantined", historicalBackfill: false };
const sleepNight = (sleepDay) => {
  const next = new Date(`${sleepDay}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return { id: `healthkit_sleep_day_${sleepDay}`, sleepDay, occurrenceDate: sleepDay, revision: 2, algorithmVersion: "sleep-canon-v3",
    status: "asleep_recorded", ingestionPurpose: "validation_only", timeZone: "America/Los_Angeles",
    windowClosesAt: `${next.toISOString().slice(0, 10)}T01:00:00.000Z`, computedAt: `${sleepDay}T15:00:00.000Z`, mainEpisodeIndex: 0,
    mainSleep: { asleepSeconds: 27000, awakeSeconds: 1800, inBedSeconds: 30000, coreSeconds: 15000, deepSeconds: 6000, remSeconds: 6000, unspecifiedSeconds: 0 },
    episodes: [{ kind: "main", start: "x", end: "y", timeZone: "America/Los_Angeles", primarySource: { sourceFamily: "oura" },
      completeness: { asleepData: "present", stageDetail: "staged", sourceBasis: "sensor" } }] };
};
const nights = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map(sleepNight);
const withSleep = { enabled: true, domains: ["activity", "cardio_training", "nutrition", "sleep"], startLocalDate: "2026-09-22", endLocalDate: null };

describe("provider briefing cadence: prospective Sleep graduation", () => {
  it("adds nothing (and reads no Sleep) while the evidence scope does not name sleep", async () => {
    const { seen } = await run({ policyRecord: policy({ ...withSleep, domains: ["activity", "cardio_training", "nutrition"] }), sleepActivation, sleepDays: nights, asOf: "2026-10-05T10:00:00.000Z" });
    expect(seen).toEqual([]);
    expect(sleepQueries).toEqual([]);
  });

  it("gives every generator only the completed nights on/after the Founder-approved D0, read in one bounded range", async () => {
    // 03:00 PDT Oct 5: Oct 4's 18:00 window closed at 01:00Z; Oct 5's has not.
    const { seen, runtime } = await run({ policyRecord: policy(withSleep), sleepActivation, sleepDays: [...nights, sleepNight("2026-10-05")], asOf: "2026-10-05T10:00:00.000Z" });
    expect(seen.map((object) => [object.evidence_type, object.payload.sleep_day])).toEqual([
      ["sleep_night", "2026-10-02"], ["sleep_night", "2026-10-03"], ["sleep_night", "2026-10-04"],
    ]);
    expect(sleepQueries).toHaveLength(1);
    expect(sleepQueries[0].values.slice(2)).toEqual(["2026-10-02", "2026-10-06"]);
    // Confidence and publication keep the raw runtime: no Sleep there.
    expect(runtime.canonicalEvidenceObjects).toEqual([]);
    expect(await captured.weekly.confidenceStoreResolver()).toBe(runtime);
    expect(captured.midweek.repositories).toBe(captured.repositories);
    expect(captured.monthly.repositories).toBe(captured.repositories);
  });

  it("keeps the still-updating night out until its window closes", async () => {
    const before = await run({ policyRecord: policy(withSleep), sleepActivation, sleepDays: nights, asOf: "2026-10-05T00:59:00.000Z" });
    expect(before.seen.map((object) => object.payload.sleep_day)).toEqual(["2026-10-02", "2026-10-03"]);
    const after = await run({ policyRecord: policy(withSleep), sleepActivation, sleepDays: nights, asOf: "2026-10-05T01:00:00.000Z" });
    expect(after.seen.map((object) => object.payload.sleep_day)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("fails closed when Sleep ingestion is not enabled", async () => {
    const { seen } = await run({ policyRecord: policy(withSleep), sleepActivation: { ...sleepActivation, status: "disabled" }, sleepDays: nights, asOf: "2026-10-05T10:00:00.000Z" });
    expect(seen).toEqual([]);
  });
});

describe("provider briefing cadence: settlement observability + fail-closed wiring", () => {
  const authorityStore = { read: async () => ({ state: {
    authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
    firstProviderCanonicalWriteAt: "2026-09-01T00:00:00.000Z", firstProviderCommandId: "cmd",
  } }) };
  const runtime = () => ({ user: { id: OWNER, timeZone: "America/Los_Angeles" }, canonicalEvidenceObjects: [] });

  it("hands EVERY tick's executor the SAME settlement observer (its dedup memory outlives a tick) wired to the worker logger", async () => {
    const policyRecord = policy(on);
    const pool = { query: async (text, values = []) => {
      if (/record_id=\$3/.test(text)) return { rows: [{ payload: policyRecord, version: 1 }] };
      if (values[1] === "healthKitCanonicalDays") return { rows: [] };
      return { rows: [] };
    } };
    const logger = { info() {}, warn() {}, error() {} };
    const runner = createProviderBriefingCadenceRunner({
      pool, ownerUserId: OWNER, authorityStore, logger,
      loadCanonicalRuntime: async () => runtime(),
      loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
    });
    await runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") });
    const first = captured.settlementObserver;
    await runner.execute({ asOf: new Date("2026-09-22T10:05:00.000Z") });
    expect(first).toBeDefined();
    expect(captured.settlementObserver).toBe(first);
    expect(captured.logger).toBe(logger);
  });

  it("a transient read failure during the tick's evidence overlay makes the real gate WAIT (fail closed), not generate", async () => {
    const policyRecord = policy(on);
    let failing = true;
    const pool = { query: async (text, values = []) => {
      if (/record_id=\$3/.test(text)) return { rows: [{ payload: policyRecord, version: 1 }] };
      if (values[1] === "healthKitCanonicalDays") {
        if (failing) throw Object.assign(new Error("connection reset host=db.internal"), { code: "ECONNRESET" });
        return { rows: [day("activity"), day("nutrition")].map((payload) => ({ payload, version: 1 })) };
      }
      return { rows: [] };
    } };
    const runner = createProviderBriefingCadenceRunner({
      pool, ownerUserId: OWNER, authorityStore,
      loadCanonicalRuntime: async () => runtime(),
      loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
    });
    await runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") });
    const args = { finalEvidenceDate: DATE, earliestPublishAt: "2026-09-22T10:00:00.000Z", now: "2026-09-22T10:05:00.000Z" };
    const held = await captured.settlementGate.evaluate(args);
    expect(held).toMatchObject({ action: "retry", reasonCode: "coverage_read_failed", coverageReadFailed: true });
    expect(JSON.stringify(held)).not.toMatch(/db\.internal|connection reset/iu);
    // The store recovers: the next tick's overlay reads cleanly and the same gate proceeds normally.
    failing = false;
    await runner.execute({ asOf: new Date("2026-09-22T10:10:00.000Z") });
    const proceed = await captured.settlementGate.evaluate({ ...args, now: "2026-09-22T10:10:00.000Z" });
    expect(proceed).toMatchObject({ action: "generate", reasonCode: "readiness_satisfied" });
  });
});

describe("provider briefing cadence: ONE coherent HealthKit snapshot per tick (review N2)", () => {
  const authorityStore = { read: async () => ({ state: {
    authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
    firstProviderCanonicalWriteAt: "2026-09-01T00:00:00.000Z", firstProviderCommandId: "cmd",
  } }) };
  const atRevision = (domain, revision) => {
    const base = day(domain);
    return { ...base, revision, version: revision, current: { ...base.current, revision, canonicalRecordId: `canon_${domain}` } };
  };

  it("the evidence overlay and the gate's coverage share one day-list read even though the canonical store advances between them; the gate adopts the composition's run", async () => {
    const policyRecord = policy(on);
    const state = { revision: 1, dayQueries: 0 };
    const pool = { query: async (text, values = []) => {
      if (/record_id=\$3/.test(text)) return { rows: [{ payload: policyRecord, version: 1 }] };
      if (values[1] === "healthKitCanonicalDays") {
        state.dayQueries += 1;
        const rows = [atRevision("activity", state.revision), atRevision("nutrition", state.revision)].map((payload) => ({ payload, version: 1 }));
        state.revision = 2; // a background sync lands right after this read
        return { rows };
      }
      return { rows: [] };
    } };
    const runner = createProviderBriefingCadenceRunner({
      pool, ownerUserId: OWNER, authorityStore,
      loadCanonicalRuntime: async () => ({ user: { id: OWNER, timeZone: "America/Los_Angeles" }, canonicalEvidenceObjects: [] }),
      loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
    });
    const inside = {};
    captured.duringExecute = async (options) => {
      inside.decision = await options.settlementGate.evaluate({ finalEvidenceDate: DATE, earliestPublishAt: "2026-09-22T10:00:00.000Z", now: "2026-09-22T10:05:00.000Z" });
      inside.evidence = await options.repositories.canonicalEvidence.listCanonicalEvidenceObjects(OWNER);
      inside.dayQueriesInTick = state.dayQueries;
    };
    try {
      readerCallOrder.length = 0;
      await runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") });
    } finally { captured.duringExecute = null; }
    expect(inside.decision).toMatchObject({ action: "generate", reasonCode: "readiness_satisfied" });
    expect(inside.decision.readiness.domains.activity.revision).toBe(1);
    expect(inside.evidence.map((object) => object.provenance.healthkit_canonical_day_revision)).toEqual([1, 1]);
    expect(inside.dayQueriesInTick).toBe(1); // overlay + coverage: one read
    // The run began before the overlay and the gate did not begin another run in front of coverage.
    expect(readerCallOrder.slice(0, 2)).toEqual(["beginRun", "overlay"]);
    expect(readerCallOrder.filter((event) => event === "beginRun")).toHaveLength(1);

    // The run ended with the tick: a later read is fresh (revision 2), never a stale memo.
    const after = await captured.settlementGate.evaluate({ finalEvidenceDate: DATE, earliestPublishAt: "2026-09-22T10:00:00.000Z", now: "2026-09-22T10:10:00.000Z" });
    expect(after.readiness.domains.activity.revision).toBe(2);
    expect(state.dayQueries).toBe(2);
  });

  it("the run is ended even when the tick throws (a failed tick never leaves a snapshot behind)", async () => {
    const policyRecord = policy(on);
    const state = { revision: 1 };
    const pool = { query: async (text, values = []) => {
      if (/record_id=\$3/.test(text)) return { rows: [{ payload: policyRecord, version: 1 }] };
      if (values[1] === "healthKitCanonicalDays") return { rows: [atRevision("activity", state.revision)].map((payload) => ({ payload, version: 1 })) };
      return { rows: [] };
    } };
    const runner = createProviderBriefingCadenceRunner({
      pool, ownerUserId: OWNER, authorityStore,
      loadCanonicalRuntime: async () => ({ user: { id: OWNER }, canonicalEvidenceObjects: [] }),
      loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
    });
    captured.duringExecute = async () => { throw new Error("tick failed"); };
    try {
      await expect(runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") })).rejects.toThrow("tick failed");
    } finally { captured.duringExecute = null; }
    state.revision = 3;
    const fresh = await captured.settlementGate.evaluate({ finalEvidenceDate: DATE, earliestPublishAt: "2026-09-22T10:00:00.000Z", now: "2026-09-22T10:05:00.000Z" });
    expect(fresh.readiness.domains.activity.revision).toBe(3);
  });
});
