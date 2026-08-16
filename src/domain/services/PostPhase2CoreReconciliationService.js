import { createFounderStoreUnitOfWork } from
  "../../data/repositories/FounderStoreUnitOfWork.js";
import { createPhaseStrategy } from "../models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";

export const POST_PHASE_2_RECONCILIATION_VERSION =
  "post_phase_2_core_reconciliation_v1";
export const PostPhase2ReconciliationOutcome = Object.freeze({
  ELIGIBLE: "eligible",
  ALREADY_RECONCILED: "already_reconciled",
  SUCCESS: "success",
  AUTHORIZATION_REQUIRED: "authorization_required",
  EXPECTED_STATE_MISMATCH: "expected_state_mismatch",
  MIGRATION_CONTROL_UNSAFE: "migration_control_unsafe",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
});

export function createPostPhase2CoreReconciliationService({
  runtimeStorePath,
  liveStore,
  readMigrationControl,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore || typeof readMigrationControl !== "function") {
    throw new Error("Post-Phase-2 reconciliation requires an explicit Founder store and migration-control reader.");
  }
  return Object.freeze({
    async dryRun(command) {
      const scope = normalizeScope(command);
      const control = await readMigrationControl();
      return inspectState(structuredClone(liveStore), control, scope);
    },
    async reconcile(command, { authorization } = {}) {
      const scope = normalizeScope(command);
      if (authorization?.authorized !== true ||
          authorization.scope !== "post_phase_2_core_reconciliation" ||
          authorization.requestId !== scope.requestId) {
        return failure(PostPhase2ReconciliationOutcome.AUTHORIZATION_REQUIRED,
          "Explicit reconciliation authorization bound to this request is required.");
      }
      const control = await readMigrationControl();
      const initial = inspectState(structuredClone(liveStore), control, scope);
      if (initial.outcome === PostPhase2ReconciliationOutcome.ALREADY_RECONCILED) {
        return initial;
      }
      if (initial.outcome !== PostPhase2ReconciliationOutcome.ELIGIBLE) return initial;
      const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now,
        stageFrom: liveStore });
      const transaction = unit.begin();
      try {
        await transaction.mutate(async (store) => {
          const current = inspectState(store, control, scope);
          if (current.outcome !== PostPhase2ReconciliationOutcome.ELIGIBLE) {
            throw new ReconciliationFailure(current.outcome, current.reason);
          }
          applyCorrections(store, scope);
          if (typeof faults.afterApply === "function") await faults.afterApply(store);
        });
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            return inspectState(candidate, control, scope).outcome ===
              PostPhase2ReconciliationOutcome.ALREADY_RECONCILED;
          },
        });
        return Object.freeze({ outcome: PostPhase2ReconciliationOutcome.SUCCESS,
          committed: true, revision: committed.revision, requestId: scope.requestId });
      } catch (error) {
        const typed = findFailure(error);
        if (typed) return failure(typed.outcome, typed.message);
        return failure(error?.code?.includes("REVISION_CONFLICT")
          ? PostPhase2ReconciliationOutcome.CONCURRENCY_CONFLICT
          : PostPhase2ReconciliationOutcome.PERSISTENCE_FAILURE,
        "Post-Phase-2 reconciliation did not commit.");
      }
    },
  });
}

export function inspectPostPhase2Reconciliation({ store, migrationControl, command } = {}) {
  return inspectState(structuredClone(store), migrationControl, normalizeScope(command));
}

function inspectState(store, migrationControl, scope) {
  const control = migrationControl?.state ?? migrationControl;
  if (control?.fenceState !== "inactive" || control?.canonicalStoreEpoch !== "legacy-json" ||
      control?.compositionMode !== "legacy-json" || control?.readsEnabled !== true || control?.writesEnabled !== true ||
      control?.migrationOperationId || control?.firstPostgresWriteAt) {
    return failure(PostPhase2ReconciliationOutcome.MIGRATION_CONTROL_UNSAFE,
      "Migration control is not the expected inactive legacy-JSON state.");
  }
  const goal = one(store.goals, (item) => item.id === scope.goalId);
  const phase1 = goal?.phases?.find((item) => item.id === scope.phase1Id);
  const phase2 = goal?.phases?.find((item) => item.id === scope.phase2Id);
  const decisions = (store.phaseReviewDecisions ?? []).filter((item) => item.goalId === scope.goalId);
  const transactions = (store.phaseReviewTransactions ?? []).filter((item) => item.goalId === scope.goalId);
  const strategies = (store.phaseStrategies ?? []).filter((item) =>
    item.goalId === scope.goalId && item.phaseId === scope.phase2Id && item.status === "accepted");
  const trajectories = (store.phaseExpectedTrajectories ?? []).filter((item) =>
    item.goalId === scope.goalId && item.phaseId === scope.phase2Id && item.status === "accepted");
  const protocol = one(store.protocols, (item) => item.id === scope.energyProtocolId);
  const versions = (store.protocolVersions ?? []).filter((item) => item.protocolId === scope.energyProtocolId);
  const v1 = versions.find((item) => item.id === scope.energyV1Id);
  const v2 = versions.find((item) => item.id === scope.energyV2Id);
  const lifecycle = one(store.phaseLifecycleReadModels,
    (item) => item.goalId === scope.goalId && item.decisionId === scope.decisionId);
  const startingForecasts = (store.confidenceInitializationArtifacts ?? []).filter((item) =>
    item.goalId === scope.goalId && item.phaseId === scope.phase2Id && item.occurrenceId === scope.decisionId);
  const confidence = (store.goalConfidenceHistory ?? []).filter((item) =>
    item.goalId === scope.goalId && item.phaseId === scope.phase2Id);
  const targetMatch = sameTarget(protocol?.effectiveStrategy?.caloricIntakeTarget,
    scope.caloricIntakeTarget) && sameTarget(protocol?.effectiveStrategy?.activityExpenditureTarget,
    scope.activityExpenditureTarget) &&
    sameTarget(v2?.change?.reviewedChanges?.caloricIntakeTarget, scope.caloricIntakeTarget) &&
    sameTarget(v2?.change?.reviewedChanges?.activityExpenditureTarget,
      scope.activityExpenditureTarget);
  const invariant = goal?.status === "active" && goal?.primary === true &&
    goal.currentPhaseId === scope.phase2Id && goal.timeline?.currentPhaseId === scope.phase2Id &&
    phase1?.status === "completed" && phase1.reviewMilestone?.consumed === true &&
    phase1.reviewMilestone?.resolvedReviewId === scope.decisionId &&
    phase2?.status === "active" && decisions.length === 1 &&
    decisions[0]?.decisionId === scope.decisionId && transactions.length === 1 &&
    transactions[0]?.id === scope.transactionId && transactions[0]?.status === "committed" &&
    strategies.length === 1 && strategies[0]?.id === scope.strategyId &&
    trajectories.length === 1 && trajectories[0]?.id === scope.trajectoryId &&
    protocol?.status === "active" && protocol?.currentVersionId === scope.energyV2Id &&
    v2?.status === "active" && !v2?.endedAt && targetMatch && lifecycle &&
    startingForecasts.length === 1 && confidence.length === 1;
  if (!invariant) return failure(PostPhase2ReconciliationOutcome.EXPECTED_STATE_MISMATCH,
    "The characterized Phase 2 transition state differs from the exact reconciliation scope.");

  const already = phase2.startDate === scope.targetStartDate &&
    phase2.startedAt === scope.targetStartDate &&
    goal.timeline.currentPhaseStartedAt === scope.targetStartDate &&
    trajectories[0].timeline?.projectedStart === scope.targetStartDate &&
    protocol.effectiveStrategy?.strategicReviewCadence === "monthly" &&
    protocol.effectiveStrategy?.monitoringCadence === "weekly" &&
    v2.effectiveAt === scope.targetStartDate && v1?.status === "superseded" &&
    v1.endedAt === scope.targetStartDate && v1.supersededByVersionId === scope.energyV2Id &&
    lifecycle.activePhaseStartedAt === scope.targetStartDate;
  if (already && ![scope.expectedStoreRevision, scope.expectedStoreRevision + 1]
    .includes(Number(store?.revision))) {
    return failure(PostPhase2ReconciliationOutcome.CONCURRENCY_CONFLICT,
      "Founder-store revision differs from the authorized reconciliation lineage.");
  }
  if (already) return Object.freeze({ outcome: PostPhase2ReconciliationOutcome.ALREADY_RECONCILED,
    committed: false, requestId: scope.requestId, proposedChanges: [] });

  if (Number(store?.revision) !== scope.expectedStoreRevision) {
    return failure(PostPhase2ReconciliationOutcome.CONCURRENCY_CONFLICT,
      "Founder-store revision differs from the authorized baseline.");
  }
  const eligible = phase2.startDate === scope.currentStartDate &&
    phase2.startedAt === scope.currentStartDate &&
    goal.timeline.currentPhaseStartedAt === scope.currentStartDate &&
    trajectories[0].timeline?.projectedStart === scope.currentStartDate &&
    v2.effectiveAt === scope.currentStartDate && v1?.status === "active" && !v1?.endedAt &&
    v2?.status === "active" && !v2?.endedAt && lifecycle.activePhaseStartedAt === scope.currentStartDate &&
    versions.filter((item) => item.status === "active" && !item.endedAt).length === 2;
  if (!eligible) return failure(PostPhase2ReconciliationOutcome.EXPECTED_STATE_MISMATCH,
    "The Phase 2 start or Energy version lifecycle differs from the characterized pre-reconciliation state.");
  return Object.freeze({ outcome: PostPhase2ReconciliationOutcome.ELIGIBLE,
    committed: false, requestId: scope.requestId, proposedChanges: changes(store, scope) });
}

function applyCorrections(store, scope) {
  const goal = one(store.goals, (item) => item.id === scope.goalId);
  const phase2 = goal.phases.find((item) => item.id === scope.phase2Id);
  phase2.startDate = scope.targetStartDate;
  phase2.startedAt = scope.targetStartDate;
  phase2.strategicReviewCadence = "monthly";
  phase2.strategicReviewAnchor = "dexa_body_composition";
  phase2.monitoringCadence = "weekly";
  phase2.automaticStrategyAdjustmentAllowed = false;
  goal.timeline.currentPhaseStartedAt = scope.targetStartDate;

  const strategyIndex = store.phaseStrategies.findIndex((item) => item.id === scope.strategyId);
  const strategy = structuredClone(store.phaseStrategies[strategyIndex]);
  strategy.domains.energy = { ...strategy.domains.energy,
    adjustmentLogic: "reviewed_changes_only", monitoringCadence: "weekly",
    strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition",
    adjustmentAuthorization: "user_required", automaticAdjustmentAllowed: false };
  store.phaseStrategies[strategyIndex] = structuredClone(createPhaseStrategy(strategy));

  const trajectoryIndex = store.phaseExpectedTrajectories.findIndex((item) =>
    item.id === scope.trajectoryId);
  const trajectory = structuredClone(store.phaseExpectedTrajectories[trajectoryIndex]);
  trajectory.timeline = { ...trajectory.timeline, projectedStartRule: "review_milestone_boundary",
    projectedStart: scope.targetStartDate, strategicReviewCadence: "monthly",
    strategicReviewAnchor: "dexa_body_composition" };
  const firstReview = trajectory.milestones?.find((item) =>
    item.type === "first_phase_cadence_review");
  if (firstReview) firstReview.expectedTiming = { mode: "strategic_review_cadence",
    cadence: "monthly", anchor: "dexa_body_composition" };
  store.phaseExpectedTrajectories[trajectoryIndex] = structuredClone(
    createPhaseExpectedTrajectory(trajectory));

  const protocol = one(store.protocols, (item) => item.id === scope.energyProtocolId);
  protocol.effectiveStrategy = cadence(protocol.effectiveStrategy);
  const v1 = one(store.protocolVersions, (item) => item.id === scope.energyV1Id);
  const v2 = one(store.protocolVersions, (item) => item.id === scope.energyV2Id);
  v1.status = "superseded";
  v1.endedAt = scope.targetStartDate;
  v1.supersededByVersionId = scope.energyV2Id;
  v2.effectiveAt = scope.targetStartDate;
  v2.change.reviewedChanges = cadence(v2.change.reviewedChanges);

  const lifecycle = one(store.phaseLifecycleReadModels, (item) =>
    item.goalId === scope.goalId && item.decisionId === scope.decisionId);
  lifecycle.activePhaseStartedAt = scope.targetStartDate;
  lifecycle.monitoringCadence = "weekly";
  lifecycle.strategicReviewCadence = "monthly";
  lifecycle.strategicReviewAnchor = "dexa_body_composition";
}

function cadence(value) {
  return { ...structuredClone(value), evaluationCadence: "monthly",
    monitoringCadence: "weekly", strategicReviewCadence: "monthly",
    strategicReviewAnchor: "dexa_body_composition",
    adjustmentMethod: "user_authorized_reviewed_changes",
    automaticAdjustmentAllowed: false, adjustmentAuthorization: "user_required" };
}

function changes(store, scope) {
  const before = reconciliationRecords(store, scope);
  const corrected = structuredClone(store);
  applyCorrections(corrected, scope);
  const after = reconciliationRecords(corrected, scope);
  const candidates = [
    candidate("goal.phase.startDate", before.phase2.startDate, after.phase2.startDate),
    candidate("goal.phase.startedAt", before.phase2.startedAt, after.phase2.startedAt),
    candidate("goal.phase.monitoringCadence", before.phase2.monitoringCadence, after.phase2.monitoringCadence),
    candidate("goal.phase.strategicReviewCadence", before.phase2.strategicReviewCadence, after.phase2.strategicReviewCadence),
    candidate("goal.phase.strategicReviewAnchor", before.phase2.strategicReviewAnchor, after.phase2.strategicReviewAnchor),
    candidate("goal.phase.automaticStrategyAdjustmentAllowed",
      before.phase2.automaticStrategyAdjustmentAllowed,
      after.phase2.automaticStrategyAdjustmentAllowed),
    candidate("goal.timeline.currentPhaseStartedAt",
      before.goal.timeline.currentPhaseStartedAt, after.goal.timeline.currentPhaseStartedAt),
    candidate("phaseStrategy.domains.energy.adjustmentLogic",
      before.strategy.domains.energy.adjustmentLogic, after.strategy.domains.energy.adjustmentLogic),
    candidate("phaseStrategy.domains.energy.monitoringCadence",
      before.strategy.domains.energy.monitoringCadence, after.strategy.domains.energy.monitoringCadence),
    candidate("phaseStrategy.domains.energy.strategicReviewCadence",
      before.strategy.domains.energy.strategicReviewCadence,
      after.strategy.domains.energy.strategicReviewCadence),
    candidate("phaseStrategy.domains.energy.strategicReviewAnchor",
      before.strategy.domains.energy.strategicReviewAnchor,
      after.strategy.domains.energy.strategicReviewAnchor),
    candidate("phaseStrategy.domains.energy.adjustmentAuthorization",
      before.strategy.domains.energy.adjustmentAuthorization,
      after.strategy.domains.energy.adjustmentAuthorization),
    candidate("phaseStrategy.domains.energy.automaticAdjustmentAllowed",
      before.strategy.domains.energy.automaticAdjustmentAllowed,
      after.strategy.domains.energy.automaticAdjustmentAllowed),
    candidate("phaseStrategy.contentFingerprint",
      before.strategy.contentFingerprint, after.strategy.contentFingerprint),
    candidate("phaseExpectedTrajectory.timeline.projectedStartRule",
      before.trajectory.timeline.projectedStartRule, after.trajectory.timeline.projectedStartRule),
    candidate("phaseExpectedTrajectory.timeline.projectedStart",
      before.trajectory.timeline.projectedStart, after.trajectory.timeline.projectedStart),
    candidate("phaseExpectedTrajectory.timeline.strategicReviewCadence",
      before.trajectory.timeline.strategicReviewCadence,
      after.trajectory.timeline.strategicReviewCadence),
    candidate("phaseExpectedTrajectory.timeline.strategicReviewAnchor",
      before.trajectory.timeline.strategicReviewAnchor, after.trajectory.timeline.strategicReviewAnchor),
    candidate("phaseExpectedTrajectory.firstCadenceReview.expectedTiming",
      before.firstReview.expectedTiming, after.firstReview.expectedTiming),
    candidate("phaseExpectedTrajectory.contentFingerprint",
      before.trajectory.contentFingerprint, after.trajectory.contentFingerprint),
    ...cadenceCandidates("protocol.effectiveStrategy",
      before.protocol.effectiveStrategy, after.protocol.effectiveStrategy),
    candidate("protocolVersion.v1.status", before.v1.status, after.v1.status),
    candidate("protocolVersion.v1.endedAt", before.v1.endedAt, after.v1.endedAt),
    candidate("protocolVersion.v1.supersededByVersionId",
      before.v1.supersededByVersionId, after.v1.supersededByVersionId),
    candidate("protocolVersion.v2.effectiveAt", before.v2.effectiveAt, after.v2.effectiveAt),
    ...cadenceCandidates("protocolVersion.v2.change.reviewedChanges",
      before.v2.change.reviewedChanges, after.v2.change.reviewedChanges),
    candidate("phaseLifecycle.activePhaseStartedAt",
      before.lifecycle.activePhaseStartedAt, after.lifecycle.activePhaseStartedAt),
    candidate("phaseLifecycle.monitoringCadence",
      before.lifecycle.monitoringCadence, after.lifecycle.monitoringCadence),
    candidate("phaseLifecycle.strategicReviewCadence",
      before.lifecycle.strategicReviewCadence, after.lifecycle.strategicReviewCadence),
    candidate("phaseLifecycle.strategicReviewAnchor",
      before.lifecycle.strategicReviewAnchor, after.lifecycle.strategicReviewAnchor),
  ];
  return Object.freeze(candidates.filter((item) => !same(item.before, item.after))
    .map((item) => change(item.path, item.before, item.after)));
}

function reconciliationRecords(store, scope) {
  const goal = one(store.goals, (item) => item.id === scope.goalId);
  const trajectory = one(store.phaseExpectedTrajectories,
    (item) => item.id === scope.trajectoryId);
  return {
    goal,
    phase2: goal.phases.find((item) => item.id === scope.phase2Id),
    strategy: one(store.phaseStrategies, (item) => item.id === scope.strategyId),
    trajectory,
    firstReview: trajectory.milestones.find((item) =>
      item.type === "first_phase_cadence_review"),
    protocol: one(store.protocols, (item) => item.id === scope.energyProtocolId),
    v1: one(store.protocolVersions, (item) => item.id === scope.energyV1Id),
    v2: one(store.protocolVersions, (item) => item.id === scope.energyV2Id),
    lifecycle: one(store.phaseLifecycleReadModels, (item) =>
      item.goalId === scope.goalId && item.decisionId === scope.decisionId),
  };
}

function cadenceCandidates(prefix, before, after) {
  return ["evaluationCadence", "monitoringCadence", "strategicReviewCadence",
    "strategicReviewAnchor", "adjustmentMethod", "automaticAdjustmentAllowed",
    "adjustmentAuthorization"].map((field) =>
    candidate(prefix + "." + field, before?.[field], after?.[field]));
}

function candidate(path, before, after) {
  return { path, before: structuredClone(before), after: structuredClone(after) };
}


function normalizeScope(command = {}) {
  const scope = { requestId: required(command.requestId, "requestId"),
    expectedStoreRevision: integer(command.expectedStoreRevision, "expectedStoreRevision"),
    goalId: required(command.goalId, "goalId"), phase1Id: required(command.phase1Id, "phase1Id"),
    phase2Id: required(command.phase2Id, "phase2Id"), decisionId: required(command.decisionId, "decisionId"),
    transactionId: required(command.transactionId, "transactionId"),
    strategyId: required(command.strategyId, "strategyId"), trajectoryId: required(command.trajectoryId, "trajectoryId"),
    energyProtocolId: required(command.energyProtocolId, "energyProtocolId"),
    energyV1Id: required(command.energyV1Id, "energyV1Id"), energyV2Id: required(command.energyV2Id, "energyV2Id"),
    currentStartDate: date(command.currentStartDate, "currentStartDate"),
    targetStartDate: date(command.targetStartDate, "targetStartDate"),
    caloricIntakeTarget: target(command.caloricIntakeTarget, "caloricIntakeTarget"),
    activityExpenditureTarget: target(command.activityExpenditureTarget, "activityExpenditureTarget") };
  if (scope.currentStartDate === scope.targetStartDate) throw new Error("Reconciliation dates must differ.");
  return Object.freeze(scope);
}
function sameTarget(left, right) { return Number(left?.value) === right.value && left?.unit === right.unit; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function target(value, field) { const amount = Number(value?.value ?? value); const unit = value?.unit ?? "kcal/day"; if (!Number.isInteger(amount) || unit !== "kcal/day") throw new Error(`${field} must be a whole-number kcal/day target.`); return { value: amount, unit }; }
function required(value, field) { const text = String(value ?? "").trim(); if (!text) throw new Error(`${field} is required.`); return text; }
function integer(value, field) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative integer.`); return parsed; }
function date(value, field) { const text = String(value ?? ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00.000Z`).toISOString().slice(0, 10) !== text) throw new Error(`${field} must be YYYY-MM-DD.`); return text; }
function one(records = [], predicate) { const matches = records.filter(predicate); return matches.length === 1 ? matches[0] : null; }
function change(path, before, after) { return Object.freeze({ path, before, after }); }
function failure(outcome, reason) { return Object.freeze({ outcome, committed: false, reason, proposedChanges: [] }); }
function findFailure(error) { let current = error; while (current) { if (current instanceof ReconciliationFailure) return current; current = current.cause; } return null; }
class ReconciliationFailure extends Error { constructor(outcome, message) { super(message); this.name = "PostPhase2ReconciliationFailure"; this.outcome = outcome; } }
