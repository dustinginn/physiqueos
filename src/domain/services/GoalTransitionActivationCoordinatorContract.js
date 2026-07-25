import { createHash } from "node:crypto";
import {
  GoalTransitionActivationPlanOperationType as OperationType,
  GoalTransitionActivationPlanPhase as Phase,
  GoalTransitionActivationStagedInvariantCode,
  validateGoalTransitionActivationPlan,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import { ActivationStagedRepositoryContract } from "../../data/repositories/ActivationStagedRepositoryFactory";

export const GoalTransitionActivationExecutionClass = Object.freeze({
  READ_ONLY_ASSERTION: "READ_ONLY_ASSERTION",
  STAGED_REPOSITORY_MUTATION: "STAGED_REPOSITORY_MUTATION",
  STAGED_INVARIANT_VALIDATION: "STAGED_INVARIANT_VALIDATION",
  UNIT_OF_WORK_COMMIT: "UNIT_OF_WORK_COMMIT",
  RUNTIME_PUBLICATION: "RUNTIME_PUBLICATION",
  POST_COMMIT_EXTERNAL_EFFECT: "POST_COMMIT_EXTERNAL_EFFECT",
  DEFERRED_NON_EXECUTABLE: "DEFERRED_NON_EXECUTABLE",
});

export const GoalTransitionActivationCoordinatorState = Object.freeze({
  IDLE: "idle",
  VALIDATING: "validating",
  PLANNING: "planning",
  OPENING_TRANSACTION: "opening_transaction",
  STAGING: "staging",
  VALIDATING_STAGED_STATE: "validating_staged_state",
  COMMITTING: "committing",
  COMMITTED: "committed",
  PUBLISHING: "publishing",
  POST_COMMIT_PENDING: "post_commit_pending",
  COMPLETED: "completed",
  FAILED_PRE_COMMIT: "failed_pre_commit",
  FAILED_COMMITTED: "failed_committed",
  ABORTED: "aborted",
});

export const GoalTransitionActivationCoordinatorErrorCode = Object.freeze({
  PLAN_REQUIRED: "ACTIVATION_COORDINATOR_PLAN_REQUIRED",
  PLAN_INCOMPLETE: "ACTIVATION_COORDINATOR_PLAN_INCOMPLETE",
  PLAN_NOT_IMMUTABLE: "ACTIVATION_COORDINATOR_PLAN_NOT_IMMUTABLE",
  OPERATION_UNMAPPED: "ACTIVATION_COORDINATOR_OPERATION_UNMAPPED",
  OPERATION_AMBIGUOUS: "ACTIVATION_COORDINATOR_OPERATION_AMBIGUOUS",
  OPERATION_CLASS_INVALID: "ACTIVATION_COORDINATOR_OPERATION_CLASS_INVALID",
  REPOSITORY_UNAVAILABLE: "ACTIVATION_COORDINATOR_REPOSITORY_UNAVAILABLE",
  METHOD_UNAVAILABLE: "ACTIVATION_COORDINATOR_METHOD_UNAVAILABLE",
  PAYLOAD_INVALID: "ACTIVATION_COORDINATOR_PAYLOAD_INVALID",
  PHASE_UNSUPPORTED: "ACTIVATION_COORDINATOR_PHASE_UNSUPPORTED",
  EVIDENCE_OPERATION_FORBIDDEN: "ACTIVATION_COORDINATOR_EVIDENCE_OPERATION_FORBIDDEN",
  GROUPED_PREVIEW_ID_FORBIDDEN: "ACTIVATION_COORDINATOR_GROUPED_PREVIEW_ID_FORBIDDEN",
  HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN: "ACTIVATION_COORDINATOR_HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN",
  ASSERTION_HANDLER_MISSING: "ACTIVATION_COORDINATOR_ASSERTION_HANDLER_MISSING",
  INVARIANT_HANDLER_MISSING: "ACTIVATION_COORDINATOR_INVARIANT_HANDLER_MISSING",
  COMMIT_BOUNDARY_INVALID: "ACTIVATION_COORDINATOR_COMMIT_BOUNDARY_INVALID",
  PUBLICATION_BOUNDARY_INVALID: "ACTIVATION_COORDINATOR_PUBLICATION_BOUNDARY_INVALID",
  EXTERNAL_EFFECT_ORDER_INVALID: "ACTIVATION_COORDINATOR_EXTERNAL_EFFECT_ORDER_INVALID",
  STATE_TRANSITION_INVALID: "ACTIVATION_COORDINATOR_STATE_TRANSITION_INVALID",
  RESULT_CONTRACT_INVALID: "ACTIVATION_COORDINATOR_RESULT_CONTRACT_INVALID",
  EXECUTOR_UNAVAILABLE: "ACTIVATION_COORDINATOR_EXECUTOR_UNAVAILABLE",
  PRODUCTION_BOUNDARY_UNAVAILABLE: "ACTIVATION_COORDINATOR_PRODUCTION_BOUNDARY_UNAVAILABLE",
  EXTERNAL_EXECUTOR_UNAVAILABLE: "ACTIVATION_COORDINATOR_EXTERNAL_EXECUTOR_UNAVAILABLE",
});

const S = GoalTransitionActivationCoordinatorState;
export const GoalTransitionActivationCoordinatorStateModel = deepFreeze({
  version: "goal_transition_activation_coordinator_state_v1",
  initialState: S.IDLE,
  terminalStates: [S.COMPLETED, S.FAILED_PRE_COMMIT, S.FAILED_COMMITTED, S.ABORTED],
  transitions: {
    [S.IDLE]: [S.VALIDATING, S.ABORTED],
    [S.VALIDATING]: [S.PLANNING, S.FAILED_PRE_COMMIT, S.ABORTED],
    [S.PLANNING]: [S.OPENING_TRANSACTION, S.FAILED_PRE_COMMIT, S.ABORTED],
    [S.OPENING_TRANSACTION]: [S.STAGING, S.FAILED_PRE_COMMIT, S.ABORTED],
    [S.STAGING]: [S.VALIDATING_STAGED_STATE, S.FAILED_PRE_COMMIT, S.ABORTED],
    [S.VALIDATING_STAGED_STATE]: [S.COMMITTING, S.FAILED_PRE_COMMIT, S.ABORTED],
    [S.COMMITTING]: [S.COMMITTED, S.FAILED_PRE_COMMIT, S.FAILED_COMMITTED],
    [S.COMMITTED]: [S.PUBLISHING, S.POST_COMMIT_PENDING],
    [S.PUBLISHING]: [S.POST_COMMIT_PENDING, S.COMPLETED, S.FAILED_COMMITTED],
    [S.POST_COMMIT_PENDING]: [S.COMPLETED, S.FAILED_COMMITTED],
    [S.COMPLETED]: [],
    [S.FAILED_PRE_COMMIT]: [],
    [S.FAILED_COMMITTED]: [],
    [S.ABORTED]: [],
  },
});

export const GoalTransitionActivationCoordinatorResultContract = deepFreeze({
  version: "goal_transition_activation_coordinator_result_v1",
  fields: [
    "status",
    "committed",
    "completed",
    "transitionIdentity",
    "planId",
    "planFingerprint",
    "expectedRevision",
    "committedRevision",
    "commitId",
    "executedOperationIds",
    "skippedOperationIds",
    "failedOperationId",
    "failureStage",
    "errorCode",
    "errorMessage",
    "preCommitFailure",
    "postCommitFailure",
    "postCommitEffects",
    "pendingExternalEffects",
    "warnings",
    "startedAt",
    "committedAt",
    "completedAt",
  ],
  rules: {
    preCommitFailureRequiresCommittedFalse: true,
    committedFailurePreservesCommittedTrue: true,
    completedRequiresNoRequiredPendingEffects: true,
    rawStagedStateForbidden: true,
  },
});

const C = GoalTransitionActivationExecutionClass;
export const GoalTransitionActivationDispatchRegistry = deepFreeze([
  descriptor(OperationType.ASSERT_SOURCE_STATE, C.READ_ONLY_ASSERTION, {
    boundaryKey: "assertions",
    methodName: "assertSourceState",
    allowedPhase: Phase.PRECONDITION_ASSERTIONS,
    requiredPayloadPaths: [
      "expectedFounderStoreRevision",
      "activationCriticalFingerprint",
      "goalDraftFingerprint",
      "protocolDraftFingerprint",
      "activeGoalStateFingerprint",
      "historicalProtocolOwnershipFingerprint",
      "commitmentSourceFingerprint",
      "schedulerSourceFingerprint",
      "evidenceRelationshipFingerprint",
      "transitionIdentity",
    ],
    requiresTransaction: false,
  }),
  descriptor(OperationType.PRESERVE_SOURCE_HISTORY, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "goals", methodName: "updateLifecycle",
    allowedPhase: Phase.SOURCE_GOAL_COMPLETION,
    requiredPayloadPaths: ["activationHistory.transitionId", "activationHistory.preservationMode"],
  }),
  descriptor(OperationType.COMPLETE_SOURCE_GOAL, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "goals", methodName: "updateLifecycle",
    allowedPhase: Phase.SOURCE_GOAL_COMPLETION,
    requiredPayloadPaths: ["status", "primary", "completion.status", "completion.transitionId"],
  }),
  descriptor(OperationType.CREATE_TARGET_GOAL, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "goals", methodName: "addFutureGoal",
    allowedPhase: Phase.TARGET_GOAL_CREATION,
    requiredPayloadPaths: [
      "id", "userId", "title", "type", "primary", "status", "openingApproach",
      "guardrails", "progressMeasurement", "coachingCadenceReference",
      "sourceGoalId", "createdFromTransitionId",
    ],
  }),
  descriptor(OperationType.CREATE_FUTURE_PROTOCOL, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "protocols", methodName: "addFutureProtocol",
    allowedPhase: Phase.FUTURE_PROTOCOL_CREATION,
    requiredPayloadPaths: [
      "id", "userId", "protocolType", "category", "status", "sourceProtocolId",
      "disposition", "effectiveStrategy", "reviewId",
    ],
  }),
  descriptor(OperationType.CREATE_PROTOCOL_VERSION, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "protocolVersions", methodName: "addFutureVersion",
    allowedPhase: Phase.PROTOCOL_VERSION_CREATION,
    requiredPayloadPaths: [
      "id", "protocolId", "versionNumber", "status", "effectiveAt",
      "change.reason", "goalLinks", "confirmation",
    ],
  }),
  descriptor(OperationType.CREATE_PROTOCOL_PROVENANCE, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "protocolRelationships", methodName: "addProvenance",
    allowedPhase: Phase.PROTOCOL_PROVENANCE_CREATION,
    requiredPayloadPaths: [
      "futureProtocolId", "sourceProtocolId", "provenanceSourceType", "ownershipTransferred",
    ],
  }),
  descriptor(OperationType.LINK_PROTOCOL_TO_GOAL, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "protocolRelationships", methodName: "linkFutureProtocolToGoal",
    allowedPhase: Phase.PROTOCOL_OWNERSHIP_LINKING,
    requiredPayloadPaths: ["protocolId", "goalId"],
  }),
  descriptor(OperationType.CREATE_COMMITMENT, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "commitments", methodName: "add",
    allowedPhase: Phase.COMMITMENT_CREATION,
    requiredPayloadPaths: [
      "id", "userId", "sourceProtocolId", "linkedGoalIds", "title",
      "frequency", "cadence.type", "active",
    ],
  }),
  descriptor(OperationType.CREATE_REMINDER_INTENT, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "reminders", methodName: "add",
    allowedPhase: Phase.REMINDER_AND_SCHEDULER_INTENT,
    requiredPayloadPaths: [
      "id", "userId", "linkedEntityType", "linkedEntityId", "sourceProtocolId",
      "schedule.cadence", "externalApplicationStatus",
    ],
  }),
  descriptor(OperationType.CREATE_SCHEDULER_INTENT, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "reminders", methodName: "add",
    allowedPhase: Phase.REMINDER_AND_SCHEDULER_INTENT,
    requiredPayloadPaths: [
      "id", "userId", "intentType", "status", "idempotencyKey", "relatedGoalIds",
    ],
  }),
  descriptor(OperationType.UPDATE_COACHING_CADENCE, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "briefingCadence", methodName: "set",
    allowedPhase: Phase.COACHING_AND_BRIEFING_CADENCE,
    requiredPayloadPaths: ["type", "days"],
  }),
  descriptor(OperationType.RESOLVE_COMPLETION_RECOMMENDATION, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "completionRecommendations", methodName: "resolve",
    allowedPhase: Phase.COMPLETION_RECOMMENDATION_RESOLUTION,
    requiredPayloadPaths: ["goalId", "resolution.status", "resolution.transitionId"],
  }),
  descriptor(OperationType.ACTIVATE_TARGET_GOAL, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "goals", methodName: "updateLifecycle",
    allowedPhase: Phase.TARGET_GOAL_ACTIVATION,
    requiredPayloadPaths: ["status", "primary", "activatedAt", "activationState"],
  }),
  descriptor(OperationType.CONSUME_GOAL_TRANSITION_DRAFT, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "goalTransitionDrafts", methodName: "consume",
    allowedPhase: Phase.TRANSITION_DRAFT_CONSUMPTION,
    requiredPayloadPaths: [
      "draftId", "draftType", "transitionId", "consumedByTransitionId",
      "expectedStatus", "expectedAccepted", "expectedUnconsumed",
      "expectedDraftFingerprint", "activationPlanId.source",
      "activationPlanFingerprint.source", "sourceGoalId", "targetGoalId",
      "activationCommitId", "activationCommittedRevision", "consumedAt",
    ],
  }),
  descriptor(OperationType.CONSUME_PROTOCOL_TRANSITION_DRAFT, C.STAGED_REPOSITORY_MUTATION, {
    repositoryKey: "protocolTransitionDrafts", methodName: "consume",
    allowedPhase: Phase.TRANSITION_DRAFT_CONSUMPTION,
    requiredPayloadPaths: [
      "draftId", "draftType", "transitionId", "consumedByTransitionId",
      "expectedStatus", "expectedAccepted", "expectedUnconsumed",
      "expectedDraftFingerprint", "activationPlanId.source",
      "activationPlanFingerprint.source", "sourceGoalId", "targetGoalId",
      "activationCommitId", "activationCommittedRevision", "consumedAt",
    ],
  }),
  descriptor(OperationType.VALIDATE_FINAL_STAGED_STATE, C.STAGED_INVARIANT_VALIDATION, {
    boundaryKey: "integrity", methodName: "assertIntegrity",
    allowedPhase: Phase.FINAL_STAGED_INVARIANT_VALIDATION,
    requiredPayloadPaths: ["invariantCodes"],
  }),
  descriptor(OperationType.COMMIT_FOUNDER_STORE, C.UNIT_OF_WORK_COMMIT, {
    boundaryKey: "unitOfWork", methodName: "commit",
    allowedPhase: Phase.COMMIT,
    requiredPayloadPaths: ["expectedRevision", "commitCount", "compareAndSwapRequired"],
    postCommitOnly: false,
  }),
  descriptor(OperationType.PUBLISH_LIVE_RUNTIME, C.RUNTIME_PUBLICATION, {
    boundaryKey: "unitOfWork.commit",
    methodName: "publishCommittedState",
    dispatchMode: "observed_unit_of_work_commit_result",
    allowedPhase: Phase.POST_COMMIT_PUBLICATION,
    requiredPayloadPaths: ["publicationCount", "onlyAfterDurableCommit"],
    requiresCommit: true,
    postCommitOnly: true,
  }),
  descriptor(OperationType.DECLARE_EXTERNAL_EFFECT, C.POST_COMMIT_EXTERNAL_EFFECT, {
    boundaryKey: "postCommitEffects",
    methodName: "classifyEffect",
    allowedPhase: Phase.POST_COMMIT_EXTERNAL_EFFECTS,
    requiredPayloadPaths: [
      "id", "type", "timing", "required", "deferred", "retryModel",
      "idempotencyKey", "failureImpact",
    ],
    requiresTransaction: false,
    requiresCommit: true,
    postCommitOnly: true,
    externalSideEffect: true,
  }),
]);

export const GoalTransitionActivationAssertionRegistry = deepFreeze({
  version: "goal_transition_activation_assertions_v1",
  handlers: {
    assertSourceState: {
      assertionFamilies: [
        "expected_revision",
        "transition_identity",
        "plan_identity",
        "activation_critical_fingerprint",
        "goal_draft_fingerprint",
        "protocol_draft_fingerprint",
        "active_goal_fingerprint",
        "historical_protocol_ownership_fingerprint",
        "commitment_source_fingerprint",
        "scheduler_source_fingerprint",
        "evidence_relationship_fingerprint",
      ],
      mutation: false,
    },
  },
});

export const GoalTransitionActivationInvariantRegistry = deepFreeze({
  version: "goal_transition_activation_invariants_v1",
  runner: "runGoalTransitionActivationStagedInvariants",
  inputContract: [
    "stagedRepositoryInspection",
    "stagedStateInspection",
    "immutableHistoricalBaseline",
    "expectedWriteCounts",
    "sourceRevisions",
    "invariantDefinitions",
  ],
  handlers: Object.fromEntries(
    Object.values(GoalTransitionActivationStagedInvariantCode).map((code) => [
      code,
      { handler: `assert${pascalCase(code)}`, mutation: false },
    ])
  ),
});

export const GoalTransitionActivationPostCommitEffectRegistry = deepFreeze({
  version: "goal_transition_activation_post_commit_effects_v1",
  effects: {
    EXTERNAL_SCHEDULER_EXECUTION: effect({
      required: true,
      deferred: true,
      owner: "future_external_scheduler_executor",
      executionAvailable: false,
      failureBlocksCompletion: true,
    }),
    HOME_RECONCILIATION: effect({ owner: "active_app_reconciliation", executionAvailable: false }),
    GOALS_RECONCILIATION: effect({ owner: "active_app_reconciliation", executionAvailable: false }),
    PROTOCOLS_RECONCILIATION: effect({ owner: "active_app_reconciliation", executionAvailable: false }),
    EVIDENCE_LANDING_RECONCILIATION: effect({ owner: "active_app_reconciliation", executionAvailable: false }),
    BRIEFING_REGENERATION_OR_CATCH_UP: effect({
      owner: "future_briefing_policy",
      executionAvailable: false,
      automatic: false,
    }),
  },
});

export class GoalTransitionActivationCoordinatorContractError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = "GoalTransitionActivationCoordinatorContractError";
    this.code = code;
    this.operationId = context.operationId ?? null;
    this.field = context.field ?? null;
    this.actual = context.actual;
  }
}

export function validateGoalTransitionActivationCoordinatorCompatibility({
  plan,
  dispatchRegistry = GoalTransitionActivationDispatchRegistry,
  repositoryContract = ActivationStagedRepositoryContract,
  assertionRegistry = GoalTransitionActivationAssertionRegistry,
  invariantRegistry = GoalTransitionActivationInvariantRegistry,
  effectRegistry = GoalTransitionActivationPostCommitEffectRegistry,
  stateModel = GoalTransitionActivationCoordinatorStateModel,
  resultContract = GoalTransitionActivationCoordinatorResultContract,
  availability = {},
  evaluatedAt = null,
} = {}) {
  if (!plan) throw contractError("PLAN_REQUIRED", "An immutable activation plan is required.");
  if (!plan.planComplete || !Array.isArray(plan.operations)) {
    throw contractError("PLAN_INCOMPLETE", "The activation plan is incomplete.");
  }
  if (!isDeepFrozen(plan)) {
    throw contractError("PLAN_NOT_IMMUTABLE", "The activation plan must be deeply immutable.");
  }
  if (!plan.transitionIdentity?.goalTransitionDraftId || !plan.transitionIdentity?.sourceGoalId) {
    throw contractError("PAYLOAD_INVALID", "Plan transition identity is incomplete.");
  }
  validateBoundaryShape(plan);

  const mappings = [];
  const unsupportedOperations = [];
  const ambiguousOperations = [];
  for (const operation of plan.operations) {
    const descriptors = dispatchRegistry.filter((candidate) => candidate.operationType === operation.type);
    if (descriptors.length === 0) {
      unsupportedOperations.push(operation.id);
      throw contractError("OPERATION_UNMAPPED", "Plan operation has no dispatch descriptor.", {
        operationId: operation.id, actual: operation.type,
      });
    }
    if (descriptors.length > 1) {
      ambiguousOperations.push(operation.id);
      throw contractError("OPERATION_AMBIGUOUS", "Plan operation has multiple dispatch descriptors.", {
        operationId: operation.id, actual: operation.type,
      });
    }
    const descriptor = descriptors[0];
    validateOperationCompatibility({
      operation,
      descriptor,
      plan,
      repositoryContract,
      assertionRegistry,
      invariantRegistry,
      effectRegistry,
    });
    mappings.push({
      operationId: operation.id,
      operationType: operation.type,
      executionClass: descriptor.executionClass,
      repositoryKey: descriptor.repositoryKey ?? descriptor.boundaryKey,
      methodName: descriptor.methodName,
      handlerId: `${descriptor.repositoryKey ?? descriptor.boundaryKey}.${descriptor.methodName}`,
      payloadSchemaVersion: descriptor.payloadSchemaVersion,
    });
  }

  const coverage = countCoverage(mappings);
  validateBoundaries({ plan, mappings, effectRegistry });
  try {
    validateGoalTransitionActivationPlan(plan);
  } catch (cause) {
    throw contractError("PLAN_INCOMPLETE", "The activation plan failed integrity validation.", {
      actual: cause.code,
    });
  }
  const executingCoordinatorAvailable = availability.executingCoordinator === true;
  const productionActivationBoundaryAvailable = availability.productionActivationBoundary === true;
  const requiredUnavailableEffects = plan.externalEffects.filter((planned) => {
    const registered = effectRegistry.effects[planned.type];
    return registered?.required && !registered.executionAvailable;
  });
  const blockingReasons = [
    ...(!executingCoordinatorAvailable
      ? [{ code: GoalTransitionActivationCoordinatorErrorCode.EXECUTOR_UNAVAILABLE }]
      : []),
    ...(!productionActivationBoundaryAvailable
      ? [{ code: GoalTransitionActivationCoordinatorErrorCode.PRODUCTION_BOUNDARY_UNAVAILABLE }]
      : []),
    ...(requiredUnavailableEffects.length
      ? [{
          code: GoalTransitionActivationCoordinatorErrorCode.EXTERNAL_EXECUTOR_UNAVAILABLE,
          effectTypes: requiredUnavailableEffects.map((planned) => planned.type),
        }]
      : []),
  ];
  const warnings = [{
    code: "ACTIVATION_COORDINATOR_CROSS_PROCESS_LOCKING_UNAVAILABLE",
    boundedScope: "Founder-store compare-and-swap has a documented cross-process TOCTOU window.",
  }];
  if (!Number.isSafeInteger(plan.preCommitRequirements.expectedFounderStoreRevision)) {
    warnings.push({
      code: "ACTIVATION_COORDINATOR_LEGACY_REVISION_NORMALIZATION_REQUIRED",
      boundedScope: "The current plan carries a legacy revision token; the future read adapter must normalize it to the unit-of-work integer revision.",
    });
  }
  const semantic = {
    planId: plan.planId,
    planFingerprint: plan.planFingerprint,
    dispatchRegistry,
    repositoryContract,
    assertionRegistry,
    invariantRegistry,
    effectRegistry,
    stateModel,
    resultContract,
    commitBoundaryContract: {
      owner: "FounderStoreUnitOfWork",
      method: "commit",
      count: 1,
      ambiguousResultMustPreserveCommittedFlag: true,
    },
    publicationBoundaryContract: {
      owner: "FounderStoreUnitOfWork.commit",
      separateRepositoryWrite: false,
      durableCommitRequired: true,
      publicationFailureCommitted: true,
    },
  };
  const compatibilityFingerprint = fingerprint(semantic);
  return deepFreeze({
    compatible: true,
    coordinatorContractComplete: true,
    dispatchRegistryComplete: true,
    stagedRepositoryCoverageComplete: true,
    assertionCoverageComplete: true,
    invariantCoverageComplete: true,
    commitBoundaryCompatible: true,
    publicationBoundaryCompatible: true,
    postCommitEffectCoverageComplete: true,
    executingCoordinatorAvailable,
    productionActivationBoundaryAvailable,
    externalEffectExecutorsAvailable: requiredUnavailableEffects.length === 0,
    executionReady: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    operationMappings: mappings,
    unsupportedOperations,
    ambiguousOperations,
    repositoryCoverage: {
      participatingRepositories: Object.keys(repositoryContract.repositories),
      stagedMutationCount: coverage[C.STAGED_REPOSITORY_MUTATION] ?? 0,
      persistenceDisabled: repositoryContract.persistenceDisabled,
      transactionBound: repositoryContract.transactionBound,
    },
    assertionCoverage: {
      operationCount: coverage[C.READ_ONLY_ASSERTION] ?? 0,
      handlers: Object.keys(assertionRegistry.handlers),
    },
    invariantCoverage: {
      operationCount: coverage[C.STAGED_INVARIANT_VALIDATION] ?? 0,
      recognizedCodes: Object.keys(invariantRegistry.handlers),
    },
    effectCoverage: {
      operationCount: coverage[C.POST_COMMIT_EXTERNAL_EFFECT] ?? 0,
      effects: Object.keys(effectRegistry.effects),
    },
    operationCoverage: {
      total: plan.operations.length,
      accountedForExactlyOnce: mappings.length,
      byExecutionClass: coverage,
    },
    coordinatorStateModel: stateModel,
    coordinatorResultContract: resultContract,
    compatibilityFingerprint,
    evaluatedAt: evaluatedAt instanceof Date ? evaluatedAt.toISOString() : evaluatedAt,
  });
}

export function validateGoalTransitionActivationCoordinatorStateTransition(
  from,
  to,
  stateModel = GoalTransitionActivationCoordinatorStateModel
) {
  if (!(stateModel.transitions[from] ?? []).includes(to)) {
    throw contractError("STATE_TRANSITION_INVALID", "Coordinator state transition is not legal.", {
      actual: `${from}->${to}`,
    });
  }
  return true;
}

export function validateGoalTransitionActivationCoordinatorResult(result) {
  if (!result || !Object.values(GoalTransitionActivationCoordinatorState).includes(result.status)) {
    throw contractError("RESULT_CONTRACT_INVALID", "Coordinator result status is invalid.");
  }
  const preCommitStatus = [S.FAILED_PRE_COMMIT, S.ABORTED].includes(result.status);
  if (preCommitStatus && (result.committed !== false || result.preCommitFailure !== true)) {
    throw contractError("RESULT_CONTRACT_INVALID", "Pre-commit failure must report committed false.");
  }
  const committedStatus = [S.COMMITTED, S.PUBLISHING, S.POST_COMMIT_PENDING, S.COMPLETED, S.FAILED_COMMITTED]
    .includes(result.status);
  if (committedStatus && result.committed !== true) {
    throw contractError("RESULT_CONTRACT_INVALID", "Durably committed states must preserve committed true.");
  }
  if (result.status === S.FAILED_COMMITTED
    && (result.completed !== false || result.postCommitFailure !== true)) {
    throw contractError("RESULT_CONTRACT_INVALID", "Committed failure must report completed false and postCommitFailure true.");
  }
  const requiredPending = (result.pendingExternalEffects ?? []).filter((pending) => pending.required);
  if (result.completed === true
    && (result.status !== S.COMPLETED || requiredPending.length > 0 || result.committed !== true)) {
    throw contractError("RESULT_CONTRACT_INVALID", "Completed result cannot retain required pending effects.");
  }
  if ("stagedState" in result || "stagedFounderStore" in result) {
    throw contractError("RESULT_CONTRACT_INVALID", "Coordinator result cannot expose raw staged state.");
  }
  return true;
}

function validateOperationCompatibility({
  operation,
  descriptor,
  plan,
  repositoryContract,
  assertionRegistry,
  invariantRegistry,
  effectRegistry,
}) {
  if (operation.phase !== descriptor.allowedPhase) {
    throw contractError("PHASE_UNSUPPORTED", "Operation phase is unsupported by its handler.", {
      operationId: operation.id, actual: operation.phase,
    });
  }
  const stagedMutation = descriptor.executionClass === C.STAGED_REPOSITORY_MUTATION;
  if (stagedMutation && !descriptor.repositoryKey) {
    throw contractError("OPERATION_CLASS_INVALID", "Staged mutation lacks a repository mapping.", {
      operationId: operation.id,
    });
  }
  if (!stagedMutation && descriptor.executionClass === C.READ_ONLY_ASSERTION
    && operation.writeCategory !== "read_only_assertion") {
    throw contractError("OPERATION_CLASS_INVALID", "Mutation operation cannot be classified as read-only.", {
      operationId: operation.id,
    });
  }
  if (operation.phase === Phase.POST_COMMIT_EXTERNAL_EFFECTS
    && descriptor.executionClass !== C.POST_COMMIT_EXTERNAL_EFFECT) {
    throw contractError("OPERATION_CLASS_INVALID", "External effect cannot be classified as a staged mutation.", {
      operationId: operation.id,
    });
  }
  if (/evidence/i.test(descriptor.repositoryKey ?? "")
    || (stagedMutation && /evidence/i.test(operation.repository))) {
    throw contractError("EVIDENCE_OPERATION_FORBIDDEN", "Evidence operations cannot be dispatched.", {
      operationId: operation.id,
    });
  }
  if (["updateHistoricalProtocol", "deleteHistoricalProtocol", "reassignHistoricalOwnership"].includes(descriptor.methodName)
    || ["updateHistoricalProtocol", "deleteHistoricalProtocol", "reassignHistoricalOwnership"].includes(operation.action)) {
    throw contractError("HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN", "Historical protocol mutation cannot be dispatched.", {
      operationId: operation.id,
    });
  }
  if (stagedMutation) {
    const repository = repositoryContract.repositories[descriptor.repositoryKey];
    if (!repository) {
      throw contractError("REPOSITORY_UNAVAILABLE", "Staged repository is not available.", {
        operationId: operation.id, actual: descriptor.repositoryKey,
      });
    }
    if (!repository.methods.includes(descriptor.methodName)
      || repository.rejectingMethods?.includes(descriptor.methodName)) {
      throw contractError("METHOD_UNAVAILABLE", "Staged repository method is not safely available.", {
        operationId: operation.id, actual: descriptor.methodName,
      });
    }
  }
  for (const field of descriptor.requiredPayloadPaths) {
    if (!hasPath(operation.payload, field)) {
      throw contractError("PAYLOAD_INVALID", "Operation payload is incomplete.", {
        operationId: operation.id, field,
      });
    }
  }
  if (!operation.entityId || !Array.isArray(operation.assertions) || !operation.writeCategory) {
    throw contractError("PAYLOAD_INVALID", "Operation identity, assertions, and write category are required.", {
      operationId: operation.id,
    });
  }
  if (operation.type === OperationType.CREATE_FUTURE_PROTOCOL) {
    if (/preview/i.test(operation.entityId)) {
      throw contractError("GROUPED_PREVIEW_ID_FORBIDDEN", "Presentation preview ID cannot be a production protocol ID.", {
        operationId: operation.id,
      });
    }
    if (operation.entityId === operation.sourceEntityId) {
      throw contractError("HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN", "Historical protocol ID cannot be reused as a future ID.", {
        operationId: operation.id,
      });
    }
  }
  if ([
    OperationType.CONSUME_GOAL_TRANSITION_DRAFT,
    OperationType.CONSUME_PROTOCOL_TRANSITION_DRAFT,
  ].includes(operation.type)) {
    const payload = operation.payload;
    const expectedType = operation.type === OperationType.CONSUME_GOAL_TRANSITION_DRAFT
      ? "goal_transition_draft"
      : "protocol_transition_draft";
    if (payload.draftType !== expectedType
      || payload.draftId !== operation.entityId
      || payload.transitionId !== plan.transitionIdentity.goalTransitionDraftId
      || payload.consumedByTransitionId !== payload.transitionId
      || payload.activationPlanId?.source !== "current_immutable_plan_id"
      || payload.activationPlanFingerprint?.source
        !== "current_immutable_plan_fingerprint"
      || payload.activationCommitId !== null
      || payload.activationCommittedRevision !== null
      || typeof payload.executable === "function") {
      throw contractError("PAYLOAD_INVALID", "Draft consumption payload is not authoritative.", {
        operationId: operation.id,
      });
    }
  }
  if (descriptor.executionClass === C.READ_ONLY_ASSERTION
    && !assertionRegistry.handlers[descriptor.methodName]) {
    throw contractError("ASSERTION_HANDLER_MISSING", "Assertion handler is not registered.", {
      operationId: operation.id,
    });
  }
  if (descriptor.executionClass === C.STAGED_INVARIANT_VALIDATION) {
    const codes = operation.payload.invariantCodes ?? [];
    for (const code of codes) {
      if (!invariantRegistry.handlers[code]) {
        throw contractError("INVARIANT_HANDLER_MISSING", "Invariant handler is not registered.", {
          operationId: operation.id, actual: code,
        });
      }
    }
  }
  if (descriptor.executionClass === C.POST_COMMIT_EXTERNAL_EFFECT) {
    if (!effectRegistry.effects[operation.payload.type]) {
      throw contractError("OPERATION_UNMAPPED", "Post-commit effect type is not registered.", {
        operationId: operation.id, actual: operation.payload.type,
      });
    }
    const commit = plan.operations.find((candidate) => candidate.type === OperationType.COMMIT_FOUNDER_STORE);
    if (!commit || operation.order <= commit.order) {
      throw contractError("EXTERNAL_EFFECT_ORDER_INVALID", "External effect must follow commit.", {
        operationId: operation.id,
      });
    }
  }
}

function validateBoundaries({ plan, mappings, effectRegistry }) {
  const commits = plan.operations.filter((operation) => operation.type === OperationType.COMMIT_FOUNDER_STORE);
  const invariants = plan.operations.filter((operation) => operation.type === OperationType.VALIDATE_FINAL_STAGED_STATE);
  const publications = plan.operations.filter((operation) => operation.type === OperationType.PUBLISH_LIVE_RUNTIME);
  if (commits.length !== 1 || invariants.length !== 1 || commits[0].order <= invariants[0].order) {
    throw contractError("COMMIT_BOUNDARY_INVALID", "Exactly one commit must follow exactly one staged invariant node.");
  }
  if (publications.length !== 1 || publications[0].order <= commits[0].order) {
    throw contractError("PUBLICATION_BOUNDARY_INVALID", "Runtime publication must follow commit exactly once.");
  }
  if (mappings.length !== plan.operations.length) {
    throw contractError("OPERATION_UNMAPPED", "Every plan node must be mapped exactly once.");
  }
  for (const planned of plan.externalEffects) {
    if (!effectRegistry.effects[planned.type]) {
      throw contractError("OPERATION_UNMAPPED", "External effect is not classified.", { actual: planned.type });
    }
  }
}

function validateBoundaryShape(plan) {
  const commits = plan.operations.filter((operation) => operation.type === OperationType.COMMIT_FOUNDER_STORE);
  const invariants = plan.operations.filter((operation) => operation.type === OperationType.VALIDATE_FINAL_STAGED_STATE);
  const publications = plan.operations.filter((operation) => operation.type === OperationType.PUBLISH_LIVE_RUNTIME);
  if (commits.length !== 1 || invariants.length !== 1 || commits[0].order <= invariants[0].order) {
    throw contractError("COMMIT_BOUNDARY_INVALID", "Exactly one commit must follow exactly one staged invariant node.");
  }
  if (publications.length !== 1 || publications[0].order <= commits[0].order) {
    throw contractError("PUBLICATION_BOUNDARY_INVALID", "Runtime publication must follow commit exactly once.");
  }
  const earlyExternal = plan.operations.find((operation) =>
    operation.type === OperationType.DECLARE_EXTERNAL_EFFECT && operation.order <= commits[0].order
  );
  if (earlyExternal) {
    throw contractError("EXTERNAL_EFFECT_ORDER_INVALID", "External effect must follow commit.", {
      operationId: earlyExternal.id,
    });
  }
}

function descriptor(operationType, executionClass, options) {
  return {
    operationType,
    executionClass,
    repositoryKey: options.repositoryKey ?? null,
    boundaryKey: options.boundaryKey ?? null,
    methodName: options.methodName,
    payloadValidator: `${operationType.toLowerCase()}_payload_v1`,
    payloadSchemaVersion: "v1",
    resultValidator: `${operationType.toLowerCase()}_result_v1`,
    idempotencyKeyStrategy: "operation_entity_id_plus_plan_id",
    allowedPhase: options.allowedPhase,
    requiredPayloadPaths: options.requiredPayloadPaths ?? [],
    requiresTransaction: options.requiresTransaction ?? executionClass === C.STAGED_REPOSITORY_MUTATION,
    requiresCommit: options.requiresCommit ?? false,
    postCommitOnly: options.postCommitOnly ?? false,
    externalSideEffect: options.externalSideEffect ?? false,
    mutationCategory: executionClass === C.STAGED_REPOSITORY_MUTATION ? "founder_store_staged" : "none",
    supportsDryCompatibilityCheck: true,
    dispatchMode: options.dispatchMode ?? "direct_contract_mapping",
  };
}

function effect(options = {}) {
  return {
    required: options.required ?? false,
    deferred: options.deferred ?? true,
    postCommitOnly: true,
    idempotencyRequired: true,
    retryable: true,
    failureBlocksCompletion: options.failureBlocksCompletion ?? false,
    failureRollsBackFounderStore: false,
    owner: options.owner,
    executionAvailable: options.executionAvailable ?? false,
    automatic: options.automatic ?? false,
  };
}

function countCoverage(mappings) {
  return mappings.reduce((counts, mapping) => ({
    ...counts,
    [mapping.executionClass]: (counts[mapping.executionClass] ?? 0) + 1,
  }), {});
}

function hasPath(value, dottedPath) {
  return dottedPath.split(".").reduce(
    (current, key) => current !== null && current !== undefined
      ? current[key]
      : undefined,
    value
  ) !== undefined;
}

function pascalCase(value) {
  return value.toLowerCase().split("_").map(
    (word) => word.charAt(0).toUpperCase() + word.slice(1)
  ).join("");
}

function validateDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => validateDeepFrozen(child, seen));
}

function isDeepFrozen(value) {
  return validateDeepFrozen(value);
}

function fingerprint(value) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function contractError(shortCode, message, context = {}) {
  return new GoalTransitionActivationCoordinatorContractError(
    GoalTransitionActivationCoordinatorErrorCode[shortCode] ?? shortCode,
    message,
    context
  );
}
