import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderBuildLeanMassPhaseRepairPlan, isFounderBuildLeanMassGoal } from
  "./FounderPhaseCorrectionService";
import { createFounderPhase2ActivationPackageDrafts } from
  "./FounderPhase2ActivationPackageService";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";
import { createPhaseReviewCommitCoordinator } from "./PhaseReviewCommitCoordinator";
import { createCanonicalPhaseReviewParticipants, PhaseReviewParticipantName } from
  "./PhaseReviewCommitParticipants";

const productionPath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Founder Phase 2 production-shaped activation simulation", () => {
  it("fails closed until both records are accepted, then commits atomically and replays", async () => {
    const productionBefore = fs.readFileSync(productionPath);
    const productionFingerprint = sha256(productionBefore);
    const source = JSON.parse(productionBefore.toString("utf8"));
    const sourceGoal = source.goals.find(isFounderBuildLeanMassGoal);
    const repair = createFounderBuildLeanMassPhaseRepairPlan(sourceGoal);
    const simulated = source;
    simulated.goals.splice(simulated.goals.findIndex((item) => item.id === sourceGoal.id),
      1, structuredClone(repair.candidate));
    restorePreTransitionSimulation(simulated, repair.goalId);
    simulated.phaseReviewDecisions ??= [];
    simulated.phaseReviewTransactions ??= [];
    simulated.phaseStrategies = [];
    simulated.phaseExpectedTrajectories = [];
    simulated.phaseLifecycleReadModels = [];
    const goal = simulated.goals.find((item) => item.id === repair.goalId);
    const first = goal.phases.find((item) => item.name === "Establish Maintenance");
    const second = goal.phases.find((item) => item.name === "Lean Mass Build");
    const drafts = createFounderPhase2ActivationPackageDrafts({ store: simulated, goal,
      phase: second, createdAt: "2026-08-02T12:00:00.000Z" });
    simulated.phaseStrategies.push(structuredClone(drafts.strategy));
    simulated.phaseExpectedTrajectories.push(structuredClone(drafts.trajectory));

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase-2-activation-simulation-"));
    directories.push(directory);
    const simulationPath = path.join(directory, "runtime-store.json");
    fs.writeFileSync(simulationPath, JSON.stringify(simulated));
    const liveStore = structuredClone(simulated);
    const decision = beginDecision({ goal, first, second });
    let coordinator = coordinatorFor({ simulationPath, liveStore });

    const draftStrategyBytes = fs.readFileSync(simulationPath);
    expect(await coordinator.commit(decision, { authorization: authorization(decision) }))
      .toMatchObject({ status: "failed",
        reasonCode: "PHASE_REVIEW_PARTICIPANT_ACCEPTED_STRATEGY_REQUIRED" });
    expect(fs.readFileSync(simulationPath).equals(draftStrategyBytes)).toBe(true);

    const acceptance = createPhaseActivationPackageAcceptanceService({
      now: () => new Date("2026-08-15T18:30:00.000Z") });
    const acceptedStrategy = accept(acceptance, "Strategy", drafts.strategy,
      "accept-founder-phase-2-strategy-v1");
    replaceRecord(simulated.phaseStrategies, acceptedStrategy);
    replaceRecord(liveStore.phaseStrategies, acceptedStrategy);
    fs.writeFileSync(simulationPath, JSON.stringify(simulated));
    const draftTrajectoryBytes = fs.readFileSync(simulationPath);
    coordinator = coordinatorFor({ simulationPath, liveStore });
    expect(await coordinator.commit(decision, { authorization: authorization(decision) }))
      .toMatchObject({ status: "failed",
        reasonCode: "PHASE_REVIEW_PARTICIPANT_ACCEPTED_TRAJECTORY_REQUIRED" });
    expect(fs.readFileSync(simulationPath).equals(draftTrajectoryBytes)).toBe(true);

    const acceptedTrajectory = accept(acceptance, "Trajectory", drafts.trajectory,
      "accept-founder-phase-2-trajectory-v1");
    replaceRecord(simulated.phaseExpectedTrajectories, acceptedTrajectory);
    replaceRecord(liveStore.phaseExpectedTrajectories, acceptedTrajectory);
    fs.writeFileSync(simulationPath, JSON.stringify(simulated));
    const acceptedStrategyBytes = JSON.stringify(acceptedStrategy);
    const acceptedTrajectoryBytes = JSON.stringify(acceptedTrajectory);
    const protectedBefore = protectedFingerprints(simulated);

    const staleDecision = { ...decision, decisionId: "simulation-stale-strategy",
      idempotencyKey: "simulation-stale-strategy", expectedStrategyRevision: 1 };
    const beforeStale = fs.readFileSync(simulationPath);
    coordinator = coordinatorFor({ simulationPath, liveStore });
    expect(await coordinator.commit(staleDecision, { authorization: authorization(staleDecision) }))
      .toMatchObject({ status: "failed",
        reasonCode: "PHASE_REVIEW_PARTICIPANT_STRATEGY_REVISION_MISMATCH" });
    expect(fs.readFileSync(simulationPath).equals(beforeStale)).toBe(true);

    const rollbackParticipants = replaceParticipant(createCanonicalPhaseReviewParticipants(),
      PhaseReviewParticipantName.READ_MODELS, { async commit() {
        const error = new Error("simulation rollback injection");
        error.code = "PHASE_2_SIMULATION_ROLLBACK"; throw error;
      } });
    const beforeRollback = fs.readFileSync(simulationPath);
    coordinator = coordinatorFor({ simulationPath, liveStore, participants: rollbackParticipants });
    expect(await coordinator.commit({ ...decision, decisionId: "simulation-rollback",
      idempotencyKey: "simulation-rollback" }, { authorization: authorization({ ...decision,
        decisionId: "simulation-rollback" }) })).toMatchObject({ status: "failed",
      reasonCode: "PHASE_2_SIMULATION_ROLLBACK" });
    expect(fs.readFileSync(simulationPath).equals(beforeRollback)).toBe(true);

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const gatedParticipants = replaceParticipant(createCanonicalPhaseReviewParticipants(),
      PhaseReviewParticipantName.PHASE_REVIEW, {
        async prepare(context) { await gate; return structuredClone(context.decision); },
      });
    coordinator = coordinatorFor({ simulationPath, liveStore, participants: gatedParticipants });
    const firstCommit = coordinator.commit(decision, { authorization: authorization(decision) });
    await Promise.resolve();
    const concurrentDecision = { ...decision, decisionId: "simulation-concurrent",
      idempotencyKey: "simulation-concurrent" };
    expect(await coordinator.commit(concurrentDecision, {
      authorization: authorization(concurrentDecision),
    })).toMatchObject({ status: "rejected", reasonCode: "PHASE_REVIEW_CONCURRENT_MUTATION" });
    release();
    const committed = await firstCommit;
    expect(committed).toMatchObject({ status: "committed", committed: true, idempotent: false });

    const stored = JSON.parse(fs.readFileSync(simulationPath, "utf8"));
    const storedGoal = stored.goals.find((item) => item.id === goal.id);
    expect(storedGoal.phases.find((item) => item.id === first.id)).toMatchObject({
      status: "completed", completionDecisionId: decision.decisionId });
    expect(storedGoal.phases.find((item) => item.id === second.id)).toMatchObject({
      status: "active", startedAt: "2026-08-15" });
    expect(storedGoal).toMatchObject({ activePhaseStrategyId: acceptedStrategy.id,
      activeExpectedTrajectoryId: acceptedTrajectory.id, currentPhaseId: second.id });
    expect(JSON.stringify(stored.phaseStrategies.find((item) => item.id === acceptedStrategy.id)))
      .toBe(acceptedStrategyBytes);
    expect(JSON.stringify(stored.phaseExpectedTrajectories.find((item) => item.id === acceptedTrajectory.id)))
      .toBe(acceptedTrajectoryBytes);
    expect(stored.confidenceInitializationArtifacts.some((item) =>
      item.occurrenceId === decision.decisionId && item.phaseId === second.id)).toBe(true);
    expect(stored.phaseLifecycleReadModels.find((item) => item.goalId === goal.id))
      .toMatchObject({ activePhaseId: second.id, strategyId: acceptedStrategy.id,
        expectedTrajectoryId: acceptedTrajectory.id });
    expect(protectedFingerprints(stored)).toEqual(protectedBefore);
    expect(await coordinator.commit(decision, { authorization: authorization(decision) }))
      .toMatchObject({ status: "committed", idempotent: true });
    expect(fs.readFileSync(productionPath).equals(productionBefore)).toBe(true);
    expect(sha256(fs.readFileSync(productionPath))).toBe(productionFingerprint);
  }, 180000);
});

function restorePreTransitionSimulation(store, goalId) {
  const goal = store.goals.find((item) => item.id === goalId);
  const current = goal.phases.find((item) => item.name === "Establish Maintenance");
  const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
  Object.assign(current, {
    status: "active",
    completedAt: null,
    completionDecisionId: null,
    lastReviewedAt: null,
    reviewState: "due",
    revision: 0,
    reviewMilestone: {
      ...current.reviewMilestone,
      consumed: false,
      resolvedReviewId: null,
      revision: 0,
    },
  });
  Object.assign(phase, {
    status: "planned",
    startDate: null,
    startedAt: null,
    projectedNextPhaseStart: "2026-08-15",
    reviewState: "scheduled",
    revision: 0,
  });
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
  store.goalConfidenceSnapshots = (store.goalConfidenceSnapshots ?? [])
    .filter((item) => item.phaseId !== phase.id);
  store.goalConfidenceHistory = (store.goalConfidenceHistory ?? [])
    .filter((item) => item.phaseId !== phase.id);
  store.confidenceInitializationArtifacts = (store.confidenceInitializationArtifacts ?? [])
    .filter((item) => item.phaseId !== phase.id);
  const energy = (store.protocols ?? []).find((protocol) =>
    protocol.status === "active" && (protocol.protocolType === "energy" ||
      protocol.category === "energy") && protocol.currentVersionId);
  const replacement = (store.protocolVersions ?? []).find((item) =>
    item.id === energy?.currentVersionId);
  const previous = (store.protocolVersions ?? []).find((item) =>
    item.id === replacement?.change?.previousVersionId);
  if (energy && replacement && previous) {
    energy.currentVersionId = previous.id;
    energy.effectiveStrategy = structuredClone(previous.change?.reviewedChanges ?? {});
    energy.phaseId = current.id;
    energy.phaseStrategyId = null;
    previous.status = "active";
    previous.endedAt = null;
    delete previous.supersededByVersionId;
    store.protocolVersions = store.protocolVersions.filter((item) =>
      item.id !== replacement.id);
  }
}

function coordinatorFor({ simulationPath, liveStore, participants }) {
  return createPhaseReviewCommitCoordinator({ runtimeStorePath: simulationPath, liveStore,
    readPersistedStore: () => JSON.parse(fs.readFileSync(simulationPath, "utf8")), participants,
    now: () => new Date("2026-08-15T19:00:00.000Z"),
    createUnitOfWork: (options) => createFounderStoreUnitOfWork({ ...options,
      createCommitId: () => "phase-2-simulation-commit",
      createTransactionId: () => "phase-2-simulation-transaction" }) });
}
function beginDecision({ goal, first, second }) {
  return { decisionId: "simulation-founder-begin-phase-2", goalId: goal.id,
    currentPhaseId: first.id, nextPhaseId: second.id, originalPlannedReviewAt: "2026-08-15",
    recommendedOutcome: "begin_next_phase", recommendedDuration: null,
    recommendedReviewAt: null, rationale: "Temporary-clone simulation only.",
    selectedOutcome: "begin_next_phase", selectedDuration: null, selectedReviewAt: null,
    projectedNextPhaseStart: "2026-08-15", decidedAt: "2026-08-15T19:00:00.000Z",
    decisionSource: "production_shaped_simulation", originatingArtifactId: "simulation-artifact",
    originatingForecastId: "simulation-forecast", originatingInterpretationId: "simulation-interpretation",
    confidenceAssessmentId: "simulation-confidence",
    reasoningLineage: [{ id: "simulation-reasoning", type: "simulation" }],
    idempotencyKey: "simulation-founder-begin-phase-2", expectedCurrentPhaseStatus: "active",
    expectedCurrentPhaseRevision: first.revision, expectedStrategyRevision: 2,
    expectedTrajectoryRevision: 2, actorId: goal.userId };
}
function authorization(decision) { return { authorized: true, scope: "phase_review_decision",
  decisionId: decision.decisionId, actorId: decision.actorId }; }
function accept(service, type, draft, idempotencyKey) {
  const ready = service[`submit${type}ForReview`](draft, { expectedRevision: 0 });
  return service[`accept${type}`](ready, { actorId: "user_founder_001", expectedRevision: 1,
    idempotencyKey, authorization: { authorized: true,
      scope: "phase_activation_package_acceptance", recordId: ready.id,
      actorId: "user_founder_001" } }).record;
}
function replaceRecord(records, record) { const index = records.findIndex((item) => item.id === record.id);
  records.splice(index, 1, structuredClone(record)); }
function protectedFingerprints(store) { return Object.fromEntries([
  "protocols", "protocolVersions", "executionItems", "dailyBriefings", "canonicalEvidenceObjects",
  "evidencePackages", "dexaScans", "progressPhotos", "goalTransitionDrafts",
  "goalProtocolTransitionDrafts",
].map((key) => [key, sha256(Buffer.from(JSON.stringify(store[key] ?? [])))])); }
function replaceParticipant(participants, name, overrides) { return participants.map((item) =>
  item.name === name ? { ...item, ...overrides } : item); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
