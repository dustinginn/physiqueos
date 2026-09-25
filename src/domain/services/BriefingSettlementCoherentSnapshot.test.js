import { describe, expect, it, vi } from "vitest";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { createBriefingCadenceSettlementGate } from "./BriefingCadenceSettlementGate.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION, HealthKitGraduationPurpose } from "./HealthKitGraduation.js";
import { createHealthKitGraduationReader } from "../../platform/database/HealthKitGraduationReader.js";
import {
  at, createWorker, DAILY_DATE, DEADLINE, flakyRecords, hkDay, hkRecords, OWNER,
} from "../../fixtures/briefingSettlementWorld.js";

// REVIEW N2: readiness, the persisted watermark's canonical record/revision
// identities, and the generator inputs must come from ONE coherent HealthKit
// evidence snapshot per tick. The reader keeps ONE memoized read of the
// canonical-day list per run; the evidence overlay (frozen into the artifact)
// and the settlement coverage (readiness + watermark) both consume it, and the
// gate ADOPTS the run the composition began instead of resetting it.
//
// Everything here drives the REAL executor + REAL gate + REAL reader + REAL
// Midweek generator over the in-memory artifact repository, following the exact
// composition sequence per tick: beginRun -> EVIDENCE overlay (the generator's
// frozen snapshot) -> executor (gate adopts the run) -> endRun.

const EVIDENCE = HealthKitGraduationPurpose.EVIDENCE;
const dayRecordId = (domain) => `healthkit_canonical_day_${domain}_${DAILY_DATE}`;
const setDay = (hk, domain, coverage, revision) => hk.put({
  collection: HEALTHKIT_CANONICAL_DAY_COLLECTION, recordId: dayRecordId(domain), payload: hkDay(domain, coverage, revision),
});

// Wraps the shared HealthKit store: counts canonical-day list reads, and runs
// `onDayList(callNumber)` AFTER the Nth read has returned its (older) snapshot,
// so a second list() would have served the newer state.
function observedHk(hk, { onDayList = null } = {}) {
  const state = { dayLists: 0 };
  return {
    state,
    records: {
      ...hk,
      async list(args) {
        const rows = await hk.list(args);
        if (args?.collection === HEALTHKIT_CANONICAL_DAY_COLLECTION) {
          state.dayLists += 1;
          await onDayList?.(state.dayLists);
        }
        return rows;
      },
    },
  };
}

const revisionsOf = (objects) => Object.fromEntries((objects ?? []).map((object) => [
  object.payload.evidence_type === "activity_day" ? "activity" : "nutrition",
  object.provenance.healthkit_canonical_day_revision,
]));

// A worker whose generator reads evidence exactly as the composition provides
// it: the overlay snapshot taken at tick start.
function coherentWorker(options = {}) {
  const inputs = [];
  const evidenceReads = [];
  const current = { snapshot: [] };
  const worker = createWorker({
    ...options,
    generatorWrap: async (inner, input) => {
      const mark = evidenceReads.length;
      const result = await inner(input);
      inputs.push({
        // What the generator actually read (after its claim), i.e. the frozen snapshot.
        evidenceRevisions: revisionsOf(evidenceReads.length > mark ? evidenceReads[evidenceReads.length - 1] : []),
        settlementRevisions: Object.fromEntries(Object.entries(input.settlement?.readiness?.domains ?? {})
          .filter(([, state]) => state.revision != null).map(([domain, state]) => [domain, state.revision])),
      });
      return result;
    },
  });
  worker.repositories.canonicalEvidence.listCanonicalEvidenceObjects.mockImplementation(async () => {
    await options.beforeEvidenceRead?.();
    evidenceReads.push(current.snapshot);
    return current.snapshot;
  });
  const tick = async (iso) => {
    worker.reader.beginRun(); // the composition's single run per tick
    try {
      current.snapshot = await worker.reader.overlay([], { purpose: EVIDENCE });
      return await worker.run(iso);
    } finally {
      worker.reader.endRun();
    }
  };
  return Object.assign(worker, { inputs, tick, current });
}

const watermarkRevisions = (artifact) => Object.fromEntries(Object.entries(artifact.evidenceSettlement.domains)
  .filter(([, state]) => state.revision != null).map(([domain, state]) => [domain, state.revision]));

const deepFrozen = (value) => value === null || typeof value !== "object" ||
  (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

describe("N2: overlay and coverage share ONE snapshot per tick", () => {
  it("(1) the store advances to revision 2 right after the overlay read: readiness, watermark and generator inputs all stay at revision 1, never 2-with-1", async () => {
    const hk = hkRecords();
    const observed = observedHk(hk, { onDayList: (call) => call === 1 && setDay(hk, "activity", "complete_day", 2) });
    const artifactRecords = [];
    const w = coherentWorker({ artifactRecords, hk, readerHk: observed.records });

    const outcome = await w.tick(at(5));

    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(observed.state.dayLists).toBe(1); // one read for the whole tick, not one per consumer
    expect(artifactRecords).toHaveLength(1);
    expect(w.inputs).toHaveLength(1);
    expect(w.inputs[0].evidenceRevisions).toEqual({ activity: 1, nutrition: 1 });
    expect(watermarkRevisions(artifactRecords[0])).toEqual({ activity: 1, nutrition: 1 });
    expect(watermarkRevisions(artifactRecords[0])).toEqual(w.inputs[0].evidenceRevisions);
    // The store really is at revision 2 now: the old fresh-read behavior would have said 2.
    expect((await hk.get({ collection: HEALTHKIT_CANONICAL_DAY_COLLECTION, recordId: dayRecordId("activity") })).revision).toBe(2);
  });

  it("(1b) a partial day that settles right after the snapshot: the whole tick is consistently 'waiting' on the older view, and the next tick generates at the newer revision with matching inputs", async () => {
    const hk = hkRecords({ nutrition: "partial_day" });
    const observed = observedHk(hk, { onDayList: (call) => call === 1 && setDay(hk, "nutrition", "complete_day", 2) });
    const artifactRecords = [];
    const w = coherentWorker({ artifactRecords, hk, readerHk: observed.records });

    const first = await w.tick(at(5));
    expect(first).toMatchObject({ resultStatus: "awaiting_evidence_settlement", retryability: true });
    expect(first.unsettledDomains).toEqual(["nutrition"]);
    expect(w.generate).not.toHaveBeenCalled();
    expect(artifactRecords).toHaveLength(0);

    const second = await w.tick(at(35)); // ordinary background sync landed: this tick's snapshot is revision 2
    expect(second).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(w.inputs).toHaveLength(1);
    expect(w.inputs[0].evidenceRevisions).toEqual({ activity: 1, nutrition: 2 });
    expect(watermarkRevisions(artifactRecords[0])).toEqual(w.inputs[0].evidenceRevisions);
  });

  it("(2) evidence that advances AFTER the snapshot (even mid-generation) never mutates the frozen artifact; the next tick sees the newer revision", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    let advanceOnEvidenceRead = true;
    const w = coherentWorker({
      artifactRecords, hk,
      beforeEvidenceRead: async () => { if (advanceOnEvidenceRead) { advanceOnEvidenceRead = false; await setDay(hk, "nutrition", "complete_day", 2); } },
    });

    const first = await w.tick(at(5));
    expect(first.resultStatus).toBe("generation_completed");
    const stored = artifactRecords[0];
    const before = JSON.stringify(stored);
    expect(watermarkRevisions(stored)).toEqual({ activity: 1, nutrition: 1 });
    expect(w.inputs[0].evidenceRevisions).toEqual({ activity: 1, nutrition: 1 });
    expect(deepFrozen(stored.evidenceSettlement)).toBe(true);
    const digestBefore = await (async () => { w.reader.beginRun(); await w.reader.overlay([], { purpose: EVIDENCE }); const d = await w.reader.describeSnapshot(); w.reader.endRun(); return d; })();

    // Next tick: its overlay sees revision 2 ...
    w.reader.beginRun();
    const next = await w.reader.overlay([], { purpose: EVIDENCE });
    const digestNext = await w.reader.describeSnapshot();
    w.reader.endRun();
    expect(revisionsOf(next)).toEqual({ activity: 1, nutrition: 2 });
    expect(digestNext.digest).toBe(digestBefore.digest); // both taken after the advance: identical view
    // ... but the occurrence is already published: the artifact + watermark are untouched.
    expect((await w.tick(at(40))).resultStatus).toBe("already_completed");
    expect(JSON.stringify(artifactRecords[0])).toBe(before);
    expect(artifactRecords).toHaveLength(1);
    expect(w.generate).toHaveBeenCalledTimes(1);
  });

  it("(3) a rejected day-list read in tick 1 waits (fail closed, single read, no partial-view watermark); tick 2's new run recovers with a coherent overlay + coverage", async () => {
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const artifactRecords = [];
    const w = coherentWorker({ artifactRecords, hk, readerHk: flaky.records });

    flaky.setFailing(true);
    const first = await w.tick(at(5));
    expect(first).toMatchObject({ resultStatus: "awaiting_evidence_settlement", skipReason: "coverage_read_failed", retryability: true });
    expect(flaky.state.reads).toBe(1); // the rejected policy read is cached for the run: coverage did not re-read
    expect(w.generate).not.toHaveBeenCalled();
    expect(artifactRecords).toHaveLength(0);

    flaky.setFailing(false);
    flaky.state.reads = 0;
    const second = await w.tick(at(35));
    expect(second).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(flaky.state.reads).toBe(2); // one policy lookup + one day list for the whole tick
    expect(w.inputs[0].evidenceRevisions).toEqual({ activity: 1, nutrition: 1 });
    expect(watermarkRevisions(artifactRecords[0])).toEqual(w.inputs[0].evidenceRevisions);
    expect(artifactRecords).toHaveLength(1);
  });

  it("(3b) a day-list rejection AFTER a good policy read is one rejected snapshot for both consumers, cleared by the next run", async () => {
    const hk = hkRecords();
    let failList = true;
    const listCalls = { n: 0 };
    const records = { ...hk, async list(args) {
      if (args?.collection === HEALTHKIT_CANONICAL_DAY_COLLECTION) {
        listCalls.n += 1;
        if (failList) throw Object.assign(new Error("blip host=db"), { code: "ETIMEDOUT" });
      }
      return hk.list(args);
    } };
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    reader.beginRun();
    const ordinary = [];
    expect(await reader.overlay(ordinary, { purpose: EVIDENCE })).toBe(ordinary); // falls back, as today
    const coverage = await reader.readSettlementCoverage({ localDate: DAILY_DATE });
    expect(coverage.readError).toMatchObject({ stage: "evidence_overlay", code: "ETIMEDOUT" });
    expect(listCalls.n).toBe(1);
    failList = false;
    reader.beginRun();
    expect((await reader.overlay(ordinary, { purpose: EVIDENCE })).length).toBe(2);
    expect((await reader.readSettlementCoverage({ localDate: DAILY_DATE })).readError).toBeUndefined();
    expect(listCalls.n).toBe(2);
  });

  it("(4) the hard deadline uses one coherent best-available snapshot and says honestly that nutrition was unsettled", async () => {
    const hk = hkRecords({ nutrition: "partial_day" });
    const observed = observedHk(hk, { onDayList: (call) => call === 1 && setDay(hk, "nutrition", "complete_day", 2) });
    const artifactRecords = [];
    const w = coherentWorker({ artifactRecords, hk, readerHk: observed.records });

    const outcome = await w.tick(at(DEADLINE));
    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "hard_deadline_reached", settlementDeadlineFallback: true });
    expect(observed.state.dayLists).toBe(1);
    const watermark = artifactRecords[0].evidenceSettlement;
    expect(watermark).toMatchObject({ deadlineFallback: true, readyAtGeneration: false, unsettledDomainsAtGeneration: ["nutrition"] });
    expect(watermark.domains.nutrition).toMatchObject({ coverage: "partial_day", revision: 1 }); // the snapshot's view, not revision 2
    expect(watermark.domains.activity).toMatchObject({ coverage: "complete_day", revision: 1 });
    // The generator saw exactly that: partial nutrition never entered evidence.
    expect(w.inputs[0].evidenceRevisions).toEqual({ activity: 1 });
  });

  it("(5) two workers racing while evidence advances: one artifact, its watermark equals the inputs of the run that created it, and no worker ever mixes views", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let reached;
    const arrived = new Promise((resolve) => { reached = resolve; });
    const a = coherentWorker({ name: "a", artifactRecords, hk, beforeEvidenceRead: async () => { reached(); await held; } });
    const b = coherentWorker({ name: "b", artifactRecords, hk });

    const aTick = a.tick(at(5)); // overlay at revision 1, claim written, generator suspended
    await arrived;
    await setDay(hk, "activity", "complete_day", 2); // background sync lands while A is generating
    const bOutcome = await b.tick(at(5)); // B's tick starts AFTER the advance: its whole view is revision 2
    release();
    const aOutcome = await aTick;

    expect(artifactRecords).toHaveLength(1);
    expect(bOutcome).toMatchObject({ resultStatus: "generation_in_progress", artifactOutcome: "canonical_claim_active" });
    expect(aOutcome).toMatchObject({ resultStatus: "generation_completed", artifactOutcome: "created" });
    expect(a.inputs).toHaveLength(1);
    expect(a.inputs[0]).toEqual({ evidenceRevisions: { activity: 1, nutrition: 1 }, settlementRevisions: { activity: 1, nutrition: 1 } });
    expect(watermarkRevisions(artifactRecords[0])).toEqual(a.inputs[0].evidenceRevisions);
    expect(deepFrozen(artifactRecords[0].evidenceSettlement)).toBe(true);
    // B's own (coherent) view was revision 2, but it lost the claim: that watermark was never persisted onto A's revision-1 artifact.
    expect(b.inputs.map((input) => input.settlementRevisions)).toEqual([{ activity: 2, nutrition: 1 }]);
    const before = JSON.stringify(artifactRecords[0]);
    expect((await b.tick(at(40))).resultStatus).toBe("already_completed");
    expect(JSON.stringify(artifactRecords[0])).toBe(before);
    expect(artifactRecords).toHaveLength(1);
  });

  it("(6) a later cadence in the same tick, starting after an earlier cadence's slow generation (store advanced meanwhile), still uses the SAME snapshot for overlay and coverage", async () => {
    const WEDNESDAY = new Date("2026-09-16T19:00:00.000Z");
    const dates = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"];
    const days = dates.flatMap((date) => ["activity", "nutrition"].map((domain) => ({
      ...hkDay(domain, "complete_day", 1), id: `healthkit_canonical_day_${domain}_${date}`, localDate: date,
      current: { ...hkDay(domain, "complete_day", 1).current, canonicalRecordId: `canon_${domain}_${date}` },
    })));
    const base = hkRecords({ activity: null, nutrition: null });
    for (const day of days) await base.put({ collection: HEALTHKIT_CANONICAL_DAY_COLLECTION, recordId: day.id, payload: day });
    const observed = observedHk(base);
    const reader = createHealthKitGraduationReader({ records: observed.records, ownerUserId: OWNER });
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader });

    const seen = [];
    const slow = (name) => ({ generateForCurrentWindow: vi.fn(async (input) => {
      seen.push({ name, watermarkDomains: input.settlement?.watermark?.domains, at: observed.state.dayLists });
      // "Time passes": this cadence takes long; background sync lands revision 2 for every day.
      for (const day of days) await base.put({ collection: HEALTHKIT_CANONICAL_DAY_COLLECTION, recordId: day.id,
        payload: { ...day, revision: 2, current: { ...day.current, revision: 2 } } });
      return { state: "completed", artifact: { id: name }, idempotent: false };
    }) });
    const generators = { midweek: slow("midweek"), weekly: slow("weekly"), monthly: { generateForCurrentWindow: vi.fn(async () => ({ state: "not_eligible", reason: "x" })) } };
    const protocol = { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v1" };
    const user = { id: "u", timeZone: "America/Los_Angeles" };
    const repositories = {
      users: { getCurrentUser: async () => user, getUserById: async () => user },
      protocols: { listActiveProtocols: async () => [protocol] },
      protocolVersions: { getCurrentVersion: async () => ({ id: "briefings-v1", protocolId: "briefings", effectiveAt: "2026-07-01",
        coachingUpdates: { schemaVersion: "coaching_updates_schedule_v1", timeZone: "America/Los_Angeles",
          midweek: { enabled: true, day: "wednesday", localTime: "00:00" }, weekly: { enabled: true, day: "wednesday", localTime: "00:00" },
          daily: { enabled: false }, notificationPreference: "available_without_notification" } }) },
      goals: { getActiveGoal: async () => null },
      dailyBriefings: { getBriefingByEvidenceWindow: async () => null },
    };
    const executor = createBriefingCadenceExecutor({
      repositories, generators, settlementGate: gate, logger: null,
      executionStore: { createExecutionId: () => "run", async record() {},
        async getRetryState() { return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null }; } },
      executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
      source: "test",
    });

    reader.beginRun();
    const overlay = await reader.overlay([], { purpose: EVIDENCE });
    const overlayRevisions = new Set(overlay.map((object) => object.provenance.healthkit_canonical_day_revision));
    const overlayDigest = await reader.describeSnapshot();
    const result = await executor.execute({ userId: "u", asOf: WEDNESDAY });
    const digestAfter = await reader.describeSnapshot();
    reader.endRun();

    const created = result.outcomes.filter((outcome) => outcome.artifactOutcome === "created");
    expect(created).toHaveLength(2); // both cadences generated, the second one AFTER the first mutated the store
    expect(overlayRevisions).toEqual(new Set([1]));
    expect(observed.state.dayLists).toBe(1); // overlay + both coverage reads: one read total
    expect(digestAfter.digest).toBe(overlayDigest.digest);
    for (const entry of seen) {
      const revisions = Object.values(entry.watermarkDomains).map((state) => state.revision);
      expect(revisions.length).toBeGreaterThan(0);
      expect(revisions.every((revision) => revision === 1)).toBe(true); // second cadence did NOT pick up revision 2
    }
    expect(seen).toHaveLength(2);
  });
});

describe("reader run boundary (long-lived worker semantics preserved)", () => {
  const listCounter = (hk) => {
    const state = { lists: 0, gets: 0 };
    return { state, records: { ...hk,
      async list(args) { if (args?.collection === HEALTHKIT_CANONICAL_DAY_COLLECTION) state.lists += 1; return hk.list(args); },
      async get(args) { state.gets += 1; return hk.get(args); } } };
  };

  it("(7) with no run begun, every overlay and every coverage read is fresh: a revision that advances between them is seen (no stale memo across time)", async () => {
    const hk = hkRecords();
    const counter = listCounter(hk);
    const reader = createHealthKitGraduationReader({ records: counter.records, ownerUserId: OWNER });
    expect(revisionsOf(await reader.overlay([], { purpose: EVIDENCE }))).toEqual({ activity: 1, nutrition: 1 });
    await setDay(hk, "activity", "complete_day", 2);
    expect((await reader.readSettlementCoverage({ localDate: DAILY_DATE })).domainStates.activity.revision).toBe(2);
    expect(revisionsOf(await reader.overlay([], { purpose: EVIDENCE })).activity).toBe(2);
    expect(counter.state.lists).toBe(3);
    expect(await reader.describeSnapshot()).toBeNull();
  });

  it("(7b) inside a run overlay + coverage share one read; a new run re-reads; endRun returns to fresh reads and drops the snapshot", async () => {
    const hk = hkRecords();
    const counter = listCounter(hk);
    const reader = createHealthKitGraduationReader({ records: counter.records, ownerUserId: OWNER });
    reader.beginRun();
    await reader.overlay([], { purpose: EVIDENCE });
    await setDay(hk, "activity", "complete_day", 2);
    expect((await reader.readSettlementCoverage({ localDate: DAILY_DATE })).domainStates.activity.revision).toBe(1);
    expect(counter.state.lists).toBe(1);
    const first = await reader.describeSnapshot();
    expect(first).toMatchObject({ dayCount: 2 });
    expect(JSON.stringify(first)).not.toMatch(/canon_|complete_day|user_founder/u);

    reader.beginRun();
    expect((await reader.readSettlementCoverage({ localDate: DAILY_DATE })).domainStates.activity.revision).toBe(2);
    expect(counter.state.lists).toBe(2);
    expect((await reader.describeSnapshot()).digest).not.toBe(first.digest);

    reader.endRun();
    expect(await reader.describeSnapshot()).toBeNull();
    await reader.readSettlementCoverage({ localDate: DAILY_DATE });
    await reader.readSettlementCoverage({ localDate: DAILY_DATE });
    expect(counter.state.lists).toBe(4);
  });

  it("the gate ADOPTS a run the composition began (no reset), but a second gate tick, or a stand-alone gate, begins a fresh one", async () => {
    const hk = hkRecords();
    const counter = listCounter(hk);
    const reader = createHealthKitGraduationReader({ records: counter.records, ownerUserId: OWNER });
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader });
    const args = { finalEvidenceDate: DAILY_DATE, earliestPublishAt: at(0), now: at(5) };

    reader.beginRun();
    await reader.overlay([], { purpose: EVIDENCE });
    await gate.beginTick(); // adopts
    await setDay(hk, "activity", "partial_day", 2);
    expect(await gate.evaluate(args)).toMatchObject({ action: "generate", reasonCode: "readiness_satisfied" }); // still the snapshot's view
    expect(counter.state.lists).toBe(1);

    await gate.beginTick(); // second tick over the same run: must NOT re-serve the old snapshot
    expect(await gate.evaluate(args)).toMatchObject({ action: "retry" });
    expect(counter.state.lists).toBe(2);

    const standalone = listCounter(hkRecords());
    const lone = createHealthKitGraduationReader({ records: standalone.records, ownerUserId: OWNER });
    const loneGate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: lone });
    await loneGate.beginTick();
    await loneGate.evaluate(args);
    await loneGate.evaluate(args);
    expect(standalone.state.lists).toBe(1); // one snapshot per stand-alone tick
    await loneGate.beginTick();
    await loneGate.evaluate(args);
    expect(standalone.state.lists).toBe(2);
  });
});
