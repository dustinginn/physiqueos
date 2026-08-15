import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createPhaseReviewCommitCoordinator } from "./PhaseReviewCommitCoordinator";
import { createPhaseStrategy } from "../models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import {
  PHASE_REVIEW_PARTICIPANT_ORDER,
  PhaseReviewParticipantName,
  createCanonicalPhaseReviewParticipants,
} from "./PhaseReviewCommitParticipants";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Phase Review Commit Coordinator", () => {
  it("atomically activates Phase 2, accepted Strategy, trajectory, Starting Forecast, and read models", async () => {
    const fixture = createFixture();
    const beforeProtocols = structuredClone(fixture.liveStore.protocols);
    const decision = beginDecision();
    const result = await fixture.coordinator.commit(decision, {
      authorization: authorization(decision), expectedStoreRevision: 7,
    });

    expect(result).toMatchObject({ status: "committed", committed: true,
      idempotent: false, participantOrder: PHASE_REVIEW_PARTICIPANT_ORDER });
    const stored = read(fixture.file);
    expect(stored.goals[0].phases[0]).toMatchObject({
      status: "completed", completedAt: decision.decidedAt,
      plannedReviewAt: "2026-08-15", completionDecisionId: decision.decisionId,
    });
    expect(stored.goals[0].phases[1]).toMatchObject({
      status: "active", startedAt: "2026-08-16", projectedNextPhaseStart: null,
    });
    expect(stored.goals[0]).toMatchObject({
      currentPhaseId: "p2", projectedNextPhaseId: null,
      activePhaseStrategyId: "strategy-p2",
      activeExpectedTrajectoryId: "trajectory-p2",
    });
    expect(stored.phaseStrategies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "strategy-p1", status: "active" }),
      expect.objectContaining({ id: "strategy-p2", status: "accepted" }),
    ]));
    expect(stored.phaseExpectedTrajectories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "trajectory-p2", status: "accepted" }),
    ]));
    expect(stored.goalConfidenceSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ phaseId: "p2", publisherType: "goal_initialization",
        previousCanonicalAssessmentId: null }),
    ]));
    expect(stored.confidenceInitializationArtifacts).toHaveLength(1);
    expect(stored.confidenceInitializationArtifacts[0]).toMatchObject({
      artifactType: "phase_starting_forecast", phaseId: "p2",
      occurrenceId: decision.decisionId, commitId: "commit",
    });
    expect(stored.phaseLifecycleReadModels[0]).toMatchObject({
      activePhaseId: "p2", strategyId: "strategy-p2",
      expectedTrajectoryId: "trajectory-p2",
      protocolScheduling: { phaseId: "p2", definitionsChanged: false,
        mode: "phase_activation" },
    });
    expect(stored.phaseReviewTransactions[0]).toMatchObject({
      status: "committed", commitId: "commit", committedRevision: 8,
      participantOrder: PHASE_REVIEW_PARTICIPANT_ORDER,
    });
    expect(stored.protocols).toEqual(beforeProtocols);
    expect(stored.dailyBriefings).toEqual(fixture.before.dailyBriefings);
    expect(stored.canonicalEvidenceObjects).toEqual(fixture.before.canonicalEvidenceObjects);
  });

  it.each([
    ["Strategy", (store) => { store.phaseStrategies = store.phaseStrategies.filter((item) => item.id !== "strategy-p2"); },
      "PHASE_REVIEW_PARTICIPANT_ACCEPTED_STRATEGY_REQUIRED"],
    ["trajectory", (store) => { store.phaseExpectedTrajectories = store.phaseExpectedTrajectories.filter((item) => item.id !== "trajectory-p2"); },
      "PHASE_REVIEW_PARTICIPANT_ACCEPTED_TRAJECTORY_REQUIRED"],
  ])("rolls back Begin completely when %s preparation fails", async (_name, arrange, code) => {
    const fixture = createFixture({ arrangeStore: arrange });
    const before = fs.readFileSync(fixture.file);
    const decision = beginDecision();
    const result = await fixture.coordinator.commit(decision, { authorization: authorization(decision) });
    expect(result).toMatchObject({ status: "failed", committed: false, reasonCode: code });
    expect(result.rollbackEvents.length).toBeGreaterThan(0);
    expect(fs.readFileSync(fixture.file)).toEqual(before);
    expect(fixture.liveStore).toEqual(JSON.parse(before.toString("utf8")));
  });

  it.each([
    ["multiple accepted Strategies", (store) => store.phaseStrategies.push(
      acceptedStrategyRecord("goal", "strategy-p2-duplicate")),
    "PHASE_REVIEW_PARTICIPANT_ACCEPTED_STRATEGY_REQUIRED"],
    ["multiple accepted trajectories", (store) => store.phaseExpectedTrajectories.push(
      acceptedTrajectoryRecord("goal", "trajectory-p2-duplicate")),
    "PHASE_REVIEW_PARTICIPANT_ACCEPTED_TRAJECTORY_REQUIRED"],
  ])("fails closed for %s", async (_name, arrange, code) => {
    const fixture = createFixture({ arrangeStore: arrange });
    const before = fs.readFileSync(fixture.file);
    const decision = beginDecision();
    expect(await fixture.coordinator.commit(decision, { authorization: authorization(decision) }))
      .toMatchObject({ status: "failed", reasonCode: code });
    expect(fs.readFileSync(fixture.file)).toEqual(before);
  });

  it.each([
    ["Strategy", { expectedStrategyRevision: 1 },
      "PHASE_REVIEW_PARTICIPANT_STRATEGY_REVISION_MISMATCH"],
    ["trajectory", { expectedTrajectoryRevision: 1 },
      "PHASE_REVIEW_PARTICIPANT_TRAJECTORY_REVISION_MISMATCH"],
  ])("rejects stale accepted %s revisions", async (_name, overrides, code) => {
    const fixture = createFixture();
    const decision = beginDecision(overrides);
    expect(await fixture.coordinator.commit(decision, { authorization: authorization(decision) }))
      .toMatchObject({ status: "failed", reasonCode: code });
  });

  it("rolls back every staged mutation when Starting Forecast fails", async () => {
    const participants = replaceParticipant(createCanonicalPhaseReviewParticipants(),
      PhaseReviewParticipantName.STARTING_FORECAST, {
        async prepare() {
          const error = new Error("injected Starting Forecast failure");
          error.code = "INJECTED_STARTING_FORECAST_FAILURE";
          throw error;
        },
      });
    const fixture = createFixture({ participants });
    const before = fs.readFileSync(fixture.file);
    const decision = beginDecision();
    const result = await fixture.coordinator.commit(decision, { authorization: authorization(decision) });
    expect(result).toMatchObject({ status: "failed", committed: false,
      reasonCode: "INJECTED_STARTING_FORECAST_FAILURE" });
    expect(result.rollbackEvents).toEqual([
      PhaseReviewParticipantName.EXECUTION_TARGETS,
      PhaseReviewParticipantName.EXPECTED_TRAJECTORY,
      PhaseReviewParticipantName.STRATEGY,
      PhaseReviewParticipantName.NEXT_PHASE,
      PhaseReviewParticipantName.CURRENT_PHASE,
      PhaseReviewParticipantName.GOAL,
      PhaseReviewParticipantName.PHASE_REVIEW,
    ]);
    expect(fs.readFileSync(fixture.file)).toEqual(before);
  });

  it.each([
    ["validate", { async validate() { return false; } },
      "PHASE_REVIEW_PARTICIPANT_READ_MODELS_VALIDATE_FAILED"],
    ["commit", { async commit() { const error = new Error("injected read-model commit failure");
      error.code = "INJECTED_READ_MODEL_COMMIT_FAILURE"; throw error; } },
      "INJECTED_READ_MODEL_COMMIT_FAILURE"],
  ])("rolls back the whole transaction when participant %s fails", async (_stage, override, code) => {
    const participants = replaceParticipant(createCanonicalPhaseReviewParticipants(),
      PhaseReviewParticipantName.READ_MODELS, override);
    const fixture = createFixture({ participants });
    const before = fs.readFileSync(fixture.file);
    const decision = beginDecision({ decisionId: `decision-${_stage}`,
      idempotencyKey: `key-${_stage}` });
    const result = await fixture.coordinator.commit(decision, {
      authorization: authorization(decision),
    });
    expect(result).toMatchObject({ status: "failed", committed: false, reasonCode: code });
    expect(result.rollbackEvents).toHaveLength(9);
    expect(fs.readFileSync(fixture.file)).toEqual(before);
  });

  it.each([
    ["1_week", "2026-08-22"],
    ["2_weeks", "2026-08-29"],
    ["3_weeks", "2026-09-05"],
    ["custom", "2026-09-12"],
  ])("atomically continues Phase 1 for %s without Strategy, trajectory, or Starting Forecast activation",
    async (selectedDuration, selectedReviewAt) => {
      const fixture = createFixture();
      const decision = extendDecision({ selectedDuration, selectedReviewAt });
      const result = await fixture.coordinator.commit(decision, {
        authorization: authorization(decision),
      });
      expect(result.status).toBe("committed");
      const stored = read(fixture.file);
      expect(stored.goals[0].phases[0]).toMatchObject({
        status: "active", plannedReviewAt: selectedReviewAt, reviewState: "extended",
        extensionCount: 1, latestExtensionDecisionId: decision.decisionId,
      });
      expect(stored.goals[0].phases[1]).toMatchObject({
        status: "planned", startedAt: null, projectedNextPhaseStart: selectedReviewAt,
      });
      expect(stored.phaseStrategies).toEqual(fixture.before.phaseStrategies);
      expect(stored.phaseExpectedTrajectories).toEqual(fixture.before.phaseExpectedTrajectories);
      expect(stored.goalConfidenceSnapshots).toEqual(fixture.before.goalConfidenceSnapshots);
      expect(stored.confidenceInitializationArtifacts).toEqual([]);
      expect(stored.phaseLifecycleReadModels[0]).toMatchObject({
        activePhaseId: "p1", plannedReviewAt: selectedReviewAt,
        forecastTiming: { phaseId: "p1", reviewAt: selectedReviewAt,
          mode: "extension_timing_update" },
      });
    });

  it("is idempotent and rejects stale phase and store revisions", async () => {
    const fixture = createFixture();
    const decision = extendDecision();
    expect((await fixture.coordinator.commit(decision, {
      authorization: authorization(decision), expectedStoreRevision: 7,
    })).idempotent).toBe(false);
    expect(await fixture.coordinator.commit(decision, {
      authorization: authorization(decision),
    })).toMatchObject({ status: "committed", idempotent: true, revision: 8 });
    expect(read(fixture.file).phaseReviewDecisions).toHaveLength(1);

    const stalePhase = createFixture();
    const staleDecision = extendDecision({ decisionId: "stale-phase", idempotencyKey: "stale-phase",
      expectedCurrentPhaseRevision: 9 });
    expect(await stalePhase.coordinator.commit(staleDecision, {
      authorization: authorization(staleDecision),
    })).toMatchObject({ status: "failed", committed: false,
      reasonCode: "PHASE_REVIEW_PARTICIPANT_EXPECTED_PHASE_MISMATCH" });

    const staleStore = createFixture();
    const storeDecision = extendDecision({ decisionId: "stale-store", idempotencyKey: "stale-store" });
    expect(await staleStore.coordinator.commit(storeDecision, {
      authorization: authorization(storeDecision), expectedStoreRevision: 6,
    })).toMatchObject({ status: "rejected", committed: false,
      reasonCode: "PHASE_REVIEW_EXPECTED_STORE_REVISION_MISMATCH" });
  });

  it("preserves the August 15 milestone across consecutive extensions", async () => {
    const fixture = createFixture();
    const first = extendDecision();
    expect((await fixture.coordinator.commit(first, {
      authorization: authorization(first),
    })).status).toBe("committed");
    const second = extendDecision({ decisionId: "decision-2", idempotencyKey: "key-2",
      expectedCurrentPhaseRevision: 1, selectedDuration: "1_week",
      selectedReviewAt: "2026-08-29" });
    expect((await fixture.coordinator.commit(second, {
      authorization: authorization(second),
    })).status).toBe("committed");
    const phase = read(fixture.file).goals[0].phases[0];
    expect(phase).toMatchObject({ plannedReviewAt: "2026-08-29",
      originalPlannedReviewAt: "2026-08-15", extensionCount: 2,
      reviewMilestone: { earliestEligibleDate: "2026-08-29", consumed: false,
        resolvedReviewId: null, designatedArtifactIdentity: null,
        designatedEvidenceIdentity: null } });
    expect(phase.reviewMilestoneHistory).toHaveLength(2);
    expect(phase.reviewMilestoneHistory[0]).toMatchObject({
      earliestEligibleDate: "2026-08-15", consumed: true,
      resolvedReviewId: "decision-1" });
  });

  it("rejects overlapping decisions for the same Goal", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const participants = replaceParticipant(createCanonicalPhaseReviewParticipants(),
      PhaseReviewParticipantName.PHASE_REVIEW, {
        async prepare(context) { await gate; return structuredClone(context.decision); },
      });
    const fixture = createFixture({ participants });
    const firstDecision = extendDecision({ decisionId: "first", idempotencyKey: "first" });
    const secondDecision = extendDecision({ decisionId: "second", idempotencyKey: "second" });
    const first = fixture.coordinator.commit(firstDecision, { authorization: authorization(firstDecision) });
    await Promise.resolve();
    const second = await fixture.coordinator.commit(secondDecision, { authorization: authorization(secondDecision) });
    expect(second).toMatchObject({ status: "rejected",
      reasonCode: "PHASE_REVIEW_CONCURRENT_MUTATION" });
    release();
    expect((await first).status).toBe("committed");
  });
});

function createFixture({ arrangeStore = () => {}, participants } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase-review-coordinator-"));
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  const liveStore = store();
  arrangeStore(liveStore);
  fs.writeFileSync(file, JSON.stringify(liveStore));
  const before = structuredClone(liveStore);
  const coordinator = createPhaseReviewCommitCoordinator({
    runtimeStorePath: file,
    liveStore,
    readPersistedStore: () => read(file),
    participants,
    now: () => new Date("2026-08-15T19:00:00.000Z"),
    createUnitOfWork: (options) => createFounderStoreUnitOfWork({
      ...options,
      createCommitId: () => "commit",
      createTransactionId: () => "transaction",
    }),
  });
  return { file, liveStore, before, coordinator };
}

function store() {
  const goalId = "goal";
  return {
    version: 1,
    revision: 7,
    updatedAt: "2026-08-15T18:00:00.000Z",
    user: { id: "user" },
    goals: [{
      id: goalId,
      userId: "user",
      title: "Build Lean Mass",
      type: "build_lean_mass",
      primary: true,
      status: "active",
      purpose: "Build lean mass while protecting body composition.",
      target: { type: "numeric_change", metric: "lean_mass", direction: "increase",
        amount: 10, unit: "lb", description: "Build 10 lb of lean mass",
        targetDate: "2026-10-31" },
      guardrails: [],
      currentPhaseId: "p1",
      projectedNextPhaseId: "p2",
      timeline: { startDate: "2026-07-19", targetDate: "2026-10-31",
        currentPhaseId: "p1", projectedNextPhaseStart: "2026-08-16" },
      phases: [
        { id: "p1", goalId, name: "Establish Maintenance", purpose: "Establish maintenance.",
          order: 0, status: "active", startedAt: "2026-07-19", startDate: "2026-07-19",
          plannedReviewAt: "2026-08-15", timingMode: "completion_criteria",
          completionDecisionRequired: true, reviewState: "due", revision: 0,
          successCriteria: [] },
        { id: "p2", goalId, name: "Lean Mass Build", purpose: "Build lean mass.",
          order: 1, status: "planned", startedAt: null, startDate: null,
          projectedNextPhaseStart: "2026-08-16", plannedReviewAt: "2026-10-15",
          targetDate: "2026-10-31", timingMode: "target_date",
          completionDecisionRequired: true, reviewState: "scheduled", revision: 0,
          successCriteria: [] },
      ],
    }],
    phaseReviewDecisions: [],
    phaseReviewTransactions: [],
    phaseStrategies: [
      { id: "strategy-p1", goalId, phaseId: "p1", status: "active",
        strategyHypothesis: strategyHypothesis("strategy-p1") },
      acceptedStrategyRecord(goalId),
    ],
    phaseExpectedTrajectories: [
      { id: "trajectory-p1", goalId, phaseId: "p1", status: "active",
        expectedTrajectory: expectedTrajectory("trajectory-p1", "2026-07-19", "2026-08-15") },
      acceptedTrajectoryRecord(goalId),
    ],
    phaseLifecycleReadModels: [],
    executionItems: [{ id: "execution-history-1", goalId, status: "completed" }],
    protocols: [{ id: "protocol-1", status: "active", goalIds: [goalId] }],
    protocolVersions: [{ id: "protocol-version-1", protocolId: "protocol-1" }],
    energyStrategyLinks: [],
    goalConfidenceSnapshots: [{ id: "snapshot-p1", goalId, phaseId: "p1",
      currentAssessmentId: "baseline-assessment" }],
    goalConfidenceHistory: [],
    confidenceInitializationArtifacts: [],
    dailyBriefings: [{ id: "historical" }],
    canonicalEvidenceObjects: [{ canonicalId: "evidence-history" }],
    evidencePackages: [],
    dexaScans: [],
    progressPhotos: [],
  };
}

function strategyHypothesis(strategyId) {
  return {
    hypothesisId: `hypothesis|${strategyId}`,
    strategyRef: { strategyId, strategyVersion: "2026-08-15T18:30:00.000Z" },
    statement: "accepted_progressive_training_supports_lean_mass_response",
    assumptions: [],
    expectedResponses: [{ responseId: "response_training_exposure" }],
    validationConditions: [],
    falsificationConditions: [],
    expectedValidationTimeline: { startDate: "2026-08-16", targetDate: "2026-10-31" },
    requiredExecutionExposure: null,
  };
}

function expectedTrajectory(id, startBoundary, endBoundary) {
  return { segments: [{ segmentId: id, startBoundary, endBoundary,
    measurableChangeExpectation: "expected", expectedObjectiveRanges: [{
      expectationId: `${id}|lean_mass`, objectiveRef: "objective|goal|lean_mass",
      min: 0, max: 10, unit: "lb",
    }] }] };
}

function acceptedStrategyRecord(goalId, id = "strategy-p2") {
  const domains = Object.fromEntries(["energy", "nutrition", "training", "activity",
    "recovery", "coaching", "peptides", "supplements", "guardrailResponse"]
    .map((key) => [key, { intent: `${key}_intent` }]));
  return createPhaseStrategy({ id, goalId, phaseId: "p2", revision: 2,
    status: "accepted", createdAt: "2026-08-15T18:00:00.000Z",
    acceptedAt: "2026-08-15T18:30:00.000Z", acceptedBy: "user",
    acceptanceId: `acceptance-${id}`, acceptanceIdempotencyKey: `accept-${id}`,
    acceptedRevision: 2,
    sourceLineage: [{ field: "record", sourceType: "test_fixture", sourceId: "strategy-source",
      path: "strategy", classification: "isolated_test_fixture" }],
    purpose: { supportLeanMassGain: true, protectBodyFatGuardrail: true,
      avoidUnnecessarilyAggressiveSurplus: true, preserveGoalRunway: true },
    domains, strategyHypothesis: strategyHypothesis(id) });
}

function acceptedTrajectoryRecord(goalId, id = "trajectory-p2") {
  const milestone = (type) => ({ milestoneId: `milestone-${type}`, type,
    expectedTiming: { mode: "derived" }, purpose: `${type}_purpose`,
    expectedEvidence: ["canonical_reference"], uncertaintyReduced: ["uncertainty"],
    canTriggerStrategyReview: true, canSupportCompletion: type === "final_goal_assessment" });
  return createPhaseExpectedTrajectory({ id, goalId, phaseId: "p2", revision: 2,
    status: "accepted", createdAt: "2026-08-15T18:00:00.000Z",
    acceptedAt: "2026-08-15T18:30:00.000Z", acceptedBy: "user",
    acceptanceId: `acceptance-${id}`, acceptanceIdempotencyKey: `accept-${id}`,
    acceptedRevision: 2,
    sourceLineage: [{ field: "record", sourceType: "test_fixture", sourceId: "trajectory-source",
      path: "trajectory", classification: "isolated_test_fixture" }],
    timeline: { projectedStartRule: "authorized_transition", goalTargetDate: "2026-10-31",
      preActivationEvidenceOwnership: "none" },
    objectiveTrajectory: { fullTargetIsPromise: false, partialProgressHasValue: true,
      repeatValidationRequired: true },
    guardrailTrajectory: { independentFromObjective: true, acceptedRange: { min: 8, max: 9 } },
    weightTrajectory: { direction: "up" }, trainingTrajectory: { expectation: "progress" },
    milestones: ["phase_starting_forecast", "first_phase_cadence_review",
      "first_post_transition_photo_event", "objective_comparison", "mid_phase_review",
      "final_goal_assessment"].map(milestone),
    expectedTrajectory: expectedTrajectory(id, "2026-08-16", "2026-10-31") });
}

function beginDecision(overrides = {}) {
  return decision({ recommendedOutcome: "begin_next_phase", selectedOutcome: "begin_next_phase",
    selectedDuration: null, selectedReviewAt: null, projectedNextPhaseStart: null, ...overrides });
}
function extendDecision(overrides = {}) {
  return decision({ recommendedOutcome: "extend_current_phase",
    selectedOutcome: "extend_current_phase", selectedDuration: "1_week",
    selectedReviewAt: "2026-08-22", projectedNextPhaseStart: null, ...overrides });
}
function decision(overrides = {}) {
  return {
    decisionId: "decision-1", goalId: "goal", currentPhaseId: "p1", nextPhaseId: "p2",
    originalPlannedReviewAt: "2026-08-15", recommendedOutcome: "begin_next_phase",
    recommendedDuration: 14, recommendedReviewAt: "2026-08-29",
    rationale: "The evidence supports the authorized decision.", selectedOutcome: "begin_next_phase",
    selectedDuration: null, selectedReviewAt: null, projectedNextPhaseStart: null,
    decidedAt: "2026-08-15T19:00:00.000Z", decisionSource: "dexa_phase_review",
    originatingArtifactId: "dexa-briefing", originatingForecastId: "forecast-1",
    originatingInterpretationId: "interpretation-1", confidenceAssessmentId: "confidence-1",
    reasoningLineage: [{ id: "reason-1", type: "forecast_reasoning" }],
    idempotencyKey: "key-1", expectedCurrentPhaseStatus: "active",
    expectedCurrentPhaseRevision: 0, expectedStrategyRevision: 2,
    expectedTrajectoryRevision: 2, actorId: "user", ...overrides,
  };
}
function authorization(value) {
  return { authorized: true, scope: "phase_review_decision",
    decisionId: value.decisionId, actorId: value.actorId };
}
function replaceParticipant(participants, name, overrides) {
  return participants.map((item) => item.name === name ? { ...item, ...overrides } : item);
}
function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
