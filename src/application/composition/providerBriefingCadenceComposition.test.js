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

async function run({ policyRecord = null, days = [] } = {}) {
  const runtime = { user: { id: OWNER, timeZone: "America/Los_Angeles" }, canonicalEvidenceObjects: [] };
  const pool = { query: vi.fn(async (text, values = []) => {
    if (/record_id=\$3/.test(text)) return { rows: policyRecord ? [{ payload: policyRecord, version: 1 }] : [] };
    if (values[1] === "healthKitCanonicalDays") return { rows: days.map((payload) => ({ payload, version: 1 })) };
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
  await runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") });
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
