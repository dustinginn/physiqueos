import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isFounderBuildLeanMassGoal, projectFounderBuildLeanMassPhaseCorrection } from
  "./FounderPhaseCorrectionService";
import { createFounderPhase2ActivationPackageDrafts } from
  "./FounderPhase2ActivationPackageService";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";
import { createPhaseStrategy } from "../models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import { createPhase2StartingForecastInputPackage } from
  "./Phase2StartingForecastInputPackageService";

const productionPath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Phase 2 Starting Forecast input package", () => {
  it("is deterministic, accepted-only, lineage-complete, and excludes raw or V1 semantics", () => {
    const store = JSON.parse(fs.readFileSync(productionPath, "utf8"));
    const goal = plannedGoalForStartingForecast(store);
    const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
    const drafts = createFounderPhase2ActivationPackageDrafts({ store, goal, phase,
      createdAt: "2026-08-02T12:00:00.000Z" });
    const acceptance = createPhaseActivationPackageAcceptanceService({
      now: () => new Date("2026-08-15T18:30:00.000Z") });
    const acceptedStrategy = accept(acceptance, "Strategy", drafts.strategy);
    const acceptedTrajectory = accept(acceptance, "Trajectory", drafts.trajectory);
    const activeGoal = structuredClone(goal);
    const activePhase = activeGoal.phases.find((item) => item.id === phase.id);
    activeGoal.phases.find((item) => item.id !== phase.id).status = "completed";
    activeGoal.phases.find((item) => item.id !== phase.id).completedAt = "2026-08-15T19:00:00.000Z";
    activePhase.status = "active";
    activePhase.startedAt = "2026-08-15";
    activePhase.startDate = "2026-08-15";
    activeGoal.currentPhaseId = activePhase.id;
    const decision = decisionFor(activeGoal, activePhase, acceptedStrategy, acceptedTrajectory);
    const one = createPhase2StartingForecastInputPackage({ store, goal: activeGoal, activePhase,
      acceptedStrategy, acceptedTrajectory, decision });
    const two = createPhase2StartingForecastInputPackage({ store, goal: activeGoal, activePhase,
      acceptedStrategy, acceptedTrajectory, decision });
    expect(one).toEqual(two);
    expect(one.inputFingerprint).toBe(two.inputFingerprint);
    expect(one.goalBaseline).toMatchObject({ observedOn: "2026-07-18",
      metric: "lean_mass", value: 147.5, rawEvidenceIncluded: false });
    expect(one.phaseBoundaryBaseline).toMatchObject({ observedOn: "2026-08-15",
      bodyFatPercentage: 7.6, leanMass: { value: 148.3 }, fatMass: { value: 12.8 },
      rawEvidenceIncluded: false });
    expect(one.goalProgress).toMatchObject({ status: "available",
      cumulativeProgress: 0.8, requiredProgress: 10, remainingGap: 9.2 });
    expect(one.currentGuardrailState).toMatchObject({ bodyFatPercentage: 7.6 });
    expect(one.startingEvidenceDescriptors[0].measurements).toContainEqual(
      expect.objectContaining({ metric: "body_fat_pct", value: 7.6 }));
    expect(one.goalContract.strategyHypothesis).toEqual(acceptedStrategy.strategyHypothesis);
    expect(one.acceptedExpectedTrajectory.expectedTrajectory)
      .toEqual(acceptedTrajectory.expectedTrajectory);
    expect(one.goalContract.expectedTrajectory.segments.every((item) =>
      item.progressScope === "phase")).toBe(true);
    expect(one.goalContract.expectedTrajectory.segments[0].startBoundary)
      .toBe("2026-08-15");
    expect(one.goalContract.provenance.inferredMetadata).not.toContain("strategy_hypothesis_from_goal");
    expect(one.goalContract.provenance.inferredMetadata).not.toContain("expected_trajectory_from_goal");
    expect(one.exclusions).toEqual(expect.objectContaining({ rawEvidenceRecords: true,
      briefingJSX: true, presentationCopy: true, syntheticDEXAValues: true,
      unacceptedStrategyDrafts: true, v1NumericConversionAsV2Meaning: true }));
    expect(one.latestConfidenceContext).toMatchObject({ v1NumericConversionUsed: false });
    expect(JSON.stringify(one)).not.toContain("source_artifact_refs");
  });

  it("fails closed for draft records and stale accepted revisions", () => {
    const store = JSON.parse(fs.readFileSync(productionPath, "utf8"));
    const goal = plannedGoalForStartingForecast(store);
    const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
    const drafts = createFounderPhase2ActivationPackageDrafts({ store, goal, phase });
    const activePhase = { ...phase, status: "active", startedAt: "2026-08-15" };
    expect(() => createPhase2StartingForecastInputPackage({ store, goal, activePhase,
      acceptedStrategy: drafts.strategy, acceptedTrajectory: drafts.trajectory,
      decision: { ...decisionFor(goal, activePhase, drafts.strategy, drafts.trajectory),
        expectedStrategyRevision: 0, expectedTrajectoryRevision: 0 } })).toThrow(/accepted/i);
  });

  it("derives a reusable phase Starting Forecast package from supplied Goal semantics", () => {
    const goalId = "goal-generic";
    const phaseId = "phase-build";
    const goal = {
      id: goalId, userId: "user-generic", status: "active", title: "Improve outcome",
      target: { type: "numeric_change", metric: "lean_mass", direction: "increase",
        amount: 6, unit: "lb", description: "Improve the measured outcome",
        targetDate: "2030-06-30",
        baseline: { value: 100, observedOn: "2030-01-01", evidenceId: "baseline-generic" },
        currentMeasurement: { value: 102, observedOn: "2030-02-01",
          evidenceId: "current-generic" } },
      timeline: { startDate: "2030-01-01", targetDate: "2030-06-30",
        flexibility: "firm" },
      currentPhaseId: phaseId,
      phases: [{ id: "phase-calibration", status: "completed", startedAt: "2030-01-01",
        completedAt: "2030-02-01" },
      { id: phaseId, name: "Build", purpose: "Improve the measured outcome",
        status: "active", startedAt: "2030-02-02" }],
      guardrails: [], evidenceStrategy: {},
    };
    const strategy = genericAcceptedStrategy(goalId, phaseId);
    const trajectory = genericAcceptedTrajectory(goalId, phaseId);
    const store = { goals: [goal], executionItems: [{ id: "execution-generic", goalId }],
      goalConfidenceSnapshots: [], goalTransitionDrafts: [],
      dexaScans: [{ id: "phase-boundary-generic", date: "2030-02-01",
        leanMass: { value: 102, unit: "lb" }, fatMass: { value: 10, unit: "lb" },
        totalMass: { value: 120, unit: "lb" }, bodyFatPercentage: 8.3 }] };
    const decision = { decisionId: "decision-generic", idempotencyKey: "decision-generic",
      actorId: "user-generic", decidedAt: "2030-02-01T18:00:00.000Z",
      projectedNextPhaseStart: "2030-02-02", expectedStrategyRevision: strategy.revision,
      expectedTrajectoryRevision: trajectory.revision, reasoningLineage: [],
      originatingArtifactId: "artifact-generic", originatingForecastId: "forecast-generic",
      originatingInterpretationId: "interpretation-generic", goalId, nextPhaseId: phaseId,
      phaseEstablishment: { lineage: { sourceEvidenceId: "phase-boundary-generic" },
        executionTargets: { caloricIntake: "confirmed", activity: "confirmed" } } };

    const result = createPhase2StartingForecastInputPackage({ store, goal,
      activePhase: goal.phases[1], acceptedStrategy: strategy,
      acceptedTrajectory: trajectory, decision });

    expect(result).toMatchObject({
      goalBaseline: { baselineId: "baseline-generic", value: 100 },
      phaseBoundaryBaseline: { baselineId: "phase-boundary-generic" },
      goalProgress: { cumulativeProgress: 2, requiredProgress: 6, remainingGap: 4 },
      currentGuardrailState: { bodyFatPercentage: 8.3 },
      remainingGoalTimeline: { activationDate: "2030-02-02", targetDate: "2030-06-30" },
      executionTargets: { caloricIntake: "confirmed", activity: "confirmed" },
    });
    expect(result.goalContract.expectedTrajectory.segments[0]).toMatchObject({
      startBoundary: "2030-02-02", progressScope: "phase",
    });
    expect(result.startingEvidenceDescriptors.length).toBeGreaterThan(0);
  });
});

function genericAcceptedStrategy(goalId, phaseId) {
  const domains = Object.fromEntries(["energy", "nutrition", "training", "activity",
    "recovery", "coaching", "peptides", "supplements", "guardrailResponse"]
    .map((key) => [key, { intent: `${key}_intent` }]));
  return createPhaseStrategy({ id: "strategy-generic", goalId, phaseId, revision: 2,
    status: "accepted", createdAt: "2030-02-01T16:00:00.000Z",
    acceptedAt: "2030-02-01T17:00:00.000Z", acceptedBy: "user-generic",
    acceptanceId: "acceptance-strategy-generic",
    acceptanceIdempotencyKey: "accept-strategy-generic", acceptedRevision: 2,
    sourceLineage: [{ field: "record", sourceType: "test_fixture",
      sourceId: "strategy-source", path: "strategy", classification: "isolated_test_fixture" }],
    purpose: { supportLeanMassGain: true, protectBodyFatGuardrail: true,
      avoidUnnecessarilyAggressiveSurplus: true, preserveGoalRunway: true },
    domains, strategyHypothesis: { hypothesisId: "hypothesis-generic",
      strategyRef: { strategyId: "strategy-generic", strategyVersion: "2" },
      statement: "accepted_strategy_supports_the_goal", assumptions: [],
      expectedResponses: [{ responseId: "response-generic" }],
      validationConditions: [], falsificationConditions: [],
      expectedValidationTimeline: { startDate: "2030-02-02", targetDate: "2030-06-30" },
      requiredExecutionExposure: null } });
}

function genericAcceptedTrajectory(goalId, phaseId) {
  const milestone = (type) => ({ milestoneId: `milestone-${type}`, type,
    expectedTiming: { mode: "derived" }, purpose: `${type}_purpose`,
    expectedEvidence: ["canonical_reference"], uncertaintyReduced: ["uncertainty"],
    canTriggerStrategyReview: true, canSupportCompletion: type === "final_goal_assessment" });
  return createPhaseExpectedTrajectory({ id: "trajectory-generic", goalId, phaseId,
    revision: 2, status: "accepted", createdAt: "2030-02-01T16:00:00.000Z",
    acceptedAt: "2030-02-01T17:00:00.000Z", acceptedBy: "user-generic",
    acceptanceId: "acceptance-trajectory-generic",
    acceptanceIdempotencyKey: "accept-trajectory-generic", acceptedRevision: 2,
    sourceLineage: [{ field: "record", sourceType: "test_fixture",
      sourceId: "trajectory-source", path: "trajectory",
      classification: "isolated_test_fixture" }],
    timeline: { projectedStartRule: "authorized_transition", goalTargetDate: "2030-06-30",
      preActivationEvidenceOwnership: "none" },
    objectiveTrajectory: { fullTargetIsPromise: false, partialProgressHasValue: true,
      repeatValidationRequired: true },
    guardrailTrajectory: { independentFromObjective: true,
      acceptedRange: { min: 8, max: 9 } },
    weightTrajectory: { direction: "up" }, trainingTrajectory: { expectation: "progress" },
    milestones: ["phase_starting_forecast", "first_phase_cadence_review",
      "first_post_transition_photo_event", "objective_comparison", "mid_phase_review",
      "final_goal_assessment"].map(milestone),
    expectedTrajectory: { segments: [{ segmentId: "trajectory-segment-generic",
      startBoundary: "actual_activation", endBoundary: "2030-06-30",
      measurableChangeExpectation: "expected", expectedObjectiveRanges: [{
        expectationId: "trajectory-range-generic",
        objectiveRef: `objective|${goalId}|lean_mass`, min: 0, max: 6, unit: "lb" }] }] } });
}

function accept(service, type, draft) {
  const ready = service[`submit${type}ForReview`](draft, { expectedRevision: 0 });
  return service[`accept${type}`](ready, { actorId: "user_founder_001", expectedRevision: 1,
    idempotencyKey: `accept-${type.toLowerCase()}`,
    authorization: { authorized: true, scope: "phase_activation_package_acceptance",
      recordId: ready.id, actorId: "user_founder_001" } }).record;
}
function plannedGoalForStartingForecast(store) {
  const source = store.goals.find(isFounderBuildLeanMassGoal);
  const goal = structuredClone(projectFounderBuildLeanMassPhaseCorrection(source));
  const current = goal.phases.find((item) => item.name === "Establish Maintenance");
  const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
  current.status = "active";
  current.completedAt = null;
  current.completionDecisionId = null;
  current.reviewState = "due";
  current.revision = 0;
  current.reviewMilestone = {
    ...current.reviewMilestone,
    consumed: false,
    resolvedReviewId: null,
    revision: 0,
  };
  phase.status = "planned";
  phase.startDate = null;
  phase.startedAt = null;
  phase.projectedNextPhaseStart = "2026-08-15";
  phase.reviewState = "scheduled";
  phase.revision = 0;
  goal.currentPhaseId = current.id;
  goal.projectedNextPhaseId = phase.id;
  goal.activePhaseStrategyId = null;
  goal.activeExpectedTrajectoryId = null;
  goal.timeline = {
    ...goal.timeline,
    currentPhaseId: current.id,
    currentPhaseStartedAt: current.startedAt,
    projectedNextPhaseStart: "2026-08-15",
    activePhaseStrategyId: null,
    activeExpectedTrajectoryId: null,
  };
  store.goals.splice(store.goals.findIndex((item) => item.id === source.id), 1, goal);
  return goal;
}
function decisionFor(goal, phase, strategy, trajectory) {
  return { decisionId: "phase-review-decision", idempotencyKey: "phase-review-decision",
    actorId: "user_founder_001", decidedAt: "2026-08-15T19:00:00.000Z",
    projectedNextPhaseStart: "2026-08-15", expectedStrategyRevision: strategy.revision,
    expectedTrajectoryRevision: trajectory.revision, reasoningLineage: [{ id: "reason", type: "review" }],
    originatingArtifactId: "dexa-briefing", originatingForecastId: "forecast",
    originatingInterpretationId: "interpretation", goalId: goal.id, nextPhaseId: phase.id };
}
