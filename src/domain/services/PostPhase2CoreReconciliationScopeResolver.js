import { resolvePhaseTransitionDate } from "./PhaseTransitionDatePolicy";

export const POST_PHASE_2_SCOPE_RESOLVER_VERSION =
  "post_phase_2_core_reconciliation_scope_resolver_v1";

export class PostPhase2ScopeResolutionError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = "PostPhase2ScopeResolutionError";
    this.code = code;
    this.diagnostics = Object.freeze({ ...diagnostics });
  }
}

// Resolves the exact PostPhase2CoreReconciliationService command scope from trusted,
// already-persisted canonical relationships. Never accepts operator-supplied record IDs
// and never derives identity by parsing an ID string; every field is read from a record's
// own fields, and every selection is required to be unique or the resolution fails closed.
export function resolvePostPhase2CoreReconciliationScope({ store, now = () => new Date() } = {}) {
  if (!store || typeof store !== "object") {
    throw fail("STORE_REQUIRED", "A Founder store snapshot is required to resolve scope.");
  }
  const expectedStoreRevision = Number(store.revision);
  if (!Number.isSafeInteger(expectedStoreRevision) || expectedStoreRevision < 0) {
    throw fail("STORE_REVISION_UNREADABLE", "The Founder store revision could not be read.");
  }

  const goal = one(store.goals, (item) => item.status === "active" && item.primary === true,
    "GOAL", "primary active goal");

  const phase2 = one(goal.phases, (item) => item.id === goal.currentPhaseId,
    "PHASE2", "phase referenced by the goal's current-phase pointer");
  if (phase2.status !== "active") {
    throw fail("PHASE2_NOT_ACTIVE", "The goal's current phase is not active.", { phaseId: phase2.id });
  }
  if (goal.timeline?.currentPhaseId !== phase2.id) {
    throw fail("PHASE2_TIMELINE_MISMATCH",
      "The goal timeline's current-phase pointer disagrees with the goal's current-phase pointer.");
  }

  const decision = one(store.phaseReviewDecisions,
    (item) => item.goalId === goal.id && item.nextPhaseId === phase2.id,
    "DECISION", "committed Phase Review decision authorizing this phase's activation");

  const phase1 = one(goal.phases, (item) => item.id === decision.currentPhaseId,
    "PHASE1", "phase referenced by the decision's prior-phase pointer");
  if (phase1.status !== "completed") {
    throw fail("PHASE1_NOT_COMPLETED", "The decision's prior phase is not completed.",
      { phaseId: phase1.id });
  }
  if (phase1.reviewMilestone?.consumed !== true ||
      phase1.reviewMilestone?.resolvedReviewId !== decision.decisionId) {
    throw fail("PHASE1_MILESTONE_NOT_CONSUMED",
      "The prior phase's review milestone is not recorded as consumed by this decision.");
  }

  const transaction = one(store.phaseReviewTransactions,
    (item) => item.goalId === goal.id && item.decisionId === decision.decisionId,
    "TRANSACTION", "Phase Review transaction for this decision");
  if (transaction.status !== "committed") {
    throw fail("TRANSACTION_NOT_COMMITTED", "The Phase Review transaction for this decision is not committed.",
      { transactionId: transaction.id, status: transaction.status });
  }

  const strategy = one(store.phaseStrategies,
    (item) => item.goalId === goal.id && item.phaseId === phase2.id && item.status === "accepted",
    "STRATEGY", "accepted Phase 2 strategy");

  const trajectory = one(store.phaseExpectedTrajectories,
    (item) => item.goalId === goal.id && item.phaseId === phase2.id && item.status === "accepted",
    "TRAJECTORY", "accepted Phase 2 expected trajectory");

  const protocol = one(store.protocols,
    (item) => item.status === "active" && item.effectiveStrategy?.phaseId === phase2.id &&
      item.effectiveStrategy?.phaseStrategyId === strategy.id,
    "ENERGY_PROTOCOL", "active protocol bound to this phase's accepted strategy");
  const caloricIntakeTarget = requireTarget(protocol.effectiveStrategy?.caloricIntakeTarget,
    "ENERGY_PROTOCOL_CALORIC_TARGET", "protocol effective-strategy caloric intake target");
  const activityExpenditureTarget = requireTarget(protocol.effectiveStrategy?.activityExpenditureTarget,
    "ENERGY_PROTOCOL_ACTIVITY_TARGET", "protocol effective-strategy activity expenditure target");

  const energyV2 = one(store.protocolVersions,
    (item) => item.protocolId === protocol.id && item.id === protocol.currentVersionId,
    "ENERGY_V2", "protocol version referenced by the protocol's current-version pointer");
  const activeVersions = (store.protocolVersions ?? []).filter((item) =>
    item.protocolId === protocol.id && item.status === "active" && !item.endedAt);
  if (activeVersions.length !== 2) {
    throw fail("ENERGY_VERSION_LIFECYCLE_UNEXPECTED",
      `Expected exactly two active protocol versions pre-reconciliation, found ${activeVersions.length}.`,
      { protocolId: protocol.id, activeCount: activeVersions.length });
  }
  const energyV1 = one(activeVersions, (item) => item.id !== energyV2.id,
    "ENERGY_V1", "the other active protocol version besides the current pointer");

  const v2Targets = energyV2.change?.reviewedChanges ?? {};
  if (!sameTarget(v2Targets.caloricIntakeTarget, caloricIntakeTarget) ||
      !sameTarget(v2Targets.activityExpenditureTarget, activityExpenditureTarget)) {
    throw fail("TARGET_CONTRADICTION_ENERGY_V2",
      "Energy v2's reviewed-change targets disagree with the protocol's effective-strategy targets.");
  }
  const establishedTargets = decision.phaseEstablishment?.executionTargets ?? {};
  if (!sameTarget(establishedTargets.caloricIntake, caloricIntakeTarget) ||
      !sameTarget(establishedTargets.activityExpenditure, activityExpenditureTarget)) {
    throw fail("TARGET_CONTRADICTION_PHASE_ESTABLISHMENT",
      "The decision's authorized execution targets disagree with the protocol's effective-strategy targets.");
  }

  const currentStartDate = phase2.startDate;
  if (phase2.startedAt !== currentStartDate || goal.timeline?.currentPhaseStartedAt !== currentStartDate) {
    throw fail("CURRENT_START_DATE_CONTRADICTION",
      "Phase 2 start-date fields disagree across the goal, phase, and timeline records.");
  }

  const targetStartDate = resolvePhaseTransitionDate({
    reviewMilestoneDate: phase1.reviewMilestone?.earliestEligibleDate,
  }).effectiveDate;
  if (targetStartDate === currentStartDate) {
    throw fail("TARGET_START_DATE_MATCHES_CURRENT",
      "The resolved target start date matches the current start date; there is nothing to reconcile.");
  }

  const requestId = `post_phase_2_core_reconciliation|${decision.decisionId}|${now().toISOString()}`;

  const command = Object.freeze({
    requestId,
    expectedStoreRevision,
    goalId: goal.id,
    phase1Id: phase1.id,
    phase2Id: phase2.id,
    decisionId: decision.decisionId,
    transactionId: transaction.id,
    strategyId: strategy.id,
    trajectoryId: trajectory.id,
    energyProtocolId: protocol.id,
    energyV1Id: energyV1.id,
    energyV2Id: energyV2.id,
    currentStartDate,
    targetStartDate,
    caloricIntakeTarget,
    activityExpenditureTarget,
  });

  const startingForecasts = (store.confidenceInitializationArtifacts ?? []).filter((item) =>
    item.goalId === goal.id && item.phaseId === phase2.id && item.occurrenceId === decision.decisionId);
  const confidenceEntries = (store.goalConfidenceHistory ?? []).filter((item) =>
    item.goalId === goal.id && item.phaseId === phase2.id);

  const preflight = Object.freeze({
    schemaVersion: POST_PHASE_2_SCOPE_RESOLVER_VERSION,
    resolvedAt: now().toISOString(),
    goal: { id: goal.id, status: goal.status, primary: goal.primary, currentPhaseId: goal.currentPhaseId },
    phase1: { id: phase1.id, name: phase1.name ?? null, status: phase1.status,
      reviewMilestoneConsumed: phase1.reviewMilestone?.consumed === true,
      reviewMilestoneDate: phase1.reviewMilestone?.earliestEligibleDate ?? null },
    phase2: { id: phase2.id, name: phase2.name ?? null, status: phase2.status,
      currentStartDate },
    resolvedTargetStartDate: targetStartDate,
    decision: { id: decision.decisionId, selectedOutcome: decision.selectedOutcome ?? null },
    transaction: { id: transaction.id, status: transaction.status },
    authorizationConsumed: phase1.reviewMilestone?.consumed === true &&
      phase1.reviewMilestone?.resolvedReviewId === decision.decisionId,
    strategy: { id: strategy.id, status: strategy.status },
    trajectory: { id: trajectory.id, status: trajectory.status },
    energyProtocol: { id: protocol.id, status: protocol.status, currentVersionId: protocol.currentVersionId },
    energyV1: { id: energyV1.id, status: energyV1.status, endedAt: energyV1.endedAt ?? null },
    energyV2: { id: energyV2.id, status: energyV2.status, isCurrentPointer: protocol.currentVersionId === energyV2.id },
    authorizedTargets: { caloricIntakeTarget, activityExpenditureTarget },
    startingForecast: { count: startingForecasts.length,
      id: startingForecasts.length === 1 ? startingForecasts[0].id : null },
    confidenceInitialization: { count: confidenceEntries.length,
      id: confidenceEntries.length === 1 ? confidenceEntries[0].id : null },
  });

  return Object.freeze({ command, preflight });
}

function one(records, predicate, code, label) {
  const matches = (records ?? []).filter(predicate);
  if (matches.length !== 1) {
    throw fail(`${code}_${matches.length === 0 ? "MISSING" : "AMBIGUOUS"}`,
      `Expected exactly one ${label}, found ${matches.length}.`, { count: matches.length });
  }
  return matches[0];
}

function requireTarget(value, code, label) {
  const amount = Number(value?.value);
  if (!Number.isInteger(amount) || value?.unit !== "kcal/day") {
    throw fail(`${code}_UNREADABLE`, `Could not read a whole-number kcal/day ${label}.`);
  }
  return Object.freeze({ value: amount, unit: "kcal/day" });
}

function sameTarget(left, right) {
  return Number(left?.value) === Number(right?.value) && left?.unit === right?.unit &&
    Number.isFinite(Number(left?.value));
}

function fail(code, message, diagnostics) {
  return new PostPhase2ScopeResolutionError(code, message, diagnostics);
}
