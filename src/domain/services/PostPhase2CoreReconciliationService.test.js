import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthorizedPhaseEstablishment } from "./PhaseEstablishmentService";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import { createPhaseStrategy } from "../models/phaseStrategy";
import {
  createPostPhase2CoreReconciliationService,
  inspectPostPhase2Reconciliation,
  PostPhase2ReconciliationOutcome,
} from "./PostPhase2CoreReconciliationService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Post-Phase-2 core reconciliation", () => {
  it("dry-runs the exact deterministic correction set without mutating state", async () => {
    const fixture = createFixture();
    const before = structuredClone(fixture.liveStore);
    const result = await fixture.service.dryRun(fixture.command);
    expect(result).toMatchObject({
      outcome: PostPhase2ReconciliationOutcome.ELIGIBLE,
      committed: false,
      requestId: "request-1",
    });
    expect(result.proposedChanges.map((item) => item.path)).toEqual([
      "goal.phase.startDate",
      "goal.phase.startedAt",
      "goal.phase.monitoringCadence",
      "goal.phase.strategicReviewCadence",
      "goal.phase.strategicReviewAnchor",
      "goal.phase.automaticStrategyAdjustmentAllowed",
      "goal.timeline.currentPhaseStartedAt",
      "phaseStrategy.domains.energy.adjustmentLogic",
      "phaseStrategy.domains.energy.monitoringCadence",
      "phaseStrategy.domains.energy.strategicReviewCadence",
      "phaseStrategy.domains.energy.strategicReviewAnchor",
      "phaseStrategy.domains.energy.adjustmentAuthorization",
      "phaseStrategy.domains.energy.automaticAdjustmentAllowed",
      "phaseStrategy.contentFingerprint",
      "phaseExpectedTrajectory.timeline.projectedStartRule",
      "phaseExpectedTrajectory.timeline.projectedStart",
      "phaseExpectedTrajectory.timeline.strategicReviewCadence",
      "phaseExpectedTrajectory.timeline.strategicReviewAnchor",
      "phaseExpectedTrajectory.firstCadenceReview.expectedTiming",
      "phaseExpectedTrajectory.contentFingerprint",
      "protocol.effectiveStrategy.evaluationCadence",
      "protocol.effectiveStrategy.monitoringCadence",
      "protocol.effectiveStrategy.strategicReviewCadence",
      "protocol.effectiveStrategy.strategicReviewAnchor",
      "protocol.effectiveStrategy.adjustmentMethod",
      "protocol.effectiveStrategy.automaticAdjustmentAllowed",
      "protocol.effectiveStrategy.adjustmentAuthorization",
      "protocolVersion.v1.status",
      "protocolVersion.v1.endedAt",
      "protocolVersion.v1.supersededByVersionId",
      "protocolVersion.v2.effectiveAt",
      "protocolVersion.v2.change.reviewedChanges.evaluationCadence",
      "protocolVersion.v2.change.reviewedChanges.monitoringCadence",
      "protocolVersion.v2.change.reviewedChanges.strategicReviewCadence",
      "protocolVersion.v2.change.reviewedChanges.strategicReviewAnchor",
      "protocolVersion.v2.change.reviewedChanges.adjustmentMethod",
      "protocolVersion.v2.change.reviewedChanges.automaticAdjustmentAllowed",
      "protocolVersion.v2.change.reviewedChanges.adjustmentAuthorization",
      "phaseLifecycle.activePhaseStartedAt",
      "phaseLifecycle.monitoringCadence",
      "phaseLifecycle.strategicReviewCadence",
      "phaseLifecycle.strategicReviewAnchor",
    ]);
    expect(fixture.liveStore).toEqual(before);
    expect(read(fixture.file)).toEqual(before);
  });

  it("atomically reconciles only lifecycle, semantic dates, and cadence", async () => {
    const fixture = createFixture();
    const historical = protectedCounts(fixture.liveStore);
    const result = await fixture.service.reconcile(fixture.command, {
      authorization: authorization(),
    });
    expect(result).toMatchObject({
      outcome: PostPhase2ReconciliationOutcome.SUCCESS,
      committed: true,
      revision: 43,
    });
    const stored = read(fixture.file);
    expect(stored.goals[0].phases[1]).toMatchObject({
      startDate: "2026-08-15",
      startedAt: "2026-08-15",
      strategicReviewCadence: "monthly",
      strategicReviewAnchor: "dexa_body_composition",
      monitoringCadence: "weekly",
      automaticStrategyAdjustmentAllowed: false,
    });
    expect(stored.goals[0].timeline.currentPhaseStartedAt).toBe("2026-08-15");
    expect(stored.protocolVersions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "energy-v1",
        status: "superseded",
        endedAt: "2026-08-15",
        supersededByVersionId: "energy-v2",
      }),
      expect.objectContaining({
        id: "energy-v2",
        status: "active",
        effectiveAt: "2026-08-15",
      }),
    ]));
    expect(stored.protocols[0].currentVersionId).toBe("energy-v2");
    expect(stored.protocols[0].effectiveStrategy).toMatchObject({
      caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
      activityExpenditureTarget: { value: 800, unit: "kcal/day" },
      monitoringCadence: "weekly",
      strategicReviewCadence: "monthly",
      strategicReviewAnchor: "dexa_body_composition",
      automaticAdjustmentAllowed: false,
    });
    expect(stored.phaseExpectedTrajectories[0].timeline).toMatchObject({
      projectedStart: "2026-08-15",
      projectedStartRule: "review_milestone_boundary",
      strategicReviewCadence: "monthly",
      strategicReviewAnchor: "dexa_body_composition",
    });
    expect(protectedCounts(stored)).toEqual(historical);
  });

  it("is idempotent only on the immediately reconciled revision", async () => {
    const fixture = createFixture();
    await fixture.service.reconcile(fixture.command, { authorization: authorization() });
    const replay = await fixture.service.reconcile(fixture.command, {
      authorization: authorization(),
    });
    expect(replay).toMatchObject({
      outcome: PostPhase2ReconciliationOutcome.ALREADY_RECONCILED,
      committed: false,
    });
    const changed = structuredClone(fixture.liveStore);
    changed.revision = 44;
    expect(inspectPostPhase2Reconciliation({
      store: changed,
      migrationControl: control(),
      command: fixture.command,
    }).outcome).toBe(PostPhase2ReconciliationOutcome.CONCURRENCY_CONFLICT);
  });

  it.each([
    ["stale revision", (fixture) => { fixture.command.expectedStoreRevision = 41; },
      PostPhase2ReconciliationOutcome.CONCURRENCY_CONFLICT],
    ["unexpected phase state", (fixture) => { fixture.liveStore.goals[0].phases[1].status = "planned"; },
      PostPhase2ReconciliationOutcome.EXPECTED_STATE_MISMATCH],
    ["unexpected targets", (fixture) => {
      fixture.liveStore.protocols[0].effectiveStrategy.caloricIntakeTarget.value = 2499;
    }, PostPhase2ReconciliationOutcome.EXPECTED_STATE_MISMATCH],
    ["unexpected Energy lifecycle", (fixture) => {
      fixture.liveStore.protocolVersions[0].status = "superseded";
    }, PostPhase2ReconciliationOutcome.EXPECTED_STATE_MISMATCH],
    ["duplicate transition", (fixture) => {
      fixture.liveStore.phaseReviewTransactions.push({
        ...fixture.liveStore.phaseReviewTransactions[0],
        id: "transition-duplicate",
      });
    }, PostPhase2ReconciliationOutcome.EXPECTED_STATE_MISMATCH],
  ])("rejects %s without mutation", async (_name, arrange, outcome) => {
    const fixture = createFixture();
    arrange(fixture);
    const before = structuredClone(fixture.liveStore);
    const result = await fixture.service.reconcile(fixture.command, {
      authorization: authorization(),
    });
    expect(result.outcome).toBe(outcome);
    expect(fixture.liveStore).toEqual(before);
    expect(read(fixture.file)).toEqual(createFixtureStore());
  });

  it("rolls back every staged correction when a transaction step fails", async () => {
    const fixture = createFixture({
      faults: { afterApply: () => { throw new Error("injected failure"); } },
    });
    const before = structuredClone(fixture.liveStore);
    const result = await fixture.service.reconcile(fixture.command, {
      authorization: authorization(),
    });
    expect(result).toMatchObject({
      outcome: PostPhase2ReconciliationOutcome.PERSISTENCE_FAILURE,
      committed: false,
    });
    expect(fixture.liveStore).toEqual(before);
    expect(read(fixture.file)).toEqual(before);
  });

  it("requires explicit request-bound authorization", async () => {
    const fixture = createFixture();
    const result = await fixture.service.reconcile(fixture.command);
    expect(result.outcome).toBe(PostPhase2ReconciliationOutcome.AUTHORIZATION_REQUIRED);
    expect(read(fixture.file).revision).toBe(42);
  });

  it("fails closed when migration control is not fully readable and writable", () => {
    const fixture = createFixture();
    const unsafe = control();
    unsafe.state.readsEnabled = false;
    const before = structuredClone(fixture.liveStore);
    const result = inspectPostPhase2Reconciliation({
      store: fixture.liveStore,
      migrationControl: unsafe,
      command: fixture.command,
    });
    expect(result.outcome).toBe(PostPhase2ReconciliationOutcome.MIGRATION_CONTROL_UNSAFE);
    expect(fixture.liveStore).toEqual(before);
    expect(read(fixture.file)).toEqual(before);
  });

});
function createFixture({ faults } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "post-phase-2-reconciliation-"));
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  const liveStore = createFixtureStore();
  fs.writeFileSync(file, JSON.stringify(liveStore));
  const command = {
    requestId: "request-1",
    expectedStoreRevision: 42,
    goalId: "goal",
    phase1Id: "p1",
    phase2Id: "p2",
    decisionId: "decision",
    transactionId: "transition",
    strategyId: "strategy-p2",
    trajectoryId: "trajectory-p2",
    energyProtocolId: "energy",
    energyV1Id: "energy-v1",
    energyV2Id: "energy-v2",
    currentStartDate: "2026-08-17",
    targetStartDate: "2026-08-15",
    caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
    activityExpenditureTarget: { value: 800, unit: "kcal/day" },
  };
  const service = createPostPhase2CoreReconciliationService({
    runtimeStorePath: file,
    liveStore,
    readMigrationControl: async () => control(),
    now: () => new Date("2026-08-16T20:00:00.000Z"),
    faults,
  });
  return { file, liveStore, command, service };
}

function createFixtureStore() {
  const goal = {
    id: "goal",
    userId: "user",
    title: "Generic quantitative goal",
    type: "quantitative",
    status: "active",
    primary: true,
    currentPhaseId: "p2",
    target: {
      type: "numeric_change",
      metric: "lean_mass",
      direction: "increase",
      amount: 10,
      unit: "lb",
      targetDate: "2026-10-31",
    },
    timeline: {
      startDate: "2026-07-18",
      targetDate: "2026-10-31",
      currentPhaseId: "p2",
      currentPhaseStartedAt: "2026-08-17",
    },
    guardrails: [{ text: "Maintain approximately 8–9% body fat.", accepted: true }],
    phases: [
      {
        id: "p1",
        name: "Calibration",
        order: 0,
        status: "completed",
        reviewMilestone: { consumed: true, resolvedReviewId: "decision" },
      },
      {
        id: "p2",
        name: "Execution",
        order: 1,
        status: "active",
        startDate: "2026-08-17",
        startedAt: "2026-08-17",
      },
    ],
  };
  const establishment = createAuthorizedPhaseEstablishment({
    goal,
    currentPhase: goal.phases[0],
    nextPhase: goal.phases[1],
    actorId: "user",
    decisionId: "decision",
    idempotencyKey: "idempotency",
    decidedAt: "2026-08-15T18:00:00.000Z",
    projectedStart: "2026-08-17",
    caloricIntakeTarget: 2500,
    activityExpenditureTarget: 800,
    sourceArtifactId: "artifact",
  });
  const strategyInput = structuredClone(establishment.strategy);
  strategyInput.id = "strategy-p2";
  strategyInput.strategyId = "strategy-p2";
  strategyInput.domains.energy.adjustmentLogic = "small_reviewed_changes";
  for (const field of ["monitoringCadence", "strategicReviewCadence",
    "strategicReviewAnchor", "adjustmentAuthorization", "automaticAdjustmentAllowed"]) {
    delete strategyInput.domains.energy[field];
  }
  const strategy = structuredClone(createPhaseStrategy(strategyInput));
  const trajectoryInput = structuredClone(establishment.trajectory);
  trajectoryInput.id = "trajectory-p2";
  trajectoryInput.trajectoryId = "trajectory-p2";
  trajectoryInput.timeline.projectedStartRule =
    "first_full_execution_day_after_authorized_transition";
  trajectoryInput.timeline.projectedStart = "2026-08-17";
  delete trajectoryInput.timeline.strategicReviewCadence;
  delete trajectoryInput.timeline.strategicReviewAnchor;
  trajectoryInput.milestones.find((item) =>
    item.type === "first_phase_cadence_review").expectedTiming = {
    mode: "first_cadence_after_activation",
  };
  const trajectory = structuredClone(createPhaseExpectedTrajectory(trajectoryInput));
  return {
    version: 1,
    revision: 42,
    updatedAt: "2026-08-16T19:00:00.000Z",
    user: { id: "user" },
    goals: [goal],
    phaseReviewDecisions: [{ decisionId: "decision", goalId: "goal" }],
    phaseReviewTransactions: [{
      id: "transition",
      goalId: "goal",
      decisionId: "decision",
      status: "committed",
    }],
    phaseStrategies: [strategy],
    phaseExpectedTrajectories: [trajectory],
    protocols: [{
      id: "energy",
      status: "active",
      currentVersionId: "energy-v2",
      effectiveStrategy: {
        caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
        activityExpenditureTarget: { value: 800, unit: "kcal/day" },
        evaluationCadence: "weekly",
      },
    }],
    protocolVersions: [
      {
        id: "energy-v1",
        protocolId: "energy",
        versionNumber: 1,
        status: "active",
        effectiveAt: "2026-07-18",
        endedAt: null,
      },
      {
        id: "energy-v2",
        protocolId: "energy",
        versionNumber: 2,
        status: "active",
        effectiveAt: "2026-08-17",
        endedAt: null,
        change: {
          previousVersionId: "energy-v1",
          reviewedChanges: {
            caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
            activityExpenditureTarget: { value: 800, unit: "kcal/day" },
            evaluationCadence: "weekly",
          },
        },
      },
    ],
    phaseLifecycleReadModels: [{
      goalId: "goal",
      decisionId: "decision",
      activePhaseStartedAt: "2026-08-17",
    }],
    confidenceInitializationArtifacts: [{
      id: "starting-forecast",
      goalId: "goal",
      phaseId: "p2",
      occurrenceId: "decision",
    }],
    goalConfidenceHistory: [{
      id: "confidence-62",
      goalId: "goal",
      phaseId: "p2",
      score: 62,
    }],
    executionTargets: [{
      id: "execution-targets",
      goalId: "goal",
      phaseId: "p2",
      calories: 2500,
      activity: 800,
    }],
    dailyBriefings: [{ id: "historical-briefing" }],
    dexaScans: [{ id: "historical-dexa" }],
  };
}

function protectedCounts(store) {
  return {
    decisions: store.phaseReviewDecisions.length,
    transactions: store.phaseReviewTransactions.length,
    strategies: store.phaseStrategies.length,
    trajectories: store.phaseExpectedTrajectories.length,
    forecasts: store.confidenceInitializationArtifacts.length,
    confidence: store.goalConfidenceHistory.map((item) => item.score),
    targets: store.executionTargets.length,
    briefings: store.dailyBriefings.length,
    dexa: store.dexaScans.length,
  };
}

function authorization() {
  return {
    authorized: true,
    scope: "post_phase_2_core_reconciliation",
    requestId: "request-1",
  };
}

function control() {
  return {
    state: {
      fenceState: "inactive",
      canonicalStoreEpoch: "legacy-json",
      compositionMode: "legacy-json",
      readsEnabled: true,
      writesEnabled: true,
      migrationOperationId: null,
      firstPostgresWriteAt: null,
    },
  };
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
