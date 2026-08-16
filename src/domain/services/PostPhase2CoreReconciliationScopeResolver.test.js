import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PostPhase2ScopeResolutionError,
  resolvePostPhase2CoreReconciliationScope,
} from "./PostPhase2CoreReconciliationScopeResolver";

const RESOLVER_SOURCE_PATH = fileURLToPath(
  new URL("./PostPhase2CoreReconciliationScopeResolver.js", import.meta.url));

// Real production identity fragments that must never appear literally in the resolver
// source. If one of these ever needs to appear, the resolver has stopped resolving scope
// through canonical relationships and started hardcoding a specific Founder record.
const FORBIDDEN_PRODUCTION_ID_FRAGMENTS = [
  "6353e12e1ef8fbc3",
  "objective_lean_mass",
  "goal_phase_7ab0d230",
  "goal_phase_8d7d4fae",
  "dexa_submission_20260815",
  "2026-08-15",
  "2026-08-17",
];

describe("Post-Phase-2 core reconciliation scope resolver", () => {
  it("never hardcodes a real Founder production record identity or date", () => {
    const source = fs.readFileSync(RESOLVER_SOURCE_PATH, "utf8");
    for (const fragment of FORBIDDEN_PRODUCTION_ID_FRAGMENTS) {
      expect(source).not.toContain(fragment);
    }
  });

  it("resolves the exact command scope purely from canonical relationships, not from ID-string parsing", () => {
    const store = createStore();
    const now = () => new Date("2030-05-05T12:00:00.000Z");
    const { command, preflight } = resolvePostPhase2CoreReconciliationScope({ store, now });

    expect(command).toEqual({
      requestId: "post_phase_2_core_reconciliation|decision-1|2030-05-05T12:00:00.000Z",
      expectedStoreRevision: 42,
      goalId: "goal-1",
      phase1Id: "phase-1",
      phase2Id: "phase-2",
      decisionId: "decision-1",
      transactionId: "tx-1",
      strategyId: "strategy-1",
      trajectoryId: "trajectory-1",
      energyProtocolId: "protocol-1",
      energyV1Id: "v1-1",
      energyV2Id: "v2-1",
      currentStartDate: "2099-01-02",
      targetStartDate: "2099-01-01",
      caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
      activityExpenditureTarget: { value: 800, unit: "kcal/day" },
    });
    expect(preflight.resolvedTargetStartDate).toBe("2099-01-01");
    expect(preflight.startingForecast).toEqual({ count: 1, id: "forecast-1" });
    expect(preflight.confidenceInitialization).toEqual({ count: 1, id: "confidence-1" });
    expect(preflight.authorizationConsumed).toBe(true);
  });

  it("resolves the target start date through the canonical review-milestone date policy, not a universal hardcoded date", () => {
    const store = createStore({
      reviewMilestoneDate: "2031-12-25",
      currentStartDate: "2032-01-01",
    });
    const { command } = resolvePostPhase2CoreReconciliationScope({ store });
    expect(command.targetStartDate).toBe("2031-12-25");
    expect(command.currentStartDate).toBe("2032-01-01");
  });

  it("fails closed when zero or multiple primary active goals exist", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.goals[0].primary = false; }),
    }), "GOAL_MISSING");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.goals.push({ ...store.goals[0], id: "goal-2" });
      }),
    }), "GOAL_AMBIGUOUS");
  });

  it("fails closed on ambiguous phase ownership", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.goals[0].phases[1].status = "completed"; }),
    }), "PHASE2_NOT_ACTIVE");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.goals[0].timeline.currentPhaseId = "phase-1"; }),
    }), "PHASE2_TIMELINE_MISMATCH");
  });

  it("fails closed on ambiguous decision/transaction ownership", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.phaseReviewDecisions.push({ ...store.phaseReviewDecisions[0], decisionId: "decision-2" });
      }),
    }), "DECISION_AMBIGUOUS");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.phaseReviewDecisions = []; }),
    }), "DECISION_MISSING");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.phaseReviewTransactions.push({ ...store.phaseReviewTransactions[0], id: "tx-2" });
      }),
    }), "TRANSACTION_AMBIGUOUS");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.phaseReviewTransactions[0].status = "failed"; }),
    }), "TRANSACTION_NOT_COMMITTED");
  });

  it("fails closed on ambiguous strategy/trajectory ownership", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.phaseStrategies.push({ ...store.phaseStrategies[0], id: "strategy-2" });
      }),
    }), "STRATEGY_AMBIGUOUS");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.phaseExpectedTrajectories.push({ ...store.phaseExpectedTrajectories[0], id: "trajectory-2" });
      }),
    }), "TRAJECTORY_AMBIGUOUS");
  });

  it("fails closed on ambiguous energy protocol/version ownership", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.protocols.push({ ...store.protocols[0], id: "protocol-2" });
      }),
    }), "ENERGY_PROTOCOL_AMBIGUOUS");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.protocolVersions.push({ id: "v3-1", protocolId: "protocol-1", status: "active", endedAt: null });
      }),
    }), "ENERGY_VERSION_LIFECYCLE_UNEXPECTED");
  });

  it("fails closed on unexpected or contradictory authorized targets", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.protocolVersions[1].change.reviewedChanges.caloricIntakeTarget = { value: 2200, unit: "kcal/day" };
      }),
    }), "TARGET_CONTRADICTION_ENERGY_V2");
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.phaseReviewDecisions[0].phaseEstablishment.executionTargets.activityExpenditure =
          { value: 900, unit: "kcal/day" };
      }),
    }), "TARGET_CONTRADICTION_PHASE_ESTABLISHMENT");
  });

  it("fails closed when the current and target start dates already agree", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => {
        store.goals[0].phases[1].startDate = "2099-01-01";
        store.goals[0].phases[1].startedAt = "2099-01-01";
        store.goals[0].timeline.currentPhaseStartedAt = "2099-01-01";
      }),
    }), "TARGET_START_DATE_MATCHES_CURRENT");
  });

  it("fails closed when Phase 2 start-date fields disagree with each other", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.goals[0].phases[1].startedAt = "2099-06-01"; }),
    }), "CURRENT_START_DATE_CONTRADICTION");
  });

  it("fails closed when the store revision is unreadable", () => {
    expectCode(() => resolvePostPhase2CoreReconciliationScope({
      store: mutate(createStore(), (store) => { store.revision = "not-a-number"; }),
    }), "STORE_REVISION_UNREADABLE");
  });

  function expectCode(fn, code) {
    try {
      fn();
      throw new Error(`Expected ${code} but resolution succeeded.`);
    } catch (error) {
      expect(error).toBeInstanceOf(PostPhase2ScopeResolutionError);
      expect(error.code).toBe(code);
    }
  }
});

function mutate(store, mutator) {
  mutator(store);
  return store;
}

function createStore({ reviewMilestoneDate = "2099-01-01", currentStartDate = "2099-01-02" } = {}) {
  return {
    revision: 42,
    goals: [{
      id: "goal-1",
      status: "active",
      primary: true,
      currentPhaseId: "phase-2",
      timeline: { currentPhaseId: "phase-2", currentPhaseStartedAt: currentStartDate },
      phases: [
        {
          id: "phase-1",
          status: "completed",
          name: "Synthetic Prior Phase",
          reviewMilestone: {
            consumed: true,
            resolvedReviewId: "decision-1",
            earliestEligibleDate: reviewMilestoneDate,
          },
        },
        {
          id: "phase-2",
          status: "active",
          name: "Synthetic Current Phase",
          startDate: currentStartDate,
          startedAt: currentStartDate,
        },
      ],
    }],
    phaseReviewDecisions: [{
      decisionId: "decision-1",
      goalId: "goal-1",
      currentPhaseId: "phase-1",
      nextPhaseId: "phase-2",
      selectedOutcome: "begin_next_phase",
      phaseEstablishment: {
        executionTargets: {
          caloricIntake: { value: 2500, unit: "kcal/day" },
          activityExpenditure: { value: 800, unit: "kcal/day" },
        },
      },
    }],
    phaseReviewTransactions: [{
      id: "tx-1",
      goalId: "goal-1",
      decisionId: "decision-1",
      status: "committed",
    }],
    phaseStrategies: [{
      id: "strategy-1",
      goalId: "goal-1",
      phaseId: "phase-2",
      status: "accepted",
    }],
    phaseExpectedTrajectories: [{
      id: "trajectory-1",
      goalId: "goal-1",
      phaseId: "phase-2",
      status: "accepted",
    }],
    protocols: [{
      id: "protocol-1",
      status: "active",
      currentVersionId: "v2-1",
      effectiveStrategy: {
        phaseId: "phase-2",
        phaseStrategyId: "strategy-1",
        caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
        activityExpenditureTarget: { value: 800, unit: "kcal/day" },
      },
    }],
    protocolVersions: [
      { id: "v1-1", protocolId: "protocol-1", status: "active", endedAt: null },
      {
        id: "v2-1",
        protocolId: "protocol-1",
        status: "active",
        endedAt: null,
        change: {
          reviewedChanges: {
            caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
            activityExpenditureTarget: { value: 800, unit: "kcal/day" },
          },
        },
      },
    ],
    confidenceInitializationArtifacts: [{
      id: "forecast-1", goalId: "goal-1", phaseId: "phase-2", occurrenceId: "decision-1",
    }],
    goalConfidenceHistory: [{
      id: "confidence-1", goalId: "goal-1", phaseId: "phase-2",
    }],
  };
}
