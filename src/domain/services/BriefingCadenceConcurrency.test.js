import { describe, expect, it } from "vitest";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "./HealthKitGraduation.js";
import { BRIEFING_CADENCE_CATCH_UP_POLICY } from "./BriefingCadenceRegistryService";
import { BriefingSettlementEvent as E } from "./BriefingEvidenceSettlementPolicy.js";
import {
  at, createWorker, DEADLINE, hkDay, hkRecords,
} from "../../testSupport/briefingSettlementWorld.js";

// REQUIRED CONCURRENCY VERIFICATION (deterministic interleaving).
//
// LIMITATION, stated plainly: this repository has NO local Postgres test harness
// (no pg-mem / PGlite / embedded-postgres / testcontainers dependency, no
// `postgres` binary, no docker; the existing `test:phase*:postgres` scripts need
// an externally provisioned PHYSIQUEOS_TEST_DATABASE_URL, i.e. a database this
// task must not touch). So nothing below is a real-Postgres test and none of it
// claims to be. What it does prove is the REAL executor + REAL gate + REAL
// HealthKit reader + REAL Midweek generator + REAL artifact repository (claim /
// complete / replace) under controlled promise ordering, with a lock model that
// mirrors PostgresBriefingCadenceExecutionLock (session-level, non-blocking
// pg_try_advisory_lock; released by release()/releaseAfter()). The Postgres
// specifics (advisory-lock hashing, row-level serialization, revision-conflict
// retry) are exercised for real only by the production database.

// pg_try_advisory_lock model: one key, non-blocking, released explicitly.
function advisoryLockModel() {
  let holder = null;
  return {
    get holder() { return holder; },
    forWorker(name) {
      return {
        async acquire() {
          if (holder) return { acquired: false, reason: "executor_lock_active", async release() {} };
          holder = name;
          let released = false;
          const release = async () => { if (released) return; released = true; if (holder === name) holder = null; };
          return { acquired: true, reason: null, release, releaseAfter(operation) { void Promise.resolve(operation).then(release, release); } };
        },
      };
    },
  };
}

// A latch: `hold()` resolves only after `open()`.
function latch() {
  let open;
  const opened = new Promise((resolve) => { open = resolve; });
  let reached;
  const arrived = new Promise((resolve) => { reached = resolve; });
  return { open, hold: async () => { reached(); await opened; }, arrived };
}

const events = (logs, ...names) => logs.filter((entry) => names.includes(entry.event)).map((entry) => `${entry.worker}:${entry.event}`);

describe("two workers, one advisory lock (the deployed topology)", () => {
  it("while worker A holds the lock mid-generation, worker B stands down; exactly one artifact, one watermark, one generated/published", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    const logs = [];
    const locks = advisoryLockModel();
    const gate = latch();
    const a = createWorker({ name: "a", artifactRecords, hk, logs, lock: locks.forWorker("a"), beforeEvidenceRead: () => gate.hold() });
    const b = createWorker({ name: "b", artifactRecords, hk, logs, lock: locks.forWorker("b") });

    const aRun = a.run(at(5));
    await gate.arrived; // A: lock held, claim written, generator suspended mid-generation
    expect(locks.holder).toBe("a");
    expect(artifactRecords).toHaveLength(1);
    expect(artifactRecords[0].briefing ?? null).toBeNull(); // the in-progress claim

    const bOutcome = await b.run(at(5));
    expect(bOutcome).toMatchObject({ resultStatus: "generation_in_progress", artifactOutcome: "lock_owned_by_another_executor", retryability: true });
    expect(b.generate).not.toHaveBeenCalled();

    gate.open();
    expect((await aRun).resultStatus).toBe("generation_completed");
    expect(locks.holder).toBeNull();
    expect(artifactRecords).toHaveLength(1);
    expect(artifactRecords[0].evidenceSettlement).toMatchObject({ publishReasonCode: "readiness_satisfied", generatedAt: at(5), deadlineFallback: false });

    // B's next tick: the occurrence is complete; nothing more happens.
    expect((await b.run(at(10))).resultStatus).toBe("already_completed");
    expect(events(logs, E.BRIEFING_GENERATED, E.BRIEFING_PUBLISHED)).toEqual(["a:briefing_settlement.briefing_generated", "a:briefing_settlement.briefing_published"]);
    expect(artifactRecords).toHaveLength(1);
  });

  it("the lock is always released: after a generator failure, the other worker can proceed on its own tick (no deadlock)", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    const logs = [];
    const locks = advisoryLockModel();
    const a = createWorker({ name: "a", artifactRecords, hk, logs, lock: locks.forWorker("a"),
      generatorWrap: async () => { throw new Error("boom"); } });
    const b = createWorker({ name: "b", artifactRecords, hk, logs, lock: locks.forWorker("b") });
    expect((await a.run(at(5))).resultStatus).toBe("transient_failure");
    expect(locks.holder).toBeNull();
    expect((await b.run(at(10))).resultStatus).toBe("generation_completed");
    expect(artifactRecords).toHaveLength(1);
    expect(events(logs, E.BRIEFING_GENERATED)).toEqual(["b:briefing_settlement.briefing_generated"]);
  });

  it("a generator timeout retains the lock until the operation settles, then releases it (no unsafe overlap, no permanent lock)", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    const logs = [];
    const locks = advisoryLockModel();
    const gate = latch();
    const policy = { ...BRIEFING_CADENCE_CATCH_UP_POLICY, generatorTimeoutMs: 10 };
    const a = createWorker({ name: "a", artifactRecords, hk, logs, lock: locks.forWorker("a"), policy, beforeEvidenceRead: () => gate.hold() });
    const b = createWorker({ name: "b", artifactRecords, hk, logs, lock: locks.forWorker("b") });
    const aOutcome = await a.run(at(5));
    expect(aOutcome).toMatchObject({ resultStatus: "transient_failure", failureCategory: "generator_timeout" });
    expect(locks.holder).toBe("a"); // retained: the abandoned generator is still running
    expect((await b.run(at(6))).resultStatus).toBe("generation_in_progress");
    gate.open();
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the abandoned generator finish and releaseAfter run
    expect(locks.holder).toBeNull();
    expect(artifactRecords).toHaveLength(1);
    expect(artifactRecords[0].briefing).toBeTruthy(); // the slow generator DID finish, once
    expect((await b.run(at(11))).resultStatus).toBe("already_completed");
  });

  it("a persistently failing generator is attempted exactly once per tick: no internal retry loop", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    const a = createWorker({ name: "a", artifactRecords, hk, generatorWrap: async () => { throw new Error("boom"); } });
    for (const minutes of [5, 10, 15, 20]) await a.run(at(minutes));
    expect(a.generate).toHaveBeenCalledTimes(4);
  });
});

describe("two workers with NO shared lock: the canonical claim is the second line of defence", () => {
  it("B evaluating while A is mid-generation sees the active canonical claim, emits no generated/published, and the existing artifact wins", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    const logs = [];
    const gate = latch();
    const a = createWorker({ name: "a", artifactRecords, hk, logs, beforeEvidenceRead: () => gate.hold() });
    const b = createWorker({ name: "b", artifactRecords, hk, logs });
    const aRun = a.run(at(5));
    await gate.arrived;
    const bOutcome = await b.run(at(5));
    expect(bOutcome).toMatchObject({ resultStatus: "generation_in_progress", artifactOutcome: "canonical_claim_active", retryability: true });
    expect(events(logs, E.BRIEFING_GENERATED, E.BRIEFING_PUBLISHED)).toEqual([]);
    gate.open();
    expect((await aRun).resultStatus).toBe("generation_completed");
    expect(artifactRecords).toHaveLength(1);
    expect((await b.run(at(10))).resultStatus).toBe("already_completed");
    expect(events(logs, E.BRIEFING_GENERATED)).toEqual(["a:briefing_settlement.briefing_generated"]);
    expect(artifactRecords[0].evidenceSettlement.generatedAt).toBe(at(5));
  });

  it("a duplicate generator call after completion is idempotent and cannot alter the authoritative watermark", async () => {
    const hk = hkRecords();
    const artifactRecords = [];
    const a = createWorker({ name: "a", artifactRecords, hk });
    const b = createWorker({ name: "b", artifactRecords, hk });
    await a.run(at(5));
    const authoritative = JSON.stringify(artifactRecords[0].evidenceSettlement);
    const again = await b.midweekService.generateForCurrentWindow({ userId: "user_founder_001", asOf: new Date(at(90)) });
    expect(again).toMatchObject({ state: "completed", idempotent: true });
    expect(JSON.stringify(artifactRecords[0].evidenceSettlement)).toBe(authoritative);
    expect(artifactRecords).toHaveLength(1);
  });
});

describe("readiness transition vs hard deadline: the first claimant's observation wins, deterministically", () => {
  async function race({ deadlineWorkerFirst }) {
    const hk = hkRecords({ nutrition: "partial_day" });
    const artifactRecords = [];
    const logs = [];
    const gate = latch();
    const first = deadlineWorkerFirst
      ? createWorker({ name: "deadline", artifactRecords, hk, logs, beforeEvidenceRead: () => gate.hold() })
      : createWorker({ name: "ready", artifactRecords, hk, logs, beforeEvidenceRead: () => gate.hold() });
    const second = deadlineWorkerFirst
      ? createWorker({ name: "ready", artifactRecords, hk, logs })
      : createWorker({ name: "deadline", artifactRecords, hk, logs });

    // Both observations are made at/after the deadline; the difference is whether the
    // worker read Nutrition before or after it settled (revision 2, complete_day).
    const settle = () => hk.put({ collection: HEALTHKIT_CANONICAL_DAY_COLLECTION,
      recordId: "healthkit_canonical_day_nutrition_2026-09-15", payload: hkDay("nutrition", "complete_day", 2) });
    let firstRun; let secondOutcome;
    if (deadlineWorkerFirst) {
      firstRun = first.run(at(DEADLINE)); // reads partial_day -> deadline fallback, claims, suspends
      await gate.arrived;
      await settle();
      secondOutcome = await second.run(at(DEADLINE + 1)); // reads complete_day -> readiness_satisfied, finds the claim
    } else {
      await settle();
      firstRun = first.run(at(DEADLINE)); // reads complete_day -> readiness_satisfied, claims, suspends
      await gate.arrived;
      secondOutcome = await second.run(at(DEADLINE + 1));
    }
    gate.open();
    const firstOutcome = await firstRun;
    return { artifactRecords, logs, firstOutcome, secondOutcome };
  }

  it("deadline worker claims first: one artifact carrying the deadline-fallback watermark of ITS (pre-settlement) observation", async () => {
    const { artifactRecords, logs, firstOutcome, secondOutcome } = await race({ deadlineWorkerFirst: true });
    expect(firstOutcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "hard_deadline_reached" });
    expect(secondOutcome).toMatchObject({ resultStatus: "generation_in_progress", artifactOutcome: "canonical_claim_active" });
    expect(artifactRecords).toHaveLength(1);
    expect(artifactRecords[0].evidenceSettlement).toMatchObject({
      deadlineFallback: true, unsettledDomainsAtGeneration: ["nutrition"], readyAtGeneration: false });
    expect(artifactRecords[0].evidenceSettlement.domains.nutrition).toMatchObject({ coverage: "partial_day", revision: 1 });
    expect(events(logs, E.BRIEFING_GENERATED)).toEqual(["deadline:briefing_settlement.briefing_generated"]);
    expect(events(logs, E.DEADLINE_FALLBACK_USED, E.READINESS_SATISFIED).sort()).toEqual([
      "deadline:briefing_settlement.deadline_fallback_used", "ready:briefing_settlement.readiness_satisfied"]);
  });

  it("readiness worker claims first: one artifact with the normal-readiness watermark (revision 2), never a fallback", async () => {
    const { artifactRecords, logs, firstOutcome, secondOutcome } = await race({ deadlineWorkerFirst: false });
    expect(firstOutcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(secondOutcome.resultStatus).toBe("generation_in_progress");
    expect(artifactRecords).toHaveLength(1);
    expect(artifactRecords[0].evidenceSettlement).toMatchObject({ deadlineFallback: false, readyAtGeneration: true, unsettledDomainsAtGeneration: [] });
    expect(artifactRecords[0].evidenceSettlement.domains.nutrition).toMatchObject({ coverage: "complete_day", revision: 2 });
    expect(events(logs, E.BRIEFING_GENERATED)).toEqual(["ready:briefing_settlement.briefing_generated"]);
  });

  it("the loser's next tick never regenerates or rewrites: it sees the existing artifact and stays silent", async () => {
    const { artifactRecords, logs } = await race({ deadlineWorkerFirst: true });
    const before = JSON.stringify(artifactRecords);
    const count = logs.length;
    const hk = hkRecords();
    const loser = createWorker({ name: "loser", artifactRecords, hk, logs });
    expect((await loser.run(at(DEADLINE + 5))).resultStatus).toBe("already_completed");
    expect(JSON.stringify(artifactRecords)).toBe(before);
    expect(logs.length).toBe(count);
  });
});
