import { describe, expect, it, vi } from "vitest";
import { createBriefingCadenceExecutor } from "./BriefingCadenceExecutorService";

// Part B wiring tests: proves the executor now gates generation on the
// Briefing Evidence Settlement Policy (via an injected `settlementGate`)
// instead of generating immediately once a cadence is merely eligible.
// BriefingCadenceExecutorService.test.js already covers everything about
// eligibility/locking/retry/idempotency WITHOUT a settlement gate present
// (settlementGate defaults to null there, preserving the old behavior
// exactly) — these tests are additive, focused on the new gate itself.

const WEDNESDAY = new Date("2026-07-29T19:00:00.000Z");

describe("briefing cadence executor — evidence settlement gate wiring", () => {
  it("does not generate and records an awaiting-settlement outcome when the gate says wait", async () => {
    const calls = generators();
    const gate = fakeGate({ action: "wait", reasonCode: "before_earliest_publish_time", nextCheckAt: "2026-07-29T10:00:00.000Z" });
    const result = await executor({ repositories: repositories(), generators: calls, settlementGate: gate })
      .execute({ asOf: WEDNESDAY });
    expect(calls.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek")).toMatchObject({
      resultStatus: "awaiting_evidence_settlement",
      skipReason: "before_earliest_publish_time",
      retryability: true,
      nextRetryAt: "2026-07-29T10:00:00.000Z",
    });
    expect(gate.evaluateCalls).toHaveLength(1);
  });

  it("does not generate and records unsettled domains when the gate says retry", async () => {
    const calls = generators();
    const gate = fakeGate({ action: "retry", reasonCode: "awaiting_settlement", unsettledDomains: ["nutrition"], nextCheckAt: "2026-07-29T10:30:00.000Z" });
    const result = await executor({ repositories: repositories(), generators: calls, settlementGate: gate })
      .execute({ asOf: WEDNESDAY });
    expect(calls.midweek.generateForCurrentWindow).not.toHaveBeenCalled();
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek")).toMatchObject({
      resultStatus: "awaiting_evidence_settlement",
      skipReason: "awaiting_settlement",
      unsettledDomains: ["nutrition"],
      retryability: true,
    });
  });

  it("generates when the gate says readiness is satisfied, and records why", async () => {
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "readiness_satisfied" });
    const result = await executor({ repositories: repositories(), generators: calls, settlementGate: gate })
      .execute({ asOf: WEDNESDAY });
    expect(calls.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek")).toMatchObject({
      resultStatus: "generation_completed",
      settlementReasonCode: "readiness_satisfied",
    });
  });

  it("generates at the hard deadline even though evidence is not fully settled, and records the fallback reason", async () => {
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "hard_deadline_reached", unsettledDomains: ["activity"] });
    const result = await executor({ repositories: repositories(), generators: calls, settlementGate: gate })
      .execute({ asOf: WEDNESDAY });
    expect(calls.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek")).toMatchObject({
      resultStatus: "generation_completed",
      settlementReasonCode: "hard_deadline_reached",
    });
  });

  it("generates immediately (old behavior) when there is no settlement gate configured at all", async () => {
    const calls = generators();
    const result = await executor({ repositories: repositories(), generators: calls })
      .execute({ asOf: WEDNESDAY });
    expect(calls.midweek.generateForCurrentWindow).toHaveBeenCalledOnce();
    expect(result.outcomes.find((item) => item.cadenceKey === "midweek")).toMatchObject({
      resultStatus: "generation_completed",
    });
  });

  it("never consults the settlement gate for an ineligible or already-completed cadence", async () => {
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "readiness_satisfied" });
    const disabled = repositories({
      schedule: {
        midweek: { enabled: false, day: "wednesday", localTime: "00:00" },
        weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      },
    });
    await executor({ repositories: disabled, generators: calls, settlementGate: gate }).execute({ asOf: WEDNESDAY });
    expect(gate.evaluateCalls).toHaveLength(0);
  });

  it("does not retain the executor lock across a tick when the settlement gate says wait, so another tick can proceed", async () => {
    const released = vi.fn();
    const calls = generators();
    const gate = fakeGate({ action: "wait", reasonCode: "before_earliest_publish_time" });
    await executor({
      repositories: repositories(), generators: calls, settlementGate: gate,
      lock: { async acquire() { return { acquired: true, async release() { released(); } }; } },
    }).execute({ asOf: WEDNESDAY });
    expect(released).toHaveBeenCalledOnce();
  });

  it("passes the final local evidence day and earliest-publish instant from the resolved cadence entry to the gate", async () => {
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "readiness_satisfied" });
    await executor({ repositories: repositories(), generators: calls, settlementGate: gate }).execute({ asOf: WEDNESDAY });
    expect(gate.evaluateCalls[0]).toMatchObject({
      finalEvidenceDate: "2026-07-28",
      earliestPublishAt: expect.any(String),
    });
  });

  it("emits settlement lifecycle events through the logger", async () => {
    const info = vi.fn();
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "readiness_satisfied" });
    await executor({ repositories: repositories(), generators: calls, settlementGate: gate, logger: { info } })
      .execute({ asOf: WEDNESDAY });
    expect(info).toHaveBeenCalledWith("briefing_settlement.readiness_satisfied", expect.objectContaining({ cadenceKey: "midweek" }));
    expect(info).toHaveBeenCalledWith("briefing_settlement.briefing_generated", expect.objectContaining({ cadenceKey: "midweek" }));
    expect(info).toHaveBeenCalledWith("briefing_settlement.briefing_published", expect.objectContaining({ cadenceKey: "midweek" }));
  });

  it("emits the deadline-fallback event, and NOT the ordinary readiness-satisfied event, when the deadline reason is used", async () => {
    const info = vi.fn();
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "hard_deadline_reached" });
    await executor({ repositories: repositories(), generators: calls, settlementGate: gate, logger: { info } })
      .execute({ asOf: WEDNESDAY });
    expect(info).toHaveBeenCalledWith("briefing_settlement.deadline_fallback_used", expect.objectContaining({ cadenceKey: "midweek" }));
    expect(info).not.toHaveBeenCalledWith("briefing_settlement.readiness_satisfied", expect.anything());
  });

  it("emits a distinct settlement-not-applicable event, not readiness-satisfied, for a non-HealthKit-backed generation", async () => {
    const info = vi.fn();
    const calls = generators();
    const gate = fakeGate({ action: "generate", reasonCode: "no_healthkit_backed_domains_settlement_not_applicable" });
    await executor({ repositories: repositories(), generators: calls, settlementGate: gate, logger: { info } })
      .execute({ asOf: WEDNESDAY });
    expect(info).toHaveBeenCalledWith("briefing_settlement.settlement_not_applicable", expect.objectContaining({ cadenceKey: "midweek" }));
    expect(info).not.toHaveBeenCalledWith("briefing_settlement.readiness_satisfied", expect.anything());
  });
});

function fakeGate(decision) {
  const evaluateCalls = [];
  return {
    evaluateCalls,
    async beginTick() {},
    async evaluate(args) { evaluateCalls.push(args); return decision; },
  };
}

function executor({
  repositories: repositorySet,
  generators: generatorSet,
  records = [],
  lock = null,
  settlementGate = null,
  logger = null,
}) {
  return createBriefingCadenceExecutor({
    repositories: repositorySet,
    generators: generatorSet,
    executionStore: {
      createExecutionId: () => `run-${records.length}`,
      async record(record) { records.push(record); },
      async getRetryState() {
        return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null };
      },
    },
    executionLock: lock ?? { async acquire() { return { acquired: true, async release() {} }; } },
    source: "test",
    settlementGate,
    logger,
  });
}

function repositories({ artifacts = [], schedule = null } = {}) {
  const store = { artifacts };
  const protocol = schedule ? { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v1" } : null;
  return {
    store,
    users: {
      getCurrentUser: vi.fn(async () => ({ id: "user_founder_001", timeZone: "America/Los_Angeles" })),
      getUserById: vi.fn(async () => ({ id: "user_founder_001", timeZone: "America/Los_Angeles" })),
    },
    protocols: { listActiveProtocols: vi.fn(async () => protocol ? [protocol] : []) },
    protocolVersions: {
      getCurrentVersion: vi.fn(async () => schedule ? {
        id: "briefings-v1", protocolId: "briefings", effectiveAt: "2026-07-01",
        coachingUpdates: {
          schemaVersion: "coaching_updates_schedule_v1", timeZone: "America/Los_Angeles",
          ...schedule, daily: { enabled: false }, notificationPreference: "available_without_notification",
        },
      } : null),
    },
    goals: { getActiveGoal: vi.fn(async () => null) },
    dailyBriefings: {
      getBriefingByEvidenceWindow: vi.fn(async (_userId, windowId) =>
        artifacts.find((artifact) => artifact.evidenceWindow?.id === windowId) ?? null),
    },
  };
}

function generators({ midweek } = {}) {
  return {
    midweek: { generateForCurrentWindow: midweek ?? vi.fn(async () => ({ state: "completed", artifact: completedMidweek(), idempotent: false })) },
    weekly: { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "weekly" } })) },
    monthly: { generateForCurrentWindow: vi.fn(async () => ({ state: "completed", artifact: { id: "monthly" } })) },
  };
}

function completedMidweek() {
  return {
    id: "midweek_briefing_user_founder_001_20260726_20260728",
    cadence: "midweek",
    lifecycle: { generationStatus: "completed" },
    evidenceWindow: { id: "midweek:2026-07-26:2026-07-28:America/Los_Angeles", startDate: "2026-07-26", endDate: "2026-07-28" },
    briefing: { version: "midweek_briefing_v1" },
  };
}
