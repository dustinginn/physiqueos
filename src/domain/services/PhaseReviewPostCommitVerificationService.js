import { createHash } from "node:crypto";

export const PHASE_REVIEW_POST_COMMIT_VERIFICATION_VERSION =
  "phase_review_post_commit_verification_v1";

const PROTECTED = Object.freeze(["dailyBriefings",
  "canonicalEvidenceObjects", "evidencePackages", "dexaScans", "progressPhotos"]);

export function verifyPhaseReviewPostCommit({ before, after, decision, result } = {}) {
  const replay = result?.idempotent === true;
  const expectedRevision = replay ? Number(before.revision ?? 0) : Number(before.revision ?? 0) + 1;
  const failures = [];
  check(Number(after?.revision ?? 0) === expectedRevision, "STORE_REVISION_INVALID");
  for (const key of PROTECTED) check(same(before[key] ?? [], after[key] ?? []), `${key.toUpperCase()}_REWRITTEN`);
  const goal = after.goals?.find((item) => item.id === decision.goalId);
  const current = goal?.phases?.find((item) => item.id === decision.currentPhaseId);
  const next = goal?.phases?.find((item) => item.id === decision.nextPhaseId);
  const decisions = (after.phaseReviewDecisions ?? []).filter((item) =>
    item.decisionId === decision.decisionId && item.idempotencyKey === decision.idempotencyKey);
  const transactions = (after.phaseReviewTransactions ?? []).filter((item) =>
    item.decisionId === decision.decisionId && item.idempotencyKey === decision.idempotencyKey);
  const readModel = (after.phaseLifecycleReadModels ?? []).find((item) =>
    item.goalId === decision.goalId && item.decisionId === decision.decisionId);
  check(Boolean(goal && current && next), "GOAL_PHASE_STATE_MISSING");
  check(decisions.length === 1, "DECISION_MISSING");
  check(transactions.length === 1 && transactions[0].status === "committed", "TRANSACTION_MISSING");
  check(Boolean(readModel), "LIFECYCLE_READ_MODEL_MISSING");
  if (decision.selectedOutcome === "begin_next_phase") {
    check(current?.status === "completed", "CURRENT_PHASE_NOT_COMPLETED");
    check(next?.status === "active", "NEXT_PHASE_NOT_ACTIVE");
    check(goal?.currentPhaseId === next?.id, "GOAL_PHASE_POINTER_INVALID");
    const strategy = after.phaseStrategies?.find((item) => item.id === goal?.activePhaseStrategyId);
    const trajectory = after.phaseExpectedTrajectories?.find((item) =>
      item.id === goal?.activeExpectedTrajectoryId);
    check(strategy?.status === "accepted" && strategy?.phaseId === next?.id,
      "STRATEGY_POINTER_INVALID");
    check(trajectory?.status === "accepted" && trajectory?.phaseId === next?.id,
      "TRAJECTORY_POINTER_INVALID");
    check((after.confidenceInitializationArtifacts ?? []).some((item) =>
      item.occurrenceId === decision.decisionId && item.phaseId === next?.id),
    "STARTING_FORECAST_MISSING");
    check(!decision.phaseEstablishment || (after.protocolVersions ?? []).some((item) =>
      item.confirmation?.decisionId === decision.decisionId && item.phaseId === next?.id &&
      same(item.change?.reviewedChanges?.caloricIntakeTarget,
        decision.phaseEstablishment?.executionTargets?.caloricIntake) &&
      same(item.change?.reviewedChanges?.activityExpenditureTarget,
        decision.phaseEstablishment?.executionTargets?.activityExpenditure)),
    "PHASE_EXECUTION_TARGETS_MISSING");
    check((before.phaseStrategies ?? []).every((item, index) =>
      same(item, after.phaseStrategies?.[index])), "PRIOR_STRATEGY_HISTORY_CHANGED");
    check((before.phaseExpectedTrajectories ?? []).every((item, index) =>
      same(item, after.phaseExpectedTrajectories?.[index])), "PRIOR_TRAJECTORY_HISTORY_CHANGED");
  } else {
    check(current?.status === "active", "CURRENT_PHASE_NOT_ACTIVE");
    check(current?.plannedReviewAt === decision.selectedReviewAt, "EXTENSION_DATE_INVALID");
    check((current?.originalPlannedReviewAt ?? current?.reviewMilestone?.originatingMilestoneAt) ===
      decision.originalPlannedReviewAt, "ORIGINAL_REVIEW_MILESTONE_LOST");
    check(Number(current?.extensionCount ?? 0) >= 1, "EXTENSION_COUNT_INVALID");
    check(next?.status === "planned" && next?.projectedNextPhaseStart === decision.selectedReviewAt,
      "NEXT_PHASE_PROJECTION_INVALID");
    check(same(before.goalConfidenceHistory ?? [], after.goalConfidenceHistory ?? []),
      "CONFIDENCE_HISTORY_CHANGED_ON_EXTENSION");
    check(same(before.confidenceInitializationArtifacts ?? [],
      after.confidenceInitializationArtifacts ?? []), "STARTING_FORECAST_CREATED_ON_EXTENSION");
    check(same(before.phaseStrategies ?? [], after.phaseStrategies ?? []), "STRATEGY_CHANGED_ON_EXTENSION");
    check(same(before.phaseExpectedTrajectories ?? [], after.phaseExpectedTrajectories ?? []),
      "TRAJECTORY_CHANGED_ON_EXTENSION");
    check(same(before.protocols ?? [], after.protocols ?? []) &&
      same(before.protocolVersions ?? [], after.protocolVersions ?? []),
    "EXECUTION_TARGETS_CHANGED_ON_EXTENSION");
  }
  if (failures.length) {
    const error = new Error(`Critical Phase Review post-commit verification failed: ${failures.join(", ")}.`);
    error.name = "PhaseReviewPostCommitVerificationError";
    error.code = "PHASE_REVIEW_POST_COMMIT_VERIFICATION_FAILED";
    error.committed = result?.committed === true;
    error.failures = Object.freeze(failures);
    throw error;
  }
  return Object.freeze({ version: PHASE_REVIEW_POST_COMMIT_VERIFICATION_VERSION,
    verified: true, replay, startingRevision: Number(before.revision ?? 0),
    endingRevision: Number(after.revision ?? 0),
    protectedFingerprint: fingerprint(Object.fromEntries(PROTECTED.map((key) =>
      [key, after[key] ?? []]))) });

  function check(condition, code) { if (!condition) failures.push(code); }
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function fingerprint(value) { return `sha256_${createHash("sha256")
  .update(JSON.stringify(value)).digest("hex")}`; }
