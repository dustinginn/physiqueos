import fs from "node:fs";
import path from "node:path";
import {
  GoalTransitionActivationCoordinatorState as S,
  GoalTransitionActivationDispatchRegistry,
  GoalTransitionActivationExecutionClass as C,
  GoalTransitionActivationPostCommitEffectRegistry,
  validateGoalTransitionActivationCoordinatorCompatibility,
  validateGoalTransitionActivationCoordinatorResult,
  validateGoalTransitionActivationCoordinatorStateTransition,
} from "./GoalTransitionActivationCoordinatorContract";
import {
  GoalTransitionActivationPlanOperationType as T,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import {
  activationFingerprint,
  deepFreezeActivationValue,
} from "./GoalTransitionActivationCanonicalization";
import {
  validateGoalTransitionActivationSourceSnapshotIntegrity,
} from "./GoalTransitionActivationSourceSnapshot";
import {
  assertFinalizedActivationDraftConsumption,
  finalizeActivationDraftConsumptionCandidate,
} from "../../data/repositories/ActivationStagedRepositoryFactory";
import {
  verifyProductionGoalTransitionActivationCapability,
} from "./ProductionGoalTransitionActivationCapability";

export const GoalTransitionActivationExecutionErrorCode = Object.freeze({
  INPUT_INVALID: "ACTIVATION_COORDINATOR_INPUT_INVALID",
  ARTIFACT_MISMATCH: "ACTIVATION_COORDINATOR_ARTIFACT_MISMATCH",
  ISOLATED_STORE_REQUIRED: "ACTIVATION_COORDINATOR_ISOLATED_STORE_REQUIRED",
  PRODUCTION_STORE_FORBIDDEN: "ACTIVATION_COORDINATOR_PRODUCTION_STORE_FORBIDDEN",
  STORE_IDENTITY_MISMATCH: "ACTIVATION_COORDINATOR_STORE_IDENTITY_MISMATCH",
  PRE_EXECUTION_REVALIDATION_FAILED:
    "ACTIVATION_COORDINATOR_PRE_EXECUTION_REVALIDATION_FAILED",
  TRANSACTION_OPEN_FAILED: "ACTIVATION_COORDINATOR_TRANSACTION_OPEN_FAILED",
  STAGED_REPOSITORY_CONSTRUCTION_FAILED:
    "ACTIVATION_COORDINATOR_STAGED_REPOSITORY_CONSTRUCTION_FAILED",
  DEPENDENCY_UNSATISFIED: "ACTIVATION_COORDINATOR_DEPENDENCY_UNSATISFIED",
  DISPATCH_FAILED: "ACTIVATION_COORDINATOR_DISPATCH_FAILED",
  OPERATION_RESULT_INVALID: "ACTIVATION_COORDINATOR_OPERATION_RESULT_INVALID",
  STAGED_INVARIANT_FAILED: "ACTIVATION_COORDINATOR_STAGED_INVARIANT_FAILED",
  PRE_COMMIT_REVALIDATION_FAILED:
    "ACTIVATION_COORDINATOR_PRE_COMMIT_REVALIDATION_FAILED",
  COMMIT_FAILED: "ACTIVATION_COORDINATOR_COMMIT_FAILED",
  PUBLICATION_FAILED: "ACTIVATION_COORDINATOR_PUBLICATION_FAILED",
  POST_COMMIT_EFFECT_FAILED: "ACTIVATION_COORDINATOR_POST_COMMIT_EFFECT_FAILED",
  EXTERNAL_EFFECT_PENDING: "ACTIVATION_COORDINATOR_EXTERNAL_EFFECT_PENDING",
  ALREADY_EXECUTED: "ACTIVATION_COORDINATOR_ALREADY_EXECUTED",
});

export class GoalTransitionActivationExecutionError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "GoalTransitionActivationExecutionError";
    this.code = code;
    this.operationId = options.operationId ?? null;
    this.failureStage = options.failureStage ?? null;
  }
}

export function createGoalTransitionActivationCoordinator(dependencies = {}) {
  let attempted = false;
  return Object.freeze({
    async execute(artifacts = {}) {
      if (attempted) {
        throw executionError("ALREADY_EXECUTED", "Coordinator execution instances are single use.");
      }
      attempted = true;
      return executeOnce({ ...dependencies, ...artifacts });
    },
  });
}

export async function executeGoalTransitionActivation(input = {}) {
  return createGoalTransitionActivationCoordinator(input).execute();
}

async function executeOnce({
  validatorResult,
  plan,
  compatibility,
  sourceSnapshot,
  sourceSnapshotAdapter,
  unitOfWork,
  stagedRepositoryFactory,
  externalEffectHandlers = {},
  isolation,
  productionCapability,
  finalReviewTokenIdentity,
  clock = () => new Date(),
} = {}) {
  const history = [];
  let state = S.IDLE;
  let transaction = null;
  let repositories = null;
  let failedOperationId = null;
  let failureStage = null;
  const executed = [];
  const skipped = [];
  const transition = (next) => {
    validateGoalTransitionActivationCoordinatorStateTransition(state, next);
    state = next;
    history.push(Object.freeze({ state: next, at: nowIso(clock) }));
  };
  const baseResult = () => ({
    transitionIdentity: plan?.transitionIdentity ?? sourceSnapshot?.transitionIdentity ?? null,
    planId: plan?.planId ?? null,
    planFingerprint: plan?.planFingerprint ?? null,
    expectedRevision: sourceSnapshot?.normalizedRevision ?? null,
    committedRevision: null,
    commitId: null,
    executedOperationIds: [...executed],
    skippedOperationIds: [...skipped],
    failedOperationId,
    failureStage,
    errorCode: null,
    errorMessage: null,
    preCommitFailure: false,
    postCommitFailure: false,
    postCommitEffects: [],
    pendingExternalEffects: [],
    warnings: [],
    startedAt: history[0]?.at ?? nowIso(clock),
    committedAt: null,
    completedAt: null,
    stateTransitions: [...history],
  });

  transition(S.VALIDATING);
  try {
    validateExecutionInputs({
      validatorResult,
      plan,
      compatibility,
      sourceSnapshot,
      sourceSnapshotAdapter,
      unitOfWork,
      stagedRepositoryFactory,
      isolation,
      productionCapability,
      finalReviewTokenIdentity,
    });
  } catch (cause) {
    return preCommitFailure({ cause, transition, baseResult });
  }

  let preExecution;
  try {
    preExecution = await sourceSnapshotAdapter.preExecution({
      validatorResult,
      plan,
      coordinatorCompatibility: compatibility,
      originalSnapshot: sourceSnapshot,
    });
    if (!preExecution?.passed
      || preExecution.normalizedRevision !== sourceSnapshot.normalizedRevision) {
      throw executionError(
        "PRE_EXECUTION_REVALIDATION_FAILED",
        "Pre-execution source revalidation failed."
      );
    }
  } catch (cause) {
    return preCommitFailure({
      cause: normalizeExecutionError(
        cause,
        "PRE_EXECUTION_REVALIDATION_FAILED",
        "Pre-execution source revalidation failed."
      ),
      transition,
      baseResult,
    });
  }

  transition(S.PLANNING);
  transition(S.OPENING_TRANSACTION);
  try {
    transaction = unitOfWork.begin();
    if (transaction.expectedRevision !== sourceSnapshot.normalizedRevision) {
      throw executionError(
        "STORE_IDENTITY_MISMATCH",
        "Transaction revision is not bound to the source snapshot."
      );
    }
  } catch (cause) {
    return preCommitFailure({
      cause: normalizeExecutionError(
        cause,
        "TRANSACTION_OPEN_FAILED",
        "Founder-store transaction could not be opened."
      ),
      transition,
      baseResult,
    });
  }

  transition(S.STAGING);
  try {
    await transaction.mutate(async (stagedFounderStore) => {
      try {
        repositories = stagedRepositoryFactory({
          stagedFounderStore,
          transaction,
          futureProtocolPlan: planFutureProtocolIdentities(plan),
          now: () => asDate(clock),
        });
        validateRepositorySet({ repositories, transaction, plan });
      } catch (cause) {
        throw executionError(
          "STAGED_REPOSITORY_CONSTRUCTION_FAILED",
          "Staged repositories could not be constructed.",
          { cause, failureStage: "staged_repository_construction" }
        );
      }

      for (const operation of [...plan.operations].sort((a, b) => a.order - b.order)) {
        if ([T.COMMIT_FOUNDER_STORE, T.PUBLISH_LIVE_RUNTIME, T.DECLARE_EXTERNAL_EFFECT]
          .includes(operation.type)) continue;
        failedOperationId = operation.id;
        failureStage = operation.phase;
        assertDependencies(operation, executed);

        if (operation.type === T.ASSERT_SOURCE_STATE) {
          executed.push(operation.id);
          continue;
        }
        if (operation.type === T.VALIDATE_FINAL_STAGED_STATE) {
          transition(S.VALIDATING_STAGED_STATE);
          assertFinalStagedState({ repositories, plan, sourceSnapshot });
          executed.push(operation.id);
          continue;
        }
        await dispatchStagedMutation({ operation, repositories, clock, plan });
        executed.push(operation.id);
      }
    });
    failedOperationId = null;
    failureStage = null;
  } catch (cause) {
    abortIfOpen(transaction);
    const code = cause?.code === E.STAGED_REPOSITORY_CONSTRUCTION_FAILED
      ? "STAGED_REPOSITORY_CONSTRUCTION_FAILED"
      : failedOperationId?.includes("validate_final_staged_state")
        ? "STAGED_INVARIANT_FAILED"
        : cause?.code === E.DEPENDENCY_UNSATISFIED
          ? "DEPENDENCY_UNSATISFIED"
          : "DISPATCH_FAILED";
    return preCommitFailure({
      cause: normalizeExecutionError(cause, code, "Staged activation dispatch failed.", {
        operationId: failedOperationId,
        failureStage,
      }),
      transition,
      baseResult,
    });
  }

  try {
    const preCommit = await sourceSnapshotAdapter.preCommit({
      validatorResult,
      plan,
      coordinatorCompatibility: compatibility,
      originalSnapshot: sourceSnapshot,
      transactionExpectedRevision: transaction.expectedRevision,
    });
    if (!preCommit?.passed) {
      throw executionError(
        "PRE_COMMIT_REVALIDATION_FAILED",
        "Pre-commit source revalidation failed."
      );
    }
  } catch (cause) {
    abortIfOpen(transaction);
    return preCommitFailure({
      cause: normalizeExecutionError(
        cause,
        "PRE_COMMIT_REVALIDATION_FAILED",
        "Pre-commit source revalidation failed."
      ),
      transition,
      baseResult,
    });
  }

  const commitOperation = plan.operations.find((operation) => operation.type === T.COMMIT_FOUNDER_STORE);
  failedOperationId = commitOperation.id;
  failureStage = commitOperation.phase;
  assertDependencies(commitOperation, executed);
  transition(S.COMMITTING);
  let commitResult;
  try {
    commitResult = await transaction.commit({
      validate: () => assertFinalStagedState({ repositories, plan, sourceSnapshot }),
      finalizeCandidate: ({ stagedState, candidateRevision, commitId }) =>
        finalizeActivationDraftConsumptionCandidate({
          candidate: stagedState,
          plan,
          candidateRevision,
          commitId,
        }),
      validateFinalized: (candidate, { candidateRevision, commitId }) =>
        assertFinalizedActivationDraftConsumption({
          candidate,
          plan,
          candidateRevision,
          commitId,
          sourceSnapshot,
        }),
    });
    const commitValidation = validateCommitResult({
      commitResult,
      expectedRevision: transaction.expectedRevision,
    });
    if (!commitValidation.valid) {
      const malformed = executionError(
        "COMMIT_FAILED",
        "Unit of work returned an invalid committed result."
      );
      malformed.committed = commitResult?.committed === true;
      malformed.actualRevision = commitResult?.revision ?? null;
      malformed.commitId = commitResult?.commitId ?? null;
      throw malformed;
    }
    const confirmation = await sourceSnapshotAdapter.confirmCommit({
      committedRevision: commitResult.revision,
      commitId: commitResult.commitId,
      storeIdentity: isolation?.storeIdentity ?? unitOfWork?.binding?.storeIdentity,
    });
    if (confirmation?.confirmed !== true) {
      const unconfirmed = executionError(
        "COMMIT_FAILED",
        "Committed result could not be confirmed against isolated live and persisted state."
      );
      unconfirmed.committed = true;
      unconfirmed.actualRevision = commitResult.revision;
      unconfirmed.commitId = commitResult.commitId;
      throw unconfirmed;
    }
    executed.push(commitOperation.id);
  } catch (cause) {
    const committed = cause?.committed === true;
    if (committed) {
      executed.push(commitOperation.id);
      transition(S.FAILED_COMMITTED);
      const result = {
        ...baseResult(),
        status: S.FAILED_COMMITTED,
        committed: true,
        completed: false,
        committedRevision: cause.actualRevision ?? null,
        commitId: cause.commitId ?? null,
        errorCode: E.PUBLICATION_FAILED,
        errorMessage: "Durable commit succeeded but runtime publication failed.",
        preCommitFailure: false,
        postCommitFailure: true,
        committedAt: history.at(-1)?.at ?? null,
        stateTransitions: [...history],
      };
      validateGoalTransitionActivationCoordinatorResult(result);
      return deepFreezeActivationValue(result);
    }
    return preCommitFailure({
      cause: normalizeExecutionError(cause, "COMMIT_FAILED", "Founder-store commit failed."),
      transition,
      baseResult,
    });
  }

  failedOperationId = null;
  failureStage = null;
  transition(S.COMMITTED);
  transition(S.PUBLISHING);
  const publicationOperation =
    plan.operations.find((operation) => operation.type === T.PUBLISH_LIVE_RUNTIME);
  assertDependencies(publicationOperation, executed);
  executed.push(publicationOperation.id);

  const postCommitEffects = [];
  const pendingExternalEffects = [];
  try {
    for (const operation of plan.operations.filter(
      (candidate) => candidate.type === T.DECLARE_EXTERNAL_EFFECT
    )) {
      assertDependencies(operation, executed);
      const descriptor = compatibilityEffect(compatibility, operation.payload.type);
      const handler = externalEffectHandlers[operation.payload.type];
      const status = {
        operationId: operation.id,
        effectId: operation.payload.id,
        effectType: operation.payload.type,
        idempotencyKey: operation.payload.idempotencyKey,
        required: descriptor.required,
        deferred: descriptor.deferred,
        retryable: descriptor.retryable,
        idempotencyRequired: descriptor.idempotencyRequired,
        failureRollsBackFounderStore: descriptor.failureRollsBackFounderStore,
        status: "deferred",
      };
      if (typeof handler === "function") {
        try {
          const effectInput = deepFreezeActivationValue({
            effect: structuredClone(operation.payload),
            transitionIdentity: structuredClone(plan.transitionIdentity),
            planId: plan.planId,
            committedRevision: commitResult.revision,
            commitId: commitResult.commitId,
          });
          const handlerResult = await handler(effectInput);
          if (handlerResult?.completed !== true
            || handlerResult.idempotencyKey !== operation.payload.idempotencyKey) {
            throw executionError(
              "POST_COMMIT_EFFECT_FAILED",
              "Post-commit handler returned an invalid success result."
            );
          }
          status.status = "completed";
          status.deferred = false;
        } catch (cause) {
          status.status = "failed";
          status.errorCode = E.POST_COMMIT_EFFECT_FAILED;
          postCommitEffects.push(status);
          executed.push(operation.id);
          if (descriptor.failureBlocksCompletion) {
            transition(S.FAILED_COMMITTED);
            const result = committedResult({
              baseResult,
              history,
              state,
              executed,
              commitResult,
              postCommitEffects,
              pendingExternalEffects,
              errorCode: E.POST_COMMIT_EFFECT_FAILED,
              errorMessage: "A required post-commit effect failed.",
              postCommitFailure: true,
            });
            validateGoalTransitionActivationCoordinatorResult(result);
            return deepFreezeActivationValue(result);
          }
          continue;
        }
      } else if (descriptor.required) {
        status.status = "pending";
        status.errorCode = E.EXTERNAL_EFFECT_PENDING;
        pendingExternalEffects.push(status);
      }
      postCommitEffects.push(status);
      executed.push(operation.id);
    }
  } catch (cause) {
    transition(S.FAILED_COMMITTED);
    const result = committedResult({
      baseResult,
      history,
      state,
      executed,
      commitResult,
      postCommitEffects,
      pendingExternalEffects,
      errorCode: cause.code ?? E.POST_COMMIT_EFFECT_FAILED,
      errorMessage: "Post-commit effect processing failed.",
      postCommitFailure: true,
    });
    validateGoalTransitionActivationCoordinatorResult(result);
    return deepFreezeActivationValue(result);
  }

  if (pendingExternalEffects.some((effect) => effect.required)) {
    transition(S.POST_COMMIT_PENDING);
  } else {
    transition(S.COMPLETED);
  }
  const completed = state === S.COMPLETED;
  const result = committedResult({
    baseResult,
    history,
    state,
    executed,
    commitResult,
    postCommitEffects,
    pendingExternalEffects,
    errorCode: completed ? null : E.EXTERNAL_EFFECT_PENDING,
    errorMessage: completed ? null : "Required post-commit effects remain pending.",
    completedAt: completed ? nowIso(clock) : null,
  });
  validateGoalTransitionActivationCoordinatorResult(result);
  return deepFreezeActivationValue(result);
}

const E = GoalTransitionActivationExecutionErrorCode;

function validateExecutionInputs({
  validatorResult,
  plan,
  compatibility,
  sourceSnapshot,
  sourceSnapshotAdapter,
  unitOfWork,
  stagedRepositoryFactory,
  isolation,
  productionCapability,
  finalReviewTokenIdentity,
}) {
  if (!validatorResult || !plan || !compatibility || !sourceSnapshot
    || typeof sourceSnapshotAdapter?.preExecution !== "function"
    || typeof sourceSnapshotAdapter?.preCommit !== "function"
    || typeof sourceSnapshotAdapter?.confirmCommit !== "function"
    || typeof unitOfWork?.begin !== "function"
    || typeof stagedRepositoryFactory !== "function") {
    throw executionError("INPUT_INVALID", "Explicit coordinator artifacts and dependencies are required.");
  }
  validateExecutionBoundary({
    isolation,
    productionCapability,
    finalReviewTokenIdentity,
    plan,
    unitOfWork,
    sourceSnapshot,
    sourceSnapshotAdapter,
  });
  if (!sourceSnapshot.sourceMatches || !sourceSnapshot.artifactsCompatible
    || !compatibility.compatible || !compatibility.coordinatorContractComplete
    || !compatibility.dispatchRegistryComplete
    || !compatibility.stagedRepositoryCoverageComplete) {
    throw executionError("ARTIFACT_MISMATCH", "Activation artifacts are not execution-compatible.");
  }
  try {
    validateGoalTransitionActivationSourceSnapshotIntegrity(sourceSnapshot);
  } catch (cause) {
    throw executionError("ARTIFACT_MISMATCH", "Source snapshot fingerprint changed.", { cause });
  }
  if (!same(plan.transitionIdentity, validatorResult.transitionIdentity)
    || !same(plan.transitionIdentity, sourceSnapshot.transitionIdentity)
    || plan.planId !== `goal_transition_activation_plan_${plan.planFingerprint.slice(0, 24)}`) {
    throw executionError("ARTIFACT_MISMATCH", "Activation artifact identities do not match.");
  }
  let recomputed;
  try {
    recomputed = validateGoalTransitionActivationCoordinatorCompatibility({ plan });
  } catch (cause) {
    throw executionError("ARTIFACT_MISMATCH", "Coordinator compatibility validation failed.", {
      cause,
    });
  }
  if (recomputed.compatibilityFingerprint !== compatibility.compatibilityFingerprint) {
    throw executionError("ARTIFACT_MISMATCH", "Coordinator compatibility fingerprint changed.");
  }
  if (sourceSnapshot.normalizedRevision !== unitOfWork.binding?.expectedRevision
    && unitOfWork.binding?.expectedRevision !== undefined) {
    throw executionError("ARTIFACT_MISMATCH", "Snapshot and unit-of-work revisions differ.");
  }
}

function validateExecutionBoundary(options) {
  if (options.productionCapability) {
    validateProductionBoundary(options);
    return;
  }
  validateIsolation(options);
}

function validateProductionBoundary({
  productionCapability,
  finalReviewTokenIdentity,
  plan,
  unitOfWork,
  sourceSnapshot,
  sourceSnapshotAdapter,
}) {
  const storePath = unitOfWork.binding?.storePath;
  if (!verifyProductionGoalTransitionActivationCapability(productionCapability, {
    storePath,
    transitionIdentity: plan.transitionIdentity,
    finalReviewTokenIdentity,
  }) || unitOfWork.binding?.productionAllowed !== true
    || unitOfWork.binding?.storeKind !== "production"
    || unitOfWork.binding?.isolated === true) {
    throw executionError("PRODUCTION_STORE_FORBIDDEN", "Production capability is invalid.");
  }
  const identities = [
    unitOfWork.binding?.storeIdentity,
    sourceSnapshot.sourceIdentity?.storeIdentity,
    sourceSnapshot.sourceIdentity?.readerIdentity,
    sourceSnapshotAdapter.binding?.storeIdentity,
  ].filter(Boolean);
  const paths = [
    storePath,
    sourceSnapshot.sourceIdentity?.storePath,
    sourceSnapshotAdapter.binding?.storePath,
  ].filter(Boolean).map(normalizedPath);
  if (new Set(identities).size !== 1
    || identities[0] !== "founder_runtime_store"
    || new Set(paths).size !== 1
    || paths[0] !== normalizedPath(productionCapability.canonicalProductionStorePath)) {
    throw executionError("STORE_IDENTITY_MISMATCH", "Production store identities do not match.");
  }
}

function validateIsolation({ isolation, unitOfWork, sourceSnapshot, sourceSnapshotAdapter }) {
  if (!isolation || isolation.isolated !== true || isolation.productionAllowed !== false
    || isolation.productionActivationBoundaryAvailable !== false
    || !["synthetic", "temporary", "test_only"].includes(isolation.storeKind)
    || !isolation.storeIdentity || !isolation.storePath || !isolation.productionStorePath) {
    throw executionError("ISOLATED_STORE_REQUIRED", "Explicit isolated-store metadata is required.");
  }
  const storePath = normalizedPath(isolation.storePath);
  const productionPath = normalizedPath(isolation.productionStorePath);
  if (storePath === productionPath
    || normalizedPath(unitOfWork.binding?.storePath) === productionPath
    || unitOfWork.binding?.productionAllowed === true) {
    throw executionError("PRODUCTION_STORE_FORBIDDEN", "Production founder store execution is forbidden.");
  }
  const identities = [
    isolation.storeIdentity,
    unitOfWork.binding?.storeIdentity,
    sourceSnapshot.sourceIdentity?.storeIdentity,
    sourceSnapshot.sourceIdentity?.readerIdentity,
  ];
  const adapterIdentity = sourceSnapshotAdapter.binding;
  if (new Set(identities.filter(Boolean)).size !== 1
    || unitOfWork.binding?.isolated !== true
    || normalizedPath(unitOfWork.binding?.storePath) !== storePath
    || sourceSnapshot.sourceIdentity?.storePath
      && normalizedPath(sourceSnapshot.sourceIdentity.storePath) !== storePath
    || !adapterIdentity
    || adapterIdentity.storeIdentity !== isolation.storeIdentity
    || normalizedPath(adapterIdentity.storePath) !== storePath) {
    throw executionError("STORE_IDENTITY_MISMATCH", "Isolated store identities do not match.");
  }
}

function validateRepositorySet({ repositories, transaction, plan }) {
  if (!repositories?.metadata?.repositoryParticipation
    || repositories.metadata.persistenceDisabled !== true
    || repositories.metadata.transactionId !== transaction.transactionId
    || repositories.metadata.expectedRevision !== transaction.expectedRevision) {
    throw executionError(
      "STAGED_REPOSITORY_CONSTRUCTION_FAILED",
      "Staged repository metadata is incompatible."
    );
  }
  const requiredRepositories = new Set(
    compatibilityMappingsForPlan(plan)
      .filter((mapping) => mapping.executionClass === C.STAGED_REPOSITORY_MUTATION)
      .map((mapping) => mapping.repositoryKey)
  );
  for (const repositoryKey of requiredRepositories) {
    if (!repositories[repositoryKey]) {
      throw executionError(
        "STAGED_REPOSITORY_CONSTRUCTION_FAILED",
        "A required staged repository is unavailable."
      );
    }
  }
  repositories.assertTransaction(transaction);
}

async function dispatchStagedMutation({ operation, repositories, clock, plan }) {
  const descriptor = GoalTransitionActivationDispatchRegistry.find(
    (candidate) => candidate.operationType === operation.type
  );
  if (!descriptor || descriptor.executionClass !== C.STAGED_REPOSITORY_MUTATION) {
    throw executionError("DISPATCH_FAILED", "Operation is not a registered staged mutation.", {
      operationId: operation.id,
    });
  }
  const repository = repositories[descriptor.repositoryKey];
  const method = repository?.[descriptor.methodName];
  if (typeof method !== "function") {
    throw executionError("DISPATCH_FAILED", "Registered staged handler is unavailable.", {
      operationId: operation.id,
    });
  }
  let payload = materializeClock(operation.payload, clock);
  if (operation.type === T.CREATE_PROTOCOL_VERSION) {
    payload = attachCanonicalProvenanceToProtocolVersion(payload);
  }
  if ([
    T.CONSUME_GOAL_TRANSITION_DRAFT,
    T.CONSUME_PROTOCOL_TRANSITION_DRAFT,
  ].includes(operation.type)) {
    payload = {
      ...payload,
      activationPlanId: plan.planId,
      activationPlanFingerprint: plan.planFingerprint,
    };
  }
  let result;
  switch (operation.type) {
    case T.PRESERVE_SOURCE_HISTORY:
    case T.COMPLETE_SOURCE_GOAL:
    case T.ACTIVATE_TARGET_GOAL:
      result = await method(operation.entityId, payload);
      break;
    case T.CREATE_TARGET_GOAL:
    case T.CREATE_FUTURE_PROTOCOL:
    case T.CREATE_PROTOCOL_VERSION:
    case T.CREATE_COMMITMENT:
    case T.CREATE_REMINDER_INTENT:
    case T.CREATE_SCHEDULER_INTENT:
    case T.UPDATE_COACHING_CADENCE:
    case T.CREATE_PROTOCOL_PROVENANCE:
    case T.CONSUME_GOAL_TRANSITION_DRAFT:
    case T.CONSUME_PROTOCOL_TRANSITION_DRAFT:
      result = await method(payload);
      break;
    case T.LINK_PROTOCOL_TO_GOAL:
      result = await method(payload.protocolId, payload.goalId);
      break;
    case T.RESOLVE_COMPLETION_RECOMMENDATION:
      result = await method(payload.goalId, payload.resolution);
      break;
    default:
      throw executionError("DISPATCH_FAILED", "No staged dispatch invocation contract exists.", {
        operationId: operation.id,
      });
  }
  if (result === null || result === undefined) {
    throw executionError("OPERATION_RESULT_INVALID", "Staged operation returned no result.", {
      operationId: operation.id,
    });
  }
}

function assertFinalStagedState({ repositories, plan, sourceSnapshot }) {
  const repositoryIntegrity = repositories.assertIntegrity();
  if (repositoryIntegrity?.valid !== true) {
    throw executionError("STAGED_INVARIANT_FAILED", "Repository integrity rejected staged state.");
  }
  const staged = repositories.inspectStagedState();
  const sourceGoalId = plan.transitionIdentity.sourceGoalId;
  const targetGoalId = plan.transitionIdentity.targetGoalDraftId;
  const source = staged.goals?.find((goal) => goal.id === sourceGoalId);
  const target = staged.goals?.find((goal) => goal.id === targetGoalId);
  const futureIds = new Set(planFutureProtocolIdentities(plan).map((item) => item.id));
  const futureProtocols = (staged.protocols ?? []).filter((item) => futureIds.has(item.id));
  const futureVersions = (staged.protocolVersions ?? []).filter(
    (item) => futureIds.has(item.protocolId)
  );
  const commitmentIds = operationEntityIds(plan, T.CREATE_COMMITMENT);
  const reminderIds = operationEntityIds(plan, T.CREATE_REMINDER_INTENT);
  const schedulerIds = operationEntityIds(plan, T.CREATE_SCHEDULER_INTENT);
  const baseline = sourceSnapshot.sourceState;
  const historicalProtocolIds = new Set(baseline.protocols.map((item) => item.id));
  const historicalVersionIds = new Set(baseline.protocolVersions.map((item) => item.id));
  const futureVersionIds = new Set(
    plan.operations.filter((operation) => operation.type === T.CREATE_PROTOCOL_VERSION)
      .map((operation) => operation.entityId)
  );
  const stagedCommitmentIds = (staged.executionItems ?? [])
    .filter((item) => commitmentIds.includes(item.id));
  const stagedReminderIds = (staged.reminders ?? [])
    .filter((item) => reminderIds.includes(item.id));
  const stagedSchedulerIds = (staged.reminders ?? [])
    .filter((item) => schedulerIds.includes(item.id));
  const baselineSource = baseline.goals.find((goal) => goal.id === sourceGoalId);
  const consumedGoalDraft = (staged.goalTransitionDrafts ?? []).find(
    (draft) => draft.id === plan.transitionIdentity.goalTransitionDraftId
  );
  const consumedProtocolDraft = (staged.goalProtocolTransitionDrafts ?? []).find(
    (draft) => draft.id === plan.transitionIdentity.protocolTransitionDraftId
  );
  const allowedSourceLifecycleFields = new Set([
    "activationHistory",
    "status",
    "primary",
    "completedAt",
    "transitionReady",
    "completion",
    "completionRecommendationResolution",
    "updatedAt",
  ]);
  const activePrimary = (staged.goals ?? []).filter(
    (goal) => goal.primary === true && goal.status === "active"
  );
  const checks = [
    source && source.status === "completed" && source.primary === false,
    same(
      omitFields(source, allowedSourceLifecycleFields),
      omitFields(baselineSource, allowedSourceLifecycleFields)
    ),
    target && target.status === "active" && target.primary === true,
    target?.id === targetGoalId
      && target.createdFromTransitionId === plan.transitionIdentity.goalTransitionDraftId,
    activePrimary.length === 1 && activePrimary[0].id === targetGoalId,
    same(target.openingApproach, sourceSnapshot.sourceState.goalDraft.operatingState),
    same(target.guardrails, sourceSnapshot.sourceState.goalDraft.guardrails),
    futureProtocols.length === plan.expectedWriteCounts.futureProtocolRecords,
    futureVersions.length === plan.expectedWriteCounts.futureProtocolRecords,
    (staged.protocols ?? []).length
      === baseline.protocols.length + plan.expectedWriteCounts.futureProtocolRecords,
    (staged.protocolVersions ?? []).length
      === baseline.protocolVersions.length + plan.expectedWriteCounts.futureProtocolRecords,
    baseline.protocols.every((historical) =>
      historicalProtocolIds.has(historical.id)
      && same(
        historical,
        (staged.protocols ?? []).find((item) => item.id === historical.id)
      )
    ),
    baseline.protocolVersions.every((historical) =>
      historicalVersionIds.has(historical.id)
      && same(
        historical,
        (staged.protocolVersions ?? []).find((item) => item.id === historical.id)
      )
    ),
    futureVersions.every((version) =>
      futureVersionIds.has(version.id) && futureIds.has(version.protocolId)
    ),
    futureProtocols.every((protocol) =>
      protocol.activationProvenance?.ownershipTransferred === false
      && protocol.relatedGoalIds?.includes(targetGoalId)
      && !/preview/i.test(protocol.id)
      && protocol.status === "planned"
    ),
    futureVersions.every((version) => version.status === "planned"),
    (staged.executionItems ?? []).length
      === baseline.executionItems.length + commitmentIds.length,
    stagedCommitmentIds.length === commitmentIds.length,
    commitmentIds.every((id) =>
      stagedCommitmentIds.some((item) =>
        item.id === id && futureIds.has(item.sourceProtocolId)
      )
    ),
    stagedReminderIds.length === reminderIds.length,
    (staged.reminders ?? []).length
      === baseline.reminders.length + reminderIds.length + schedulerIds.length,
    reminderIds.every((id) => stagedReminderIds.some((item) =>
      item.id === id
      && commitmentIds.includes(item.linkedEntityId)
      && futureIds.has(item.sourceProtocolId)
    )),
    stagedSchedulerIds.length === schedulerIds.length,
    schedulerIds.every((id) => stagedSchedulerIds.some((item) =>
      item.id === id
      && item.intentType === "apply_goal_transition_schedule"
      && item.status === "pending_after_commit"
      && item.idempotencyKey === `${plan.transitionIdentity.goalTransitionDraftId}:scheduler`
    )),
    staged.operatingPlan?.coachingCadence?.type === "twice_weekly",
    source.completionRecommendationResolution?.transitionId
      === plan.transitionIdentity.goalTransitionDraftId,
    validStagedConsumptionIntent({
      draft: consumedGoalDraft,
      plan,
      expectedFingerprint: plan.sourceRevisions.goalDraft,
    }),
    validStagedConsumptionIntent({
      draft: consumedProtocolDraft,
      plan,
      expectedFingerprint: plan.sourceRevisions.protocolDraft,
    }),
    (staged.goalTransitionDrafts ?? []).length
      === (baseline.goalTransitionDrafts ?? []).length,
    (staged.goalProtocolTransitionDrafts ?? []).length
      === (baseline.goalProtocolTransitionDrafts ?? []).length,
    same(
      staged.completionRecommendation
        ?? source.completionRecommendation
        ?? { userDecisionPending: true },
      baseline.completionRecommendation
    ),
    same(staged.evidenceRelationships ?? [], baseline.evidenceRelationships ?? []),
    transactionRevision(staged) === sourceSnapshot.normalizedRevision,
  ];
  const failedInvariantIndex = checks.findIndex((passed) => !passed);
  if (failedInvariantIndex >= 0) {
    throw executionError(
      "STAGED_INVARIANT_FAILED",
      `Final staged activation invariant ${failedInvariantIndex + 1} failed.`
    );
  }
  return { valid: true };
}

function validStagedConsumptionIntent({ draft, plan, expectedFingerprint }) {
  const consumption = draft?.activationConsumption;
  return draft?.status === "applied"
    && draft.consumed === true
    && Boolean(draft.consumedAt)
    && consumption?.pendingCommitMetadata === true
    && consumption.activationCommitId === null
    && consumption.activationCommittedRevision === null
    && consumption.consumedByTransitionId
      === plan.transitionIdentity.goalTransitionDraftId
    && consumption.activationPlanId === plan.planId
    && consumption.activationPlanFingerprint === plan.planFingerprint
    && consumption.draftFingerprintAtConsumption === expectedFingerprint;
}

function preCommitFailure({ cause, transition, baseResult }) {
  transition(S.FAILED_PRE_COMMIT);
  const result = {
    ...baseResult(),
    status: S.FAILED_PRE_COMMIT,
    committed: false,
    completed: false,
    errorCode: cause.code ?? E.DISPATCH_FAILED,
    errorMessage: cause.message ?? "Activation failed before commit.",
    preCommitFailure: true,
    postCommitFailure: false,
  };
  validateGoalTransitionActivationCoordinatorResult(result);
  return deepFreezeActivationValue(result);
}

function committedResult({
  baseResult,
  history,
  state,
  executed,
  commitResult,
  postCommitEffects,
  pendingExternalEffects,
  errorCode,
  errorMessage,
  postCommitFailure = false,
  completedAt = null,
}) {
  return {
    ...baseResult(),
    status: state,
    committed: true,
    completed: state === S.COMPLETED,
    committedRevision: commitResult.revision,
    commitId: commitResult.commitId,
    executedOperationIds: [...executed],
    errorCode,
    errorMessage,
    preCommitFailure: false,
    postCommitFailure,
    postCommitEffects,
    pendingExternalEffects,
    committedAt: history.find((entry) => entry.state === S.COMMITTED)?.at
      ?? history.find((entry) => entry.state === S.FAILED_COMMITTED)?.at
      ?? null,
    completedAt,
    stateTransitions: [...history],
  };
}

function assertDependencies(operation, executed) {
  const complete = new Set(executed);
  const missing = operation.dependsOn.filter((id) => !complete.has(id));
  if (missing.length) {
    throw executionError("DEPENDENCY_UNSATISFIED", "Operation dependency is not complete.", {
      operationId: operation.id,
    });
  }
}

function compatibilityMappingsForPlan(plan) {
  return plan.operations.map((operation) => {
    const descriptor = GoalTransitionActivationDispatchRegistry.find(
      (candidate) => candidate.operationType === operation.type
    );
    return {
      executionClass: descriptor?.executionClass,
      repositoryKey: descriptor?.repositoryKey,
    };
  });
}

function compatibilityEffect(compatibility, effectType) {
  const registered = compatibility.effectCoverage?.effects?.includes(effectType);
  const descriptor = GoalTransitionActivationPostCommitEffectRegistry.effects[effectType];
  if (!registered || !descriptor) {
    throw executionError("DISPATCH_FAILED", "External effect is not compatibility-registered.");
  }
  return descriptor;
}

function planFutureProtocolIdentities(plan) {
  return plan.operations
    .filter((operation) => operation.type === T.CREATE_FUTURE_PROTOCOL)
    .map((operation) => ({
      id: operation.payload.id,
      reviewId: operation.payload.reviewId,
      sourceProtocolId: operation.payload.sourceProtocolId,
      category: operation.payload.category,
      transitionId: plan.transitionIdentity.goalTransitionDraftId,
    }));
}

function operationEntityIds(plan, type) {
  return plan.operations.filter((operation) => operation.type === type)
    .map((operation) => operation.entityId);
}

function materializeClock(value, clock) {
  if (Array.isArray(value)) return value.map((item) => materializeClock(item, clock));
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && value.source === "coordinator_commit_clock") {
      return nowIso(clock);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, materializeClock(child, clock)])
    );
  }
  return value;
}

function abortIfOpen(transaction) {
  if (transaction?.status === "open") {
    try {
      transaction.abort();
    } catch {
      // The original failure remains authoritative.
    }
  }
}

function normalizeExecutionError(cause, shortCode, message, context = {}) {
  const executionCause = findExecutionError(cause);
  if (executionCause) return executionCause;
  return executionError(shortCode, message, { ...context, cause });
}

function findExecutionError(cause) {
  let current = cause;
  const visited = new Set();
  while (current && typeof current === "object" && !visited.has(current)) {
    if (current instanceof GoalTransitionActivationExecutionError) return current;
    visited.add(current);
    current = current.cause;
  }
  return null;
}

function executionError(shortCode, message, options = {}) {
  return new GoalTransitionActivationExecutionError(
    E[shortCode] ?? shortCode,
    message,
    options
  );
}

function same(left, right) {
  return activationFingerprint(left) === activationFingerprint(right);
}

function normalizedPath(value) {
  if (!value) return "";
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved).toLowerCase();
  } catch {
    return resolved.toLowerCase();
  }
}

function validateCommitResult({ commitResult, expectedRevision }) {
  return {
    valid: commitResult?.committed === true
      && commitResult.revision === expectedRevision + 1
      && typeof commitResult.commitId === "string"
      && commitResult.commitId.length > 0,
  };
}

function omitFields(value, excluded) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([key]) => !excluded.has(key))
  );
}

function transactionRevision(staged) {
  return Number.isSafeInteger(staged.revision) ? staged.revision : 0;
}

function asDate(clock) {
  const value = clock();
  return value instanceof Date ? value : new Date(value);
}

function nowIso(clock) {
  return asDate(clock).toISOString();
}
import { attachCanonicalProvenanceToProtocolVersion } from "./FutureProtocolProvenanceService";
