import { describe, expect, it, vi } from "vitest";
import { redactStructuredValue } from "../../platform/observability/structuredLogger.js";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";
import { createBriefingCadenceSettlementGate } from "./BriefingCadenceSettlementGate.js";
import {
  at, createWorker, DEADLINE, hkRecords, MIDWEEK_DUE,
} from "../../fixtures/briefingSettlementWorld.js";

// REVIEW N3 — ACCEPTED FAIL-SAFE (Founder, 2026-09-25). An UNEXPECTED
// non-coverage exception escaping the settlement gate is a programming or
// configuration error. It deliberately fails CLOSED with NO hard-deadline
// escape: unknown errors must never force publication of a potentially invalid
// strategic artifact. What must hold, and what this file proves:
//   - it is operationally visible (a warn line with only an error class/code);
//   - the entry reports awaiting_evidence_settlement / retryable;
//   - it NEVER generates, even long past the hard deadline;
//   - repeating it every tick creates no artifact and no duplicate;
//   - other cadences in the same tick still run;
//   - the execution record is the only state written.
// Future ops work: alert on a sustained settlement_gate_error rate — this state
// has no self-resolving deadline.

const SECRET_MESSAGE = "reader contract broke for jane.doe@example.com token=sk-live-abc123 host=db.internal";
const explode = () => Object.assign(new Error(SECRET_MESSAGE), { name: "ContractViolation", code: "GATE_BUG_42" });

// A real gate whose evaluate() throws an unexpected non-coverage exception.
function throwingGate(reader, { failWhile = () => true, error = explode } = {}) {
  const real = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader });
  const state = { evaluations: 0 };
  return {
    state,
    beginTick: () => real.beginTick(),
    async evaluate(args) {
      state.evaluations += 1;
      if (failWhile(state.evaluations)) throw error();
      return real.evaluate(args);
    },
  };
}

function exposedWorld({ failWhile } = {}) {
  const warnings = [];
  const artifactRecords = [];
  const hk = hkRecords();
  // createWorker builds its own real gate; rebuild the executor around a throwing wrapper of it.
  const base = createWorker({ name: "w", artifactRecords, hk });
  const gate = throwingGate(base.reader, { failWhile });
  const records = [];
  const infos = [];
  const executor = createBriefingCadenceExecutor({
    repositories: base.repositories, generators: base.generators, settlementGate: gate,
    logger: { info: (event, fields) => infos.push({ event, fields }), warn: (event, fields) => warnings.push({ event, fields }), error: vi.fn() },
    executionStore: { createExecutionId: () => `run-${records.length}`, async record(record) { records.push(record); },
      async getRetryState() { return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null }; } },
    executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
    source: "n3-test",
  });
  const run = async (iso) => {
    const result = await executor.execute({ asOf: new Date(iso) });
    return result.outcomes.find((outcome) => outcome.cadenceKey === "midweek");
  };
  return { base, gate, records, warnings, infos, artifactRecords, hk, run };
}

describe("N3: an unexpected non-coverage gate exception fails closed, visibly, and never publishes", () => {
  it("is logged through the observer with ONLY a non-PII error class/code: no message, no stack, and the real redactor leaves it untouched", async () => {
    const w = exposedWorld();
    await w.run(at(5));
    const lines = w.warnings.filter((entry) => entry.event === "briefing_settlement.settlement_gate_error");
    expect(lines).toHaveLength(1);
    const { fields } = lines[0];
    expect(fields).toMatchObject({ cadenceKey: "midweek", reasonCode: "settlement_gate_error", errorName: "ContractViolation", errorCode: "GATE_BUG_42" });
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toMatch(/jane\.doe|example\.com|sk-live|abc123|db\.internal|contract broke/iu);
    expect(serialized).not.toMatch(/\bat\s+\S+\s+\(|\.js:\d+/u); // no stack frames
    expect(Object.keys(fields)).not.toEqual(expect.arrayContaining(["message", "stack", "error"]));
    // Nothing in it is something the structured logger would have to scrub.
    expect(redactStructuredValue(fields)).toEqual(fields);
  });

  it("returns awaiting_evidence_settlement / retryable, never generates, even AT and FAR PAST the hard deadline (accepted: no forced publication)", async () => {
    const w = exposedWorld();
    for (const minutes of [5, DEADLINE - 1, DEADLINE, DEADLINE + 1, DEADLINE + 600]) {
      const outcome = await w.run(at(minutes));
      expect(outcome).toMatchObject({
        resultStatus: "awaiting_evidence_settlement", skipReason: "settlement_gate_error", artifactOutcome: "none", retryability: true, unsettledDomains: [],
      });
      expect(outcome).not.toHaveProperty("artifactId");
    }
    expect(w.base.generate).not.toHaveBeenCalled();
    expect(w.artifactRecords).toHaveLength(0);
  });

  it("repeated failure across many ticks creates NO artifact and no duplicate; the execution record is the only state written", async () => {
    const w = exposedWorld();
    const hkBefore = JSON.stringify(await w.hk.list({ collection: "healthKitCanonicalDays" }));
    for (let tick = 0; tick < 6; tick += 1) await w.run(at(5 + tick * 30));
    expect(w.artifactRecords).toHaveLength(0);
    expect(w.base.generate).not.toHaveBeenCalled();
    const midweekRecords = w.records.filter((record) => record.cadenceKey === "midweek");
    expect(midweekRecords).toHaveLength(6); // exactly one execution record per tick
    expect(midweekRecords.every((record) => record.resultStatus === "awaiting_evidence_settlement" && record.artifactOutcome === "none")).toBe(true);
    expect(midweekRecords.some((record) => record.resultStatus === "generation_started" || record.artifactId)).toBe(false);
    expect(new Set(midweekRecords.map((record) => record.attemptId)).size).toBe(6);
    expect(JSON.stringify(await w.hk.list({ collection: "healthKitCanonicalDays" }))).toBe(hkBefore); // read-only toward HealthKit
    // Only the gate_error warning is emitted for it: no generated/published lifecycle lines.
    expect(w.infos.filter((entry) => /briefing_generated|briefing_published/u.test(entry.event))).toEqual([]);
  });

  it("when the error is fixed the very next tick generates exactly one artifact (no duplicates from the failed ticks)", async () => {
    const w = exposedWorld({ failWhile: (n) => n <= 3 });
    for (const minutes of [5, 35, 65]) expect((await w.run(at(minutes))).resultStatus).toBe("awaiting_evidence_settlement");
    expect((await w.run(at(95))).resultStatus).toBe("generation_completed");
    expect((await w.run(at(125))).resultStatus).toBe("already_completed");
    expect(w.artifactRecords).toHaveLength(1);
    expect(w.base.generate).toHaveBeenCalledTimes(1);
  });
});

describe("N3: a malformed reader result (real gate, no stub gate) is the same accepted fail-safe", () => {
  it("a TypeError inside the real gate surfaces as an unclassified error class, closed, with no message leaked", async () => {
    const artifactRecords = [];
    const base = createWorker({ name: "w", artifactRecords, hk: hkRecords() });
    const malformedReader = { beginRun() {}, readSettlementCoverage: async () => ({ /* activeDomains missing */ domainStates: {} }) };
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: malformedReader });
    const warn = vi.fn();
    const records = [];
    const executor = createBriefingCadenceExecutor({
      repositories: base.repositories, generators: base.generators, settlementGate: gate, logger: { info() {}, warn, error() {} },
      executionStore: { createExecutionId: () => "run", async record(record) { records.push(record); },
        async getRetryState() { return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null }; } },
      executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
      source: "n3-test",
    });
    const result = await executor.execute({ asOf: new Date(at(DEADLINE + 60)) });
    const outcome = result.outcomes.find((entry) => entry.cadenceKey === "midweek");
    expect(outcome).toMatchObject({ resultStatus: "awaiting_evidence_settlement", skipReason: "settlement_gate_error", retryability: true });
    expect(base.generate).not.toHaveBeenCalled();
    expect(artifactRecords).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith("briefing_settlement.settlement_gate_error",
      expect.objectContaining({ errorName: "TypeError", errorCode: "UNCLASSIFIED_ERROR" }));
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Cannot read|undefined|length/u); // the TypeError message is never logged
    expect(MIDWEEK_DUE).toBeInstanceOf(Date);
  });
});

describe("N3: other cadences in the same tick still run", () => {
  it("the failing entry waits (closed) while the next entry is evaluated by the real gate and generates once", async () => {
    const WEDNESDAY = new Date("2026-09-16T19:00:00.000Z");
    const reader = {
      beginRun() {},
      calls: 0,
      async readSettlementCoverage() {
        this.calls += 1;
        return this.calls === 1 ? { domainStates: {} } : { activeDomains: [], domainStates: {} }; // 1st: malformed; later: not applicable
      },
    };
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader });
    const generators = ["midweek", "weekly", "monthly"].reduce((all, name) => ({ ...all,
      [name]: { generateForCurrentWindow: vi.fn(async () => (name === "monthly"
        ? { state: "not_eligible", reason: "x" }
        : { state: "completed", artifact: { id: name }, idempotent: false })) } }), {});
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
    const records = [];
    const warn = vi.fn();
    const result = await createBriefingCadenceExecutor({
      repositories, generators, settlementGate: gate, logger: { info() {}, warn, error() {} },
      executionStore: { createExecutionId: () => "run", async record(record) { records.push(record); },
        async getRetryState() { return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null }; } },
      executionLock: { async acquire() { return { acquired: true, async release() {} }; } },
      source: "n3-test",
    }).execute({ asOf: WEDNESDAY });
    const eligible = result.outcomes.filter((outcome) => outcome.eligibilityResult === "eligible");
    expect(eligible[0]).toMatchObject({ resultStatus: "awaiting_evidence_settlement", skipReason: "settlement_gate_error" });
    expect(eligible[1]).toMatchObject({ resultStatus: "generation_completed", artifactOutcome: "created" });
    expect(Object.values(generators).filter((generator) => generator.generateForCurrentWindow.mock.calls.length > 0)).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
