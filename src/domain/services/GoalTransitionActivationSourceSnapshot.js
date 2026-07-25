import {
  LEGACY_FOUNDER_STORE_REVISION,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  GoalTransitionActivationPlanVersion,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import {
  GoalTransitionActivationCoordinatorResultContract,
  GoalTransitionActivationCoordinatorStateModel,
  GoalTransitionActivationDispatchRegistry,
  GoalTransitionActivationInvariantRegistry,
  validateGoalTransitionActivationCoordinatorCompatibility,
} from "./GoalTransitionActivationCoordinatorContract";
import {
  ActivationStagedRepositoryContract,
} from "../../data/repositories/ActivationStagedRepositoryFactory";
import { validateGoalTransitionActivation } from "./GoalTransitionActivationValidator";
import {
  GoalTransitionActivationCanonicalizationVersion,
  activationFingerprint,
  canonicalActivationClone,
  deepFreezeActivationValue,
  isDeeplyFrozenActivationValue,
} from "./GoalTransitionActivationCanonicalization";

export const GoalTransitionActivationSourceSnapshotVersion =
  "goal_transition_activation_source_snapshot_v1";

export const GoalTransitionActivationSourceSnapshotCode = Object.freeze({
  INPUT_REQUIRED: "ACTIVATION_SOURCE_SNAPSHOT_INPUT_REQUIRED",
  VALIDATOR_RESULT_REQUIRED: "ACTIVATION_SOURCE_SNAPSHOT_VALIDATOR_RESULT_REQUIRED",
  PLAN_REQUIRED: "ACTIVATION_SOURCE_SNAPSHOT_PLAN_REQUIRED",
  COORDINATOR_COMPATIBILITY_REQUIRED:
    "ACTIVATION_SOURCE_SNAPSHOT_COORDINATOR_COMPATIBILITY_REQUIRED",
  REVISION_INVALID: "ACTIVATION_SOURCE_SNAPSHOT_REVISION_INVALID",
  REVISION_CONFLICT: "ACTIVATION_SOURCE_SNAPSHOT_REVISION_CONFLICT",
  LIVE_PERSISTED_REVISION_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_LIVE_PERSISTED_REVISION_MISMATCH",
  TRANSITION_IDENTITY_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_TRANSITION_IDENTITY_MISMATCH",
  GOAL_DRAFT_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_GOAL_DRAFT_MISMATCH",
  PROTOCOL_DRAFT_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_PROTOCOL_DRAFT_MISMATCH",
  ACTIVE_GOAL_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_ACTIVE_GOAL_MISMATCH",
  HISTORICAL_PROTOCOL_OWNERSHIP_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_HISTORICAL_PROTOCOL_OWNERSHIP_MISMATCH",
  COMMITMENT_SOURCE_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_COMMITMENT_SOURCE_MISMATCH",
  SCHEDULER_SOURCE_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_SCHEDULER_SOURCE_MISMATCH",
  EVIDENCE_RELATIONSHIP_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_EVIDENCE_RELATIONSHIP_MISMATCH",
  COMPLETION_RECOMMENDATION_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_COMPLETION_RECOMMENDATION_MISMATCH",
  CADENCE_SOURCE_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_CADENCE_SOURCE_MISMATCH",
  COMPLETE_FINGERPRINT_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_COMPLETE_FINGERPRINT_MISMATCH",
  PLAN_ID_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_PLAN_ID_MISMATCH",
  PLAN_FINGERPRINT_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_PLAN_FINGERPRINT_MISMATCH",
  PLAN_REVISION_MISMATCH: "ACTIVATION_SOURCE_SNAPSHOT_PLAN_REVISION_MISMATCH",
  EXPECTED_WRITE_COUNTS_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_EXPECTED_WRITE_COUNTS_MISMATCH",
  FUTURE_PROTOCOL_PLAN_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_FUTURE_PROTOCOL_PLAN_MISMATCH",
  COMPATIBILITY_FINGERPRINT_MISMATCH:
    "ACTIVATION_SOURCE_SNAPSHOT_COMPATIBILITY_FINGERPRINT_MISMATCH",
  ARTIFACT_VERSION_UNSUPPORTED:
    "ACTIVATION_SOURCE_SNAPSHOT_ARTIFACT_VERSION_UNSUPPORTED",
  TRANSITION_ALREADY_CONSUMED:
    "ACTIVATION_SOURCE_SNAPSHOT_TRANSITION_ALREADY_CONSUMED",
  TARGET_GOAL_CONFLICT: "ACTIVATION_SOURCE_SNAPSHOT_TARGET_GOAL_CONFLICT",
  SOURCE_GOAL_STATE_CHANGED:
    "ACTIVATION_SOURCE_SNAPSHOT_SOURCE_GOAL_STATE_CHANGED",
  PERSISTED_STATE_UNREADABLE:
    "ACTIVATION_SOURCE_SNAPSHOT_PERSISTED_STATE_UNREADABLE",
  LIVE_STATE_UNREADABLE: "ACTIVATION_SOURCE_SNAPSHOT_LIVE_STATE_UNREADABLE",
  CANONICALIZATION_FAILED:
    "ACTIVATION_SOURCE_SNAPSHOT_CANONICALIZATION_FAILED",
  EXECUTOR_UNAVAILABLE: "ACTIVATION_SOURCE_SNAPSHOT_EXECUTOR_UNAVAILABLE",
  PRODUCTION_BOUNDARY_UNAVAILABLE:
    "ACTIVATION_SOURCE_SNAPSHOT_PRODUCTION_BOUNDARY_UNAVAILABLE",
});

export const GoalTransitionActivationSourceSnapshotWarningCode = Object.freeze({
  LEGACY_REVISION_NORMALIZED: "ACTIVATION_SOURCE_SNAPSHOT_LEGACY_REVISION_NORMALIZED",
  LEGACY_TOKEN_DIAGNOSTIC: "ACTIVATION_SOURCE_SNAPSHOT_LEGACY_TOKEN_DIAGNOSTIC",
  CROSS_PROCESS_LOCKING_UNAVAILABLE:
    "ACTIVATION_SOURCE_SNAPSHOT_CROSS_PROCESS_LOCKING_UNAVAILABLE",
  EXTERNAL_EXECUTOR_UNAVAILABLE:
    "ACTIVATION_SOURCE_SNAPSHOT_EXTERNAL_EXECUTOR_UNAVAILABLE",
  PRODUCTION_BOUNDARY_UNAVAILABLE:
    "ACTIVATION_SOURCE_SNAPSHOT_PRODUCTION_BOUNDARY_UNAVAILABLE",
  UI_RECONCILIATION_DEFERRED:
    "ACTIVATION_SOURCE_SNAPSHOT_UI_RECONCILIATION_DEFERRED",
  BRIEFING_POLICY_DEFERRED:
    "ACTIVATION_SOURCE_SNAPSHOT_BRIEFING_POLICY_DEFERRED",
});

export const GoalTransitionActivationPreExecutionRequirements = deepFreezeActivationValue([
  "normalized_revision_matches_plan",
  "live_and_persisted_revisions_match",
  "transition_identity_matches",
  "goal_draft_accepted_unconsumed_and_fingerprint_matches",
  "protocol_draft_accepted_unconsumed_and_fingerprint_matches",
  "active_goal_fingerprint_matches",
  "historical_protocol_ownership_fingerprint_matches",
  "commitment_source_fingerprint_matches",
  "scheduler_source_fingerprint_matches",
  "evidence_relationship_fingerprint_matches",
  "complete_activation_critical_fingerprint_matches",
  "plan_fingerprint_matches",
  "coordinator_compatibility_fingerprint_matches",
  "source_goal_is_sole_active_primary",
  "target_goal_has_no_production_conflict",
  "transition_has_not_already_committed",
]);

export const GoalTransitionActivationPreCommitRequirements = deepFreezeActivationValue([
  "persisted_revision_still_matches_original_expected_revision",
  "live_committed_revision_still_matches_original_expected_revision",
  "no_new_committed_commit_id",
  "accepted_transition_drafts_unchanged_outside_staging",
  "transition_unconsumed_outside_staging",
  "plan_fingerprint_unchanged",
  "coordinator_compatibility_fingerprint_unchanged",
  "activation_critical_live_source_unchanged",
  "transaction_bound_to_original_expected_revision",
  "unit_of_work_compare_and_swap_is_final_authority",
]);

export class GoalTransitionActivationSourceSnapshotError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "GoalTransitionActivationSourceSnapshotError";
    this.code = code;
  }
}

export async function captureGoalTransitionActivationSourceSnapshot({
  readLiveStore,
  readPersistedStore,
  validatorResult,
  plan,
  coordinatorCompatibility,
  sourceIdentity = null,
  capturedAt = null,
  availability = {},
} = {}) {
  assertInputs({
    readLiveStore,
    readPersistedStore,
    validatorResult,
    plan,
    coordinatorCompatibility,
  });
  assertArtifactVersions({ validatorResult, plan, coordinatorCompatibility });

  const liveStore = await controlledRead(
    readLiveStore,
    "LIVE_STATE_UNREADABLE",
    "Live founder state could not be read."
  );
  const persistedStore = await controlledRead(
    readPersistedStore,
    "PERSISTED_STATE_UNREADABLE",
    "Persisted founder state could not be read."
  );

  try {
    return buildSnapshot({
      liveStore,
      persistedStore,
      validatorResult,
      plan,
      coordinatorCompatibility,
      sourceIdentity,
      capturedAt,
      availability,
    });
  } catch (cause) {
    if (cause instanceof GoalTransitionActivationSourceSnapshotError) throw cause;
    throw sourceError(
      "CANONICALIZATION_FAILED",
      "Activation source canonicalization failed.",
      cause
    );
  }
}

export async function revalidateGoalTransitionActivationPreExecution(options) {
  const snapshot = await captureGoalTransitionActivationSourceSnapshot(options);
  return deepFreezeActivationValue({
    passed: snapshot.sourceMatches && snapshot.artifactsCompatible,
    normalizedRevision: snapshot.normalizedRevision,
    snapshotId: snapshot.snapshotId,
    blockingReasons: canonicalActivationClone(snapshot.blockingReasons),
    requirements: GoalTransitionActivationPreExecutionRequirements,
  });
}

export async function revalidateGoalTransitionActivationPreCommit({
  originalSnapshot,
  transactionExpectedRevision,
  stagedState: _stagedState,
  ...options
} = {}) {
  if (!originalSnapshot) {
    throw sourceError("INPUT_REQUIRED", "The original committed source snapshot is required.");
  }
  const current = await captureGoalTransitionActivationSourceSnapshot(options);
  const blockingReasons = [...current.blockingReasons];
  addMismatch(
    blockingReasons,
    current.normalizedRevision === originalSnapshot.normalizedRevision
      && current.normalizedRevision === transactionExpectedRevision,
    "PLAN_REVISION_MISMATCH",
    originalSnapshot.normalizedRevision,
    current.normalizedRevision
  );
  addMismatch(
    blockingReasons,
    current.revisionMetadata.lastCommitId === originalSnapshot.revisionMetadata.lastCommitId,
    "REVISION_CONFLICT",
    originalSnapshot.revisionMetadata.lastCommitId,
    current.revisionMetadata.lastCommitId
  );
  addMismatch(
    blockingReasons,
    activationFingerprint(current.sourceRevisions)
      === activationFingerprint(originalSnapshot.sourceRevisions),
    "COMPLETE_FINGERPRINT_MISMATCH",
    activationFingerprint(originalSnapshot.sourceRevisions),
    activationFingerprint(current.sourceRevisions)
  );
  const ordered = orderReasons(blockingReasons);
  return deepFreezeActivationValue({
    passed: ordered.length === 0,
    originalSnapshotId: originalSnapshot.snapshotId,
    currentSnapshotId: current.snapshotId,
    normalizedRevision: current.normalizedRevision,
    blockingReasons: ordered,
    requirements: GoalTransitionActivationPreCommitRequirements,
    stagedStateComparedToOriginalSource: false,
  });
}

export function validateGoalTransitionActivationSourceSnapshotIntegrity(snapshot) {
  if (!snapshot || snapshot.snapshotVersion !== GoalTransitionActivationSourceSnapshotVersion
    || snapshot.canonicalizationVersion !== GoalTransitionActivationCanonicalizationVersion
    || !snapshot.artifactBindings || !snapshot.validatorExpectations) {
    throw sourceError("ARTIFACT_VERSION_UNSUPPORTED", "Source snapshot contract is unsupported.");
  }
  const semantic = {
    snapshotVersion: snapshot.snapshotVersion,
    canonicalizationVersion: snapshot.canonicalizationVersion,
    transitionIdentity: snapshot.transitionIdentity,
    normalizedRevision: snapshot.normalizedRevision,
    revisionMetadata: snapshot.revisionMetadata,
    sourceState: snapshot.sourceState,
    sourceRevisions: snapshot.sourceRevisions,
    completionRecommendationFingerprint: snapshot.completionRecommendationFingerprint,
    cadenceSourceFingerprint: snapshot.cadenceSourceFingerprint,
    validatorExpectations: snapshot.validatorExpectations,
    planId: snapshot.artifactBindings.planId,
    planFingerprint: snapshot.artifactBindings.planFingerprint,
    coordinatorCompatibilityFingerprint:
      snapshot.artifactBindings.coordinatorCompatibilityFingerprint,
    ...(snapshot.sourceIdentity ? { sourceIdentity: snapshot.sourceIdentity } : {}),
  };
  const expected = activationFingerprint(semantic);
  if (snapshot.snapshotFingerprint !== expected
    || snapshot.snapshotId
      !== `goal_transition_activation_source_${expected.slice(0, 24)}`) {
    throw sourceError("COMPLETE_FINGERPRINT_MISMATCH", "Source snapshot fingerprint is invalid.");
  }
  return true;
}

function buildSnapshot({
  liveStore,
  persistedStore,
  validatorResult,
  plan,
  coordinatorCompatibility,
  sourceIdentity,
  capturedAt,
  availability,
}) {
  const liveRevision = normalizeRevision(liveStore, "live");
  const persistedRevision = normalizeRevision(persistedStore, "persisted");
  const legacyRevisionToken = validatorResult.sourceRevisions?.founderStoreRevision
    ?? liveStore.updatedAt
    ?? persistedStore.updatedAt
    ?? null;
  const validatorInput = createValidatorInput(
    liveStore,
    legacyRevisionToken,
    validatorResult.transitionIdentity
  );
  const currentValidation = validateGoalTransitionActivation({
    snapshot: validatorInput,
    capabilities: {},
  });
  const sourceState = activationSourceState(validatorInput);
  const sourceRevisions = currentValidation.sourceRevisions;
  const completionRecommendationFingerprint =
    activationFingerprint(sourceState.completionRecommendation);
  const cadenceSourceFingerprint = activationFingerprint({
    currentBriefingCadence: sourceState.currentBriefingCadence,
    operatingPlanCadence: sourceState.operatingPlanCadence,
  });
  const transitionIdentity = currentValidation.transitionIdentity;
  const blockingReasons = [];

  addMismatch(
    blockingReasons,
    liveRevision.normalizedRevision === persistedRevision.normalizedRevision,
    "LIVE_PERSISTED_REVISION_MISMATCH",
    persistedRevision.normalizedRevision,
    liveRevision.normalizedRevision
  );
  compareValidator({
    blockingReasons,
    validatorResult,
    currentValidation,
    completionRecommendationFingerprint,
    cadenceSourceFingerprint,
  });
  comparePlan({
    blockingReasons,
    plan,
    validatorResult,
    currentValidation,
    normalizedRevision: persistedRevision.normalizedRevision,
    legacyRevisionToken,
  });
  compareCoordinator({
    blockingReasons,
    plan,
    coordinatorCompatibility,
  });
  validateLifecycleState({ blockingReasons, sourceState, transitionIdentity });

  const sourceReasonCodes = new Set([
    C.LIVE_PERSISTED_REVISION_MISMATCH,
    C.TRANSITION_IDENTITY_MISMATCH,
    C.GOAL_DRAFT_MISMATCH,
    C.PROTOCOL_DRAFT_MISMATCH,
    C.ACTIVE_GOAL_MISMATCH,
    C.HISTORICAL_PROTOCOL_OWNERSHIP_MISMATCH,
    C.COMMITMENT_SOURCE_MISMATCH,
    C.SCHEDULER_SOURCE_MISMATCH,
    C.EVIDENCE_RELATIONSHIP_MISMATCH,
    C.COMPLETION_RECOMMENDATION_MISMATCH,
    C.CADENCE_SOURCE_MISMATCH,
    C.COMPLETE_FINGERPRINT_MISMATCH,
    C.TRANSITION_ALREADY_CONSUMED,
    C.TARGET_GOAL_CONFLICT,
    C.SOURCE_GOAL_STATE_CHANGED,
  ]);
  const orderedReasons = orderReasons(blockingReasons);
  const sourceMatches = !orderedReasons.some((reason) => sourceReasonCodes.has(reason.code));
  const artifactsCompatible = orderedReasons.length === 0;
  const executingCoordinatorAvailable = availability.executingCoordinator === true;
  const productionActivationBoundaryAvailable =
    availability.productionActivationBoundary === true;
  const executionAvailable =
    executingCoordinatorAvailable && productionActivationBoundaryAvailable;
  const warnings = buildWarnings({
    liveRevision,
    persistedRevision,
    legacyRevisionToken,
    coordinatorCompatibility,
    productionActivationBoundaryAvailable,
  });
  const revisionMetadata = {
    normalizedRevision: persistedRevision.normalizedRevision,
    revisionSource: persistedRevision.revisionSource,
    legacyRevisionToken,
    founderStoreUpdatedAt: persistedStore.updatedAt ?? liveStore.updatedAt ?? null,
    lastCommitId: persistedStore.lastCommitId ?? liveStore.lastCommitId ?? null,
    revisionPresent: persistedRevision.revisionPresent,
    legacyNormalized: persistedRevision.legacyNormalized,
    compareAndSwapEligible:
      liveRevision.normalizedRevision === persistedRevision.normalizedRevision,
    revisionWarnings: warnings
      .filter((warning) => warning.code.includes("REVISION"))
      .map((warning) => warning.code),
  };
  const semantic = {
    snapshotVersion: GoalTransitionActivationSourceSnapshotVersion,
    canonicalizationVersion: GoalTransitionActivationCanonicalizationVersion,
    transitionIdentity,
    normalizedRevision: persistedRevision.normalizedRevision,
    revisionMetadata,
    sourceState,
    sourceRevisions,
    completionRecommendationFingerprint,
    cadenceSourceFingerprint,
    validatorExpectations: validatorExpectationContract(validatorResult),
    planId: plan.planId,
    planFingerprint: plan.planFingerprint,
    coordinatorCompatibilityFingerprint: coordinatorCompatibility.compatibilityFingerprint,
    ...(sourceIdentity ? { sourceIdentity } : {}),
  };
  const snapshotFingerprint = activationFingerprint(semantic);

  return deepFreezeActivationValue({
    snapshotId: `goal_transition_activation_source_${snapshotFingerprint.slice(0, 24)}`,
    snapshotVersion: GoalTransitionActivationSourceSnapshotVersion,
    canonicalizationVersion: GoalTransitionActivationCanonicalizationVersion,
    capturedAt: capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt,
    transitionIdentity,
    sourceIdentity: sourceIdentity ? canonicalActivationClone(sourceIdentity) : null,
    normalizedRevision: persistedRevision.normalizedRevision,
    revisionMetadata,
    sourceState,
    sourceRevisions,
    validatorExpectations: semantic.validatorExpectations,
    artifactBindings: {
      planId: plan.planId,
      planFingerprint: plan.planFingerprint,
      coordinatorCompatibilityFingerprint: coordinatorCompatibility.compatibilityFingerprint,
    },
    completionRecommendationFingerprint,
    cadenceSourceFingerprint,
    completeActivationCriticalFingerprint: sourceRevisions.activationCriticalState,
    validatorComparison: comparisonSummary(orderedReasons, VALIDATOR_CODES),
    planComparison: comparisonSummary(orderedReasons, PLAN_CODES),
    coordinatorComparison: comparisonSummary(orderedReasons, COORDINATOR_CODES),
    sourceMatches,
    artifactsCompatible,
    executionAvailable,
    activationReady: sourceMatches && artifactsCompatible && executionAvailable,
    executingCoordinatorAvailable,
    productionActivationBoundaryAvailable,
    blockingReasons: orderedReasons,
    warnings,
    preExecutionRequirements: GoalTransitionActivationPreExecutionRequirements,
    preCommitRequirements: GoalTransitionActivationPreCommitRequirements,
    snapshotFingerprint,
  });
}

const C = GoalTransitionActivationSourceSnapshotCode;
const VALIDATOR_CODES = new Set([
  C.TRANSITION_IDENTITY_MISMATCH,
  C.GOAL_DRAFT_MISMATCH,
  C.PROTOCOL_DRAFT_MISMATCH,
  C.ACTIVE_GOAL_MISMATCH,
  C.HISTORICAL_PROTOCOL_OWNERSHIP_MISMATCH,
  C.COMMITMENT_SOURCE_MISMATCH,
  C.SCHEDULER_SOURCE_MISMATCH,
  C.EVIDENCE_RELATIONSHIP_MISMATCH,
  C.COMPLETION_RECOMMENDATION_MISMATCH,
  C.CADENCE_SOURCE_MISMATCH,
  C.COMPLETE_FINGERPRINT_MISMATCH,
  C.EXPECTED_WRITE_COUNTS_MISMATCH,
  C.FUTURE_PROTOCOL_PLAN_MISMATCH,
]);
const PLAN_CODES = new Set([
  C.PLAN_ID_MISMATCH,
  C.PLAN_FINGERPRINT_MISMATCH,
  C.PLAN_REVISION_MISMATCH,
  C.EXPECTED_WRITE_COUNTS_MISMATCH,
  C.FUTURE_PROTOCOL_PLAN_MISMATCH,
  C.ARTIFACT_VERSION_UNSUPPORTED,
]);
const COORDINATOR_CODES = new Set([
  C.COMPATIBILITY_FINGERPRINT_MISMATCH,
  C.ARTIFACT_VERSION_UNSUPPORTED,
]);
const REASON_ORDER = Object.values(GoalTransitionActivationSourceSnapshotCode);

function compareValidator({
  blockingReasons,
  validatorResult,
  currentValidation,
  completionRecommendationFingerprint,
  cadenceSourceFingerprint,
}) {
  addMismatch(
    blockingReasons,
    same(currentValidation.transitionIdentity, validatorResult.transitionIdentity),
    "TRANSITION_IDENTITY_MISMATCH",
    validatorResult.transitionIdentity,
    currentValidation.transitionIdentity
  );
  compareValue(blockingReasons, "GOAL_DRAFT_MISMATCH", {
    expected: [
      validatorResult.validatedGoalDraft?.id,
      validatorResult.sourceRevisions?.goalDraft,
    ],
    actual: [
      currentValidation.validatedGoalDraft?.id,
      currentValidation.sourceRevisions.goalDraft,
    ],
  });
  compareValue(blockingReasons, "PROTOCOL_DRAFT_MISMATCH", {
    expected: [
      validatorResult.validatedProtocolDraft?.id,
      validatorResult.sourceRevisions?.protocolDraft,
    ],
    actual: [
      currentValidation.validatedProtocolDraft?.id,
      currentValidation.sourceRevisions.protocolDraft,
    ],
  });
  const keys = [
    ["activeGoalState", "ACTIVE_GOAL_MISMATCH"],
    ["historicalProtocolOwnership", "HISTORICAL_PROTOCOL_OWNERSHIP_MISMATCH"],
    ["commitmentSourceState", "COMMITMENT_SOURCE_MISMATCH"],
    ["schedulerIntentSourceState", "SCHEDULER_SOURCE_MISMATCH"],
    ["evidenceRelationshipState", "EVIDENCE_RELATIONSHIP_MISMATCH"],
    ["activationCriticalState", "COMPLETE_FINGERPRINT_MISMATCH"],
  ];
  for (const [key, code] of keys) {
    compareValue(blockingReasons, code, {
      expected: validatorResult.sourceRevisions?.[key],
      actual: currentValidation.sourceRevisions[key],
    });
  }
  if (validatorResult.sourceRevisions?.completionRecommendationState) {
    compareValue(blockingReasons, "COMPLETION_RECOMMENDATION_MISMATCH", {
      expected: validatorResult.sourceRevisions.completionRecommendationState,
      actual: completionRecommendationFingerprint,
    });
  }
  if (validatorResult.sourceRevisions?.cadenceSourceState) {
    compareValue(blockingReasons, "CADENCE_SOURCE_MISMATCH", {
      expected: validatorResult.sourceRevisions.cadenceSourceState,
      actual: cadenceSourceFingerprint,
    });
  }
  compareValue(blockingReasons, "EXPECTED_WRITE_COUNTS_MISMATCH", {
    expected: validatorResult.expectedWriteCounts,
    actual: currentValidation.expectedWriteCounts,
  });
  compareValue(blockingReasons, "FUTURE_PROTOCOL_PLAN_MISMATCH", {
    expected: validatorResult.futureProtocolPlan,
    actual: currentValidation.futureProtocolPlan,
  });
}

function comparePlan({
  blockingReasons,
  plan,
  validatorResult,
  currentValidation,
  normalizedRevision,
  legacyRevisionToken,
}) {
  addMismatch(
    blockingReasons,
    plan.planId === `goal_transition_activation_plan_${plan.planFingerprint.slice(0, 24)}`,
    "PLAN_ID_MISMATCH",
    `goal_transition_activation_plan_${plan.planFingerprint.slice(0, 24)}`,
    plan.planId
  );
  addMismatch(
    blockingReasons,
    isDeeplyFrozenActivationValue(plan),
    "PLAN_FINGERPRINT_MISMATCH",
    "deeply_immutable_plan",
    "mutable_or_structurally_changed"
  );
  const expectedRevision = plan.preCommitRequirements?.expectedFounderStoreRevision;
  const revisionMatches = expectedRevision === normalizedRevision
    || (expectedRevision === legacyRevisionToken
      && expectedRevision === validatorResult.sourceRevisions?.founderStoreRevision);
  addMismatch(
    blockingReasons,
    revisionMatches,
    "PLAN_REVISION_MISMATCH",
    expectedRevision,
    normalizedRevision
  );
  compareValue(blockingReasons, "TRANSITION_IDENTITY_MISMATCH", {
    expected: plan.transitionIdentity,
    actual: currentValidation.transitionIdentity,
  });
  compareValue(blockingReasons, "EXPECTED_WRITE_COUNTS_MISMATCH", {
    expected: plan.expectedWriteCounts,
    actual: currentValidation.expectedWriteCounts,
  });
  compareValue(blockingReasons, "FUTURE_PROTOCOL_PLAN_MISMATCH", {
    expected: validatorResult.futureProtocolPlan,
    actual: currentValidation.futureProtocolPlan,
  });
  compareValue(blockingReasons, "COMPLETE_FINGERPRINT_MISMATCH", {
    expected: plan.sourceRevisionFingerprint,
    actual: activationFingerprint(currentValidation.sourceRevisions),
  });
}

function compareCoordinator({ blockingReasons, plan, coordinatorCompatibility }) {
  let recomputed;
  try {
    recomputed = validateGoalTransitionActivationCoordinatorCompatibility({ plan });
  } catch {
    addMismatch(
      blockingReasons,
      false,
      "PLAN_FINGERPRINT_MISMATCH",
      plan.planFingerprint,
      "invalid_plan"
    );
    return;
  }
  compareValue(blockingReasons, "COMPATIBILITY_FINGERPRINT_MISMATCH", {
    expected: coordinatorCompatibility.compatibilityFingerprint,
    actual: recomputed.compatibilityFingerprint,
  });
}

function validateLifecycleState({ blockingReasons, sourceState, transitionIdentity }) {
  const activePrimary = sourceState.goals.filter(
    (goal) => goal.primary === true && goal.status === "active"
  );
  addMismatch(
    blockingReasons,
    activePrimary.length === 1
      && activePrimary[0].id === transitionIdentity.sourceGoalId,
    "SOURCE_GOAL_STATE_CHANGED",
    transitionIdentity.sourceGoalId,
    activePrimary.map((goal) => goal.id)
  );
  const targetConflict = sourceState.goals.some(
    (goal) => goal.id === transitionIdentity.targetGoalDraftId
      || goal.type === "build_lean_mass"
      || /build lean mass/i.test(goal.title ?? "")
  );
  addMismatch(
    blockingReasons,
    !targetConflict,
    "TARGET_GOAL_CONFLICT",
    "absent",
    "present"
  );
  const consumed = [sourceState.goalDraft, sourceState.protocolDraft].some(
    (draft) => !draft
      || draft.status !== "ready"
      || draft.appliedAt
      || draft.transitionAppliedAt
  ) || sourceState.goals.some(
    (goal) => goal.transitionAppliedAt
      && goal.transitionAppliedAt === transitionIdentity.goalTransitionDraftId
  );
  addMismatch(
    blockingReasons,
    !consumed,
    "TRANSITION_ALREADY_CONSUMED",
    false,
    true
  );
}

function createValidatorInput(store, repositoryRevision, transitionIdentity = {}) {
  const goalDraft = (store.goalTransitionDrafts ?? []).find(
    (draft) => draft.id === transitionIdentity.goalTransitionDraftId
  ) ?? (store.goalTransitionDrafts ?? []).find(
    (draft) => ["ready", "draft"].includes(draft.status)
  ) ?? null;
  const protocolDraft = (store.goalProtocolTransitionDrafts ?? []).find(
    (draft) => draft.id === transitionIdentity.protocolTransitionDraftId
  ) ?? (store.goalProtocolTransitionDrafts ?? []).find(
    (draft) => draft.goalTransitionDraftId === goalDraft?.id
  ) ?? null;
  const sourceGoal = (store.goals ?? []).find(
    (goal) => goal.id === goalDraft?.sourceGoalId
  );
  return canonicalActivationClone({
    userId: store.user?.id ?? goalDraft?.userId ?? null,
    timeZone: store.user?.timeZone ?? store.user?.timezone ?? null,
    defaultTimeZone: "America/Los_Angeles",
    repositoryRevision,
    goals: store.goals ?? [],
    goalDraft,
    protocolDraft,
    goalTransitionDrafts: store.goalTransitionDrafts ?? [],
    goalProtocolTransitionDrafts: store.goalProtocolTransitionDrafts ?? [],
    protocols: store.protocols ?? [],
    protocolVersions: store.protocolVersions ?? [],
    executionItems: store.executionItems ?? [],
    reminders: store.reminders ?? [],
    evidenceRelationships: store.evidenceRelationships ?? [],
    completionRecommendation:
      store.completionRecommendation
      ?? sourceGoal?.completionRecommendation
      ?? { userDecisionPending: true },
    currentBriefingCadence: store.currentBriefingCadence ?? null,
    operatingPlanCadence: canonicalActivationClone({
      coachingCadence:
        store.operatingPlan?.coachingCadence
        ?? store.operatingPlan?.cadence
        ?? null,
      briefingCadence: store.operatingPlan?.briefingCadence ?? null,
    }),
    proposedWriteSet: { evidence: [] },
  });
}

function activationSourceState(input) {
  return canonicalActivationClone({
    userId: input.userId,
    timeZone: input.timeZone ?? input.defaultTimeZone,
    goalDraft: input.goalDraft,
    protocolDraft: input.protocolDraft,
    goalTransitionDrafts: input.goalTransitionDrafts,
    goalProtocolTransitionDrafts: input.goalProtocolTransitionDrafts,
    goals: input.goals,
    protocols: input.protocols,
    protocolVersions: input.protocolVersions,
    executionItems: input.executionItems,
    reminders: input.reminders,
    currentBriefingCadence: input.currentBriefingCadence,
    operatingPlanCadence: input.operatingPlanCadence,
    completionRecommendation: input.completionRecommendation,
    evidenceRelationships: input.evidenceRelationships,
  });
}

function normalizeRevision(store, source) {
  const present = Object.prototype.hasOwnProperty.call(store, "revision")
    && store.revision !== undefined
    && store.revision !== null;
  if (present && (!Number.isSafeInteger(store.revision) || store.revision < 0)) {
    throw sourceError(
      "REVISION_INVALID",
      `${source} founder-store revision must be a non-negative safe integer.`
    );
  }
  return {
    normalizedRevision: getFounderStoreRevision(store),
    revisionSource: present ? `${source}_persisted_integer` : "legacy_default_zero",
    revisionPresent: present,
    legacyNormalized: !present,
  };
}

function validatorExpectationContract(result) {
  return {
    transitionIdentity: result.transitionIdentity,
    goalDraftId: result.validatedGoalDraft?.id,
    protocolDraftId: result.validatedProtocolDraft?.id,
    sourceRevisions: result.sourceRevisions,
    expectedWriteCounts: result.expectedWriteCounts,
    futureProtocolPlan: result.futureProtocolPlan,
  };
}

function buildWarnings({
  liveRevision,
  persistedRevision,
  legacyRevisionToken,
  coordinatorCompatibility,
  productionActivationBoundaryAvailable,
}) {
  const W = GoalTransitionActivationSourceSnapshotWarningCode;
  const warnings = [];
  if (liveRevision.legacyNormalized || persistedRevision.legacyNormalized) {
    warnings.push({ code: W.LEGACY_REVISION_NORMALIZED, normalizedRevision: 0 });
  }
  if (legacyRevisionToken !== null && legacyRevisionToken !== undefined) {
    warnings.push({ code: W.LEGACY_TOKEN_DIAGNOSTIC });
  }
  warnings.push({ code: W.CROSS_PROCESS_LOCKING_UNAVAILABLE });
  if (coordinatorCompatibility.externalEffectExecutorsAvailable !== true) {
    warnings.push({ code: W.EXTERNAL_EXECUTOR_UNAVAILABLE });
  }
  if (!productionActivationBoundaryAvailable) {
    warnings.push({ code: W.PRODUCTION_BOUNDARY_UNAVAILABLE });
  }
  warnings.push(
    { code: W.UI_RECONCILIATION_DEFERRED },
    { code: W.BRIEFING_POLICY_DEFERRED }
  );
  return warnings;
}

function comparisonSummary(reasons, codes) {
  const mismatches = reasons.filter((reason) => codes.has(reason.code));
  return {
    matches: mismatches.length === 0,
    mismatchCodes: mismatches.map((reason) => reason.code),
  };
}

function compareValue(reasons, shortCode, { expected, actual }) {
  addMismatch(reasons, same(expected, actual), shortCode, expected, actual);
}

function addMismatch(reasons, matches, shortCode, expected, actual) {
  if (matches || reasons.some((reason) => reason.code === C[shortCode])) return;
  reasons.push({
    code: C[shortCode],
    expected: diagnostic(expected),
    actual: diagnostic(actual),
  });
}

function diagnostic(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  return activationFingerprint(value);
}

function same(left, right) {
  return activationFingerprint(left) === activationFingerprint(right);
}

function orderReasons(reasons) {
  return [...reasons].sort(
    (left, right) => REASON_ORDER.indexOf(left.code) - REASON_ORDER.indexOf(right.code)
  );
}

async function controlledRead(reader, shortCode, message) {
  try {
    const value = await reader();
    if (!value || typeof value !== "object") throw new TypeError("Snapshot reader returned no state.");
    return canonicalActivationClone(value);
  } catch (cause) {
    throw sourceError(shortCode, message, cause);
  }
}

function assertInputs(input) {
  if (typeof input.readLiveStore !== "function" || typeof input.readPersistedStore !== "function") {
    throw sourceError("INPUT_REQUIRED", "Live and persisted read boundaries are required.");
  }
  if (!input.validatorResult) {
    throw sourceError("VALIDATOR_RESULT_REQUIRED", "Validator result is required.");
  }
  if (!input.plan) throw sourceError("PLAN_REQUIRED", "Immutable transaction plan is required.");
  if (!input.coordinatorCompatibility) {
    throw sourceError(
      "COORDINATOR_COMPATIBILITY_REQUIRED",
      "Coordinator compatibility result is required."
    );
  }
}

function assertArtifactVersions({ validatorResult, plan, coordinatorCompatibility }) {
  const supportedValidatorVersions = new Set([undefined, null, "legacy_unversioned_v1"]);
  if (!supportedValidatorVersions.has(validatorResult.resultVersion)) {
    throw sourceError("ARTIFACT_VERSION_UNSUPPORTED", "Validator result version is unsupported.");
  }
  if (plan.planVersion !== GoalTransitionActivationPlanVersion) {
    throw sourceError("ARTIFACT_VERSION_UNSUPPORTED", "Transaction plan version is unsupported.");
  }
  const supportedCoordinator =
    coordinatorCompatibility.coordinatorStateModel?.version
      === GoalTransitionActivationCoordinatorStateModel.version
    && coordinatorCompatibility.coordinatorResultContract?.version
      === GoalTransitionActivationCoordinatorResultContract.version;
  if (!supportedCoordinator
    || GoalTransitionActivationDispatchRegistry.length === 0
    || GoalTransitionActivationInvariantRegistry.version
      !== "goal_transition_activation_invariants_v1"
    || ActivationStagedRepositoryContract.version !== "activation_staged_repository_contract_v1") {
    throw sourceError("ARTIFACT_VERSION_UNSUPPORTED", "Coordinator contract version is unsupported.");
  }
}

function sourceError(shortCode, message, cause) {
  return new GoalTransitionActivationSourceSnapshotError(
    C[shortCode] ?? shortCode,
    message,
    { cause }
  );
}

export const GoalTransitionActivationSourceSnapshotContract = deepFreezeActivationValue({
  version: GoalTransitionActivationSourceSnapshotVersion,
  canonicalizationVersion: GoalTransitionActivationCanonicalizationVersion,
  oneReadPerBoundary: true,
  mutationCapableDependencies: false,
  normalizedLegacyRevision: LEGACY_FOUNDER_STORE_REVISION,
  preExecutionRequirements: GoalTransitionActivationPreExecutionRequirements,
  preCommitRequirements: GoalTransitionActivationPreCommitRequirements,
});
