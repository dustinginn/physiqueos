import { describe, expect, it, vi } from "vitest";
import { redactStructuredValue } from "../../platform/observability/structuredLogger.js";
import { HealthKitGraduationPurpose } from "./HealthKitGraduation.js";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { createBriefingCadenceSettlementGate } from "./BriefingCadenceSettlementGate.js";
import { COVERAGE_UNKNOWN_READ_FAILED } from "./BriefingEvidenceSettlementPolicy.js";
import {
  at, createSettlementWorld, createWorker, DEADLINE, flakyRecords, hkRecords, MIDWEEK_DUE,
} from "../../fixtures/briefingSettlementWorld.js";

// BLOCKER 3: a settlement coverage/read error must FAIL CLOSED before the hard
// deadline. Only the explicit hard deadline may authorize generation while the
// coverage state cannot be read.

const EARLIEST = MIDWEEK_DUE.toISOString();
const decide = async (reader, now) => {
  const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader });
  await gate.beginTick();
  return gate.evaluate({ finalEvidenceDate: "2026-09-15", earliestPublishAt: EARLIEST, now });
};
const erroring = (error) => ({ beginRun() {}, readSettlementCoverage: async () => error });
const readError = { stage: "settlement_coverage", name: "Error", code: "ECONNRESET" };

describe("gate: a coverage read error is never 'nothing is HealthKit-backed'", () => {
  it("before the earliest publish time => wait (never generate)", async () => {
    const decision = await decide(erroring({ activeDomains: [], domainStates: {}, readError }), at(-30));
    expect(decision).toMatchObject({ action: "wait", reasonCode: "before_earliest_publish_time", coverageReadFailed: true });
  });

  it("after the earliest publish time but before the deadline => retry with reason coverage_read_failed, all domains unsettled/unknown", async () => {
    const decision = await decide(erroring({ activeDomains: [], domainStates: {}, readError }), at(5));
    expect(decision).toMatchObject({
      action: "retry", reasonCode: "coverage_read_failed", coverageReadFailed: true,
      unsettledDomains: ["activity", "nutrition"], nextCheckAt: at(35), readError,
    });
    expect(decision.readiness.ready).toBe(false);
    expect(decision.readiness.domains.activity).toMatchObject({ settled: false, coverage: COVERAGE_UNKNOWN_READ_FAILED, present: false });
    expect(decision.hardDeadlineAt).toBe(at(DEADLINE));
  });

  it("the retry is capped AT the deadline, never past it", async () => {
    const decision = await decide(erroring({ activeDomains: [], domainStates: {}, readError }), at(DEADLINE - 10));
    expect(decision).toMatchObject({ action: "retry", nextCheckAt: at(DEADLINE) });
  });

  it("at/after the hard deadline => generate best-available with the explicit fallback and unknown domains", async () => {
    for (const minutes of [DEADLINE, DEADLINE + 45]) {
      const decision = await decide(erroring({ activeDomains: [], domainStates: {}, readError }), at(minutes));
      expect(decision).toMatchObject({
        action: "generate", reasonCode: "hard_deadline_reached", coverageReadFailed: true,
        unsettledDomains: ["activity", "nutrition"],
      });
    }
  });

  it("a reader that THROWS is handled exactly like a returned readError", async () => {
    const throwing = { beginRun() {}, readSettlementCoverage: async () => { throw Object.assign(new Error("boom password=x"), { code: "EPIPE" }); } };
    const retry = await decide(throwing, at(5));
    expect(retry).toMatchObject({ action: "retry", reasonCode: "coverage_read_failed", coverageReadFailed: true,
      readError: { stage: "settlement_coverage", name: "Error", code: "EPIPE" } });
    expect(JSON.stringify(retry)).not.toMatch(/password/u);
    expect((await decide(throwing, at(DEADLINE))).action).toBe("generate");
  });

  it("a legitimate 'no HealthKit-backed domains' result is still settlement-not-applicable (not conflated with an error)", async () => {
    const decision = await decide({ beginRun() {}, readSettlementCoverage: async () => ({ activeDomains: [], domainStates: {} }) }, at(5));
    expect(decision).toMatchObject({ action: "generate", reasonCode: "no_healthkit_backed_domains_settlement_not_applicable" });
    expect(decision.coverageReadFailed).toBeUndefined();
  });
});

describe("executor over the real reader/gate/generator with a flaky HealthKit store", () => {
  function flakyWorld() {
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const world = createSettlementWorld({ hk, readerHk: flaky.records });
    return { ...world, flaky, world, run: (iso) => world.run(iso), events: () => world.events() };
  }

  it("a read error before the earliest publish time never generates (cadence is not even due yet)", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    const outcome = await w.run(at(-30));
    expect(outcome).toMatchObject({ resultStatus: "ineligible", skipReason: "before_local_eligible_time" });
    expect(w.generate).not.toHaveBeenCalled();
    expect(w.artifactRecords).toEqual([]);
  });

  it("a read error after the earliest publish time but before the deadline => awaiting/retry, NOT generated", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    const outcome = await w.run(at(5));
    expect(outcome).toMatchObject({
      resultStatus: "awaiting_evidence_settlement", skipReason: "coverage_read_failed", retryability: true,
      artifactOutcome: "none", unsettledDomains: ["activity", "nutrition"], nextRetryAt: at(35),
    });
    expect(w.generate).not.toHaveBeenCalled();
    expect(w.artifactRecords).toEqual([]);
  });

  it("repeated errors keep retrying, right up to one minute before the deadline", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    for (const minutes of [5, 40, 90, 200, 300, DEADLINE - 1]) {
      const outcome = await w.run(at(minutes));
      expect(outcome.resultStatus).toBe("awaiting_evidence_settlement");
      expect(outcome.skipReason).toBe("coverage_read_failed");
    }
    expect(w.generate).not.toHaveBeenCalled();
    expect(w.artifactRecords).toEqual([]);
  });

  it("readiness recovering before the deadline => normal generation (not a fallback), once earliest publish is met", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    expect((await w.run(at(35))).resultStatus).toBe("awaiting_evidence_settlement");
    expect((await w.run(at(70))).resultStatus).toBe("awaiting_evidence_settlement");
    w.flaky.setFailing(false);
    const outcome = await w.run(at(100));
    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied", settlementDeadlineFallback: false });
    expect(w.generate).toHaveBeenCalledOnce();
    expect(w.artifactRecords[0].evidenceSettlement).toMatchObject({
      deadlineFallback: false, coverageReadFailed: false, readyAtGeneration: true, publishReasonCode: "readiness_satisfied" });
  });

  it("a read error AT the hard deadline => generate best-available with the explicit deadline fallback, honestly persisted", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    const outcome = await w.run(at(DEADLINE));
    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "hard_deadline_reached", settlementDeadlineFallback: true });
    const mark = w.artifactRecords[0].evidenceSettlement;
    expect(mark).toMatchObject({
      deadlineFallback: true, coverageReadFailed: true, readyAtGeneration: false, publishReasonCode: "hard_deadline_reached",
      unsettledDomainsAtGeneration: ["activity", "nutrition"], settlementApplicable: true,
    });
    expect(mark.domains.activity).toMatchObject({ settled: false, present: false, coverage: COVERAGE_UNKNOWN_READ_FAILED, canonicalRecordId: null, revision: null });
    expect(mark.domains.nutrition.coverage).toBe(COVERAGE_UNKNOWN_READ_FAILED);
  });

  it("a read error AFTER the deadline (e.g. a late tick) also generates with the fallback flags", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    const outcome = await w.run(at(DEADLINE + 40));
    expect(outcome.resultStatus).toBe("generation_completed");
    expect(w.artifactRecords[0].evidenceSettlement).toMatchObject({ deadlineFallback: true, coverageReadFailed: true, generatedAt: at(DEADLINE + 40) });
  });

  it("does not require the app to be open: nothing in the path consults a device/session, only the store and the clock", async () => {
    const w = flakyWorld();
    w.flaky.setFailing(true);
    await w.run(at(5));
    w.flaky.setFailing(false);
    expect((await w.run(at(10))).resultStatus).toBe("generation_completed");
  });

  it("a silently degraded EVIDENCE overlay this tick (the composition's fail-open read) also holds generation until it recovers", async () => {
    const w = flakyWorld();
    // The provider composition overlays evidence at the start of every tick:
    w.flaky.setFailing(true);
    w.reader.beginRun();
    await w.reader.overlay([], { purpose: HealthKitGraduationPurpose.EVIDENCE });
    w.flaky.setFailing(false);
    const held = await w.run(at(5));
    expect(held).toMatchObject({ resultStatus: "awaiting_evidence_settlement", skipReason: "coverage_read_failed" });
    expect(w.generate).not.toHaveBeenCalled();
    // Next tick: the overlay reads successfully and the gate proceeds normally.
    w.reader.beginRun();
    await w.reader.overlay([], { purpose: HealthKitGraduationPurpose.EVIDENCE });
    expect((await w.run(at(10))).resultStatus).toBe("generation_completed");
  });

  it("duplicate worker evaluation around recovery: two workers, one artifact, one generation", async () => {
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const artifactRecords = [];
    const logs = [];
    const a = createWorker({ name: "a", artifactRecords, hk, readerHk: flaky.records, logs });
    const b = createWorker({ name: "b", artifactRecords, hk, readerHk: flaky.records, logs });
    flaky.setFailing(true);
    expect((await a.run(at(60))).resultStatus).toBe("awaiting_evidence_settlement");
    expect((await b.run(at(60))).resultStatus).toBe("awaiting_evidence_settlement");
    flaky.setFailing(false);
    expect((await a.run(at(65))).resultStatus).toBe("generation_completed");
    expect((await b.run(at(65))).resultStatus).toBe("already_completed");
    expect(artifactRecords).toHaveLength(1);
    expect(a.generate).toHaveBeenCalledOnce();
    expect(b.generate).not.toHaveBeenCalled();
  });

  it("duplicate worker evaluation at the deadline (errors persisting): one fallback artifact, one watermark", async () => {
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const artifactRecords = [];
    const logs = [];
    const a = createWorker({ name: "a", artifactRecords, hk, readerHk: flaky.records, logs });
    const b = createWorker({ name: "b", artifactRecords, hk, readerHk: flaky.records, logs });
    flaky.setFailing(true);
    expect((await a.run(at(DEADLINE))).resultStatus).toBe("generation_completed");
    expect((await b.run(at(DEADLINE + 5))).resultStatus).toBe("already_completed");
    expect(artifactRecords).toHaveLength(1);
    expect(artifactRecords[0].evidenceSettlement.generatedAt).toBe(at(DEADLINE));
    expect(b.generate).not.toHaveBeenCalled();
  });
});

describe("the read error is never swallowed silently (redacted operational log)", () => {
  it("emits one warn-level coverage_read_failed line per failing check carrying class/code only", async () => {
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const w = createSettlementWorld({ hk, readerHk: flaky.records });
    flaky.setFailing(true);
    await w.run(at(5));
    const line = w.logs.find((entry) => entry.event === "briefing_settlement.coverage_read_failed");
    expect(line.level).toBe("warn");
    expect(line.fields).toMatchObject({
      cadenceKey: "midweek", reasonCode: "coverage_read_failed", action: "retry",
      readErrorStage: "settlement_coverage", readErrorName: "Error", readErrorCode: "ECONNRESET", hardDeadlineAt: at(DEADLINE),
    });
    // Through the REAL production redaction: no message/host leaks and the diagnostic fields survive.
    const wire = JSON.stringify(redactStructuredValue(line.fields));
    expect(wire).not.toMatch(/db\.internal|transient store failure|password/iu);
    expect(wire).toContain("coverage_read_failed");
    expect(wire).toContain("ECONNRESET");
    // And the wait itself is still logged as an awaiting event (with the read-failure reason).
    expect(w.logs.some((entry) => entry.event === "briefing_settlement.awaiting_settlement" && entry.fields.reasonCode === "coverage_read_failed")).toBe(true);
  });

  it("at the deadline the fallback event is emitted alongside the read-failure line", async () => {
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const w = createSettlementWorld({ hk, readerHk: flaky.records });
    flaky.setFailing(true);
    await w.run(at(DEADLINE));
    expect(w.events()).toEqual(expect.arrayContaining([
      "briefing_settlement.coverage_read_failed", "briefing_settlement.deadline_fallback_used", "briefing_settlement.briefing_generated"]));
  });
});

describe("a throw in one cadence's settlement evaluation never aborts the other cadences in the tick", () => {
  const WEDNESDAY = new Date("2026-07-29T19:00:00.000Z");
  it("fails that entry closed (retry, no generation) and still evaluates and generates the next one", async () => {
    const warn = vi.fn();
    const evaluations = [];
    const gate = {
      async beginTick() {},
      async evaluate(args) {
        evaluations.push(args);
        if (evaluations.length === 1) throw Object.assign(new Error("unexpected gate failure"), { code: "GATE_BUG" });
        return { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [] };
      },
    };
    const generators = {
      midweek: { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "midweek" }, idempotent: false })) },
      weekly: { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "weekly" }, idempotent: false })) },
      monthly: { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "monthly" }, idempotent: false })) },
    };
    const protocol = { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v1" };
    const repositories = {
      users: { getCurrentUser: async () => ({ id: "u", timeZone: "America/Los_Angeles" }), getUserById: async () => ({ id: "u", timeZone: "America/Los_Angeles" }) },
      protocols: { listActiveProtocols: async () => [protocol] },
      protocolVersions: { getCurrentVersion: async () => ({ id: "briefings-v1", protocolId: "briefings", effectiveAt: "2026-07-01",
        coachingUpdates: { schemaVersion: "coaching_updates_schedule_v1", timeZone: "America/Los_Angeles",
          midweek: { enabled: true, day: "wednesday", localTime: "00:00" }, weekly: { enabled: true, day: "wednesday", localTime: "00:00" },
          daily: { enabled: false }, notificationPreference: "available_without_notification" } }) },
      goals: { getActiveGoal: async () => null },
      dailyBriefings: { getBriefingByEvidenceWindow: async () => null },
    };
    const records = [];
    const result = await createBriefingCadenceExecutor({
      repositories, generators, settlementGate: gate, logger: { info: vi.fn(), warn },
      executionStore: { createExecutionId: () => "run", async record(record) { records.push(record); },
        async getRetryState() { return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null }; } },
      executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
      source: "test",
    }).execute({ asOf: WEDNESDAY });
    const eligible = result.outcomes.filter((outcome) => outcome.eligibilityResult === "eligible");
    expect(eligible.length).toBeGreaterThanOrEqual(2);
    expect(eligible[0]).toMatchObject({ resultStatus: "awaiting_evidence_settlement", skipReason: "settlement_gate_error", retryability: true });
    expect(eligible[1].resultStatus).toBe("generation_completed");
    expect(eligible[1].artifactOutcome).toBe("created");
    // Exactly ONE generator ran, the second cadence's; the failed one did not generate.
    const invoked = Object.values(generators).filter((generator) => generator.generateForCurrentWindow.mock.calls.length > 0);
    expect(invoked).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith("briefing_settlement.settlement_gate_error", expect.objectContaining({ errorCode: "GATE_BUG" }));
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/unexpected gate failure/u);
  });
});
