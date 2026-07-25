import { createHash } from "node:crypto";
import { getActivationStagedRepositoryCapabilities } from "../../data/repositories/ActivationStagedRepositoryFactory";

export const GoalTransitionActivationPlanVersion = "goal_transition_activation_plan_v1";

export const GoalTransitionActivationPlanPhase = Object.freeze({
  PRECONDITION_ASSERTIONS: "PRECONDITION_ASSERTIONS",
  SOURCE_GOAL_COMPLETION: "SOURCE_GOAL_COMPLETION",
  TARGET_GOAL_CREATION: "TARGET_GOAL_CREATION",
  FUTURE_PROTOCOL_CREATION: "FUTURE_PROTOCOL_CREATION",
  PROTOCOL_VERSION_CREATION: "PROTOCOL_VERSION_CREATION",
  PROTOCOL_PROVENANCE_CREATION: "PROTOCOL_PROVENANCE_CREATION",
  PROTOCOL_OWNERSHIP_LINKING: "PROTOCOL_OWNERSHIP_LINKING",
  COMMITMENT_CREATION: "COMMITMENT_CREATION",
  REMINDER_AND_SCHEDULER_INTENT: "REMINDER_AND_SCHEDULER_INTENT",
  COACHING_AND_BRIEFING_CADENCE: "COACHING_AND_BRIEFING_CADENCE",
  COMPLETION_RECOMMENDATION_RESOLUTION: "COMPLETION_RECOMMENDATION_RESOLUTION",
  TARGET_GOAL_ACTIVATION: "TARGET_GOAL_ACTIVATION",
  TRANSITION_DRAFT_CONSUMPTION: "TRANSITION_DRAFT_CONSUMPTION",
  FINAL_STAGED_INVARIANT_VALIDATION: "FINAL_STAGED_INVARIANT_VALIDATION",
  COMMIT: "COMMIT",
  POST_COMMIT_PUBLICATION: "POST_COMMIT_PUBLICATION",
  POST_COMMIT_EXTERNAL_EFFECTS: "POST_COMMIT_EXTERNAL_EFFECTS",
});

export const GoalTransitionActivationPlanOperationType = Object.freeze({
  ASSERT_SOURCE_STATE: "ASSERT_SOURCE_STATE",
  PRESERVE_SOURCE_HISTORY: "PRESERVE_SOURCE_HISTORY",
  COMPLETE_SOURCE_GOAL: "COMPLETE_SOURCE_GOAL",
  CREATE_TARGET_GOAL: "CREATE_TARGET_GOAL",
  CREATE_FUTURE_PROTOCOL: "CREATE_FUTURE_PROTOCOL",
  CREATE_PROTOCOL_VERSION: "CREATE_PROTOCOL_VERSION",
  CREATE_PROTOCOL_PROVENANCE: "CREATE_PROTOCOL_PROVENANCE",
  LINK_PROTOCOL_TO_GOAL: "LINK_PROTOCOL_TO_GOAL",
  CREATE_COMMITMENT: "CREATE_COMMITMENT",
  CREATE_REMINDER_INTENT: "CREATE_REMINDER_INTENT",
  CREATE_SCHEDULER_INTENT: "CREATE_SCHEDULER_INTENT",
  UPDATE_COACHING_CADENCE: "UPDATE_COACHING_CADENCE",
  RESOLVE_COMPLETION_RECOMMENDATION: "RESOLVE_COMPLETION_RECOMMENDATION",
  ACTIVATE_TARGET_GOAL: "ACTIVATE_TARGET_GOAL",
  CONSUME_GOAL_TRANSITION_DRAFT: "CONSUME_GOAL_TRANSITION_DRAFT",
  CONSUME_PROTOCOL_TRANSITION_DRAFT: "CONSUME_PROTOCOL_TRANSITION_DRAFT",
  VALIDATE_FINAL_STAGED_STATE: "VALIDATE_FINAL_STAGED_STATE",
  COMMIT_FOUNDER_STORE: "COMMIT_FOUNDER_STORE",
  PUBLISH_LIVE_RUNTIME: "PUBLISH_LIVE_RUNTIME",
  DECLARE_EXTERNAL_EFFECT: "DECLARE_EXTERNAL_EFFECT",
});

export const GoalTransitionActivationPlanErrorCode = Object.freeze({
  VALIDATION_RESULT_REQUIRED: "ACTIVATION_PLAN_VALIDATION_RESULT_REQUIRED",
  DRAFT_NOT_READY: "ACTIVATION_PLAN_DRAFT_NOT_READY",
  BLOCKING_REASON_UNSUPPORTED: "ACTIVATION_PLAN_BLOCKING_REASON_UNSUPPORTED",
  VALIDATED_DRAFT_MISSING: "ACTIVATION_PLAN_VALIDATED_DRAFT_MISSING",
  TRANSITION_IDENTITY_MISSING: "ACTIVATION_PLAN_TRANSITION_IDENTITY_MISSING",
  SOURCE_REVISIONS_MISSING: "ACTIVATION_PLAN_SOURCE_REVISIONS_MISSING",
  FUTURE_PROTOCOL_PLAN_MISSING: "ACTIVATION_PLAN_FUTURE_PROTOCOL_PLAN_MISSING",
  EXPECTED_COUNT_MISMATCH: "ACTIVATION_PLAN_EXPECTED_COUNT_MISMATCH",
  OPERATION_ID_DUPLICATE: "ACTIVATION_PLAN_OPERATION_ID_DUPLICATE",
  CREATE_TARGET_DUPLICATE: "ACTIVATION_PLAN_CREATE_TARGET_DUPLICATE",
  DEPENDENCY_INVALID: "ACTIVATION_PLAN_DEPENDENCY_INVALID",
  DEPENDENCY_CYCLE: "ACTIVATION_PLAN_DEPENDENCY_CYCLE",
  PHASE_ORDER_INVALID: "ACTIVATION_PLAN_PHASE_ORDER_INVALID",
  REPOSITORY_UNSUPPORTED: "ACTIVATION_PLAN_REPOSITORY_UNSUPPORTED",
  EVIDENCE_WRITE_FORBIDDEN: "ACTIVATION_PLAN_EVIDENCE_WRITE_FORBIDDEN",
  HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN: "ACTIVATION_PLAN_HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN",
  GROUPED_PREVIEW_ID_FORBIDDEN: "ACTIVATION_PLAN_GROUPED_PREVIEW_ID_FORBIDDEN",
  COMMIT_BOUNDARY_INVALID: "ACTIVATION_PLAN_COMMIT_BOUNDARY_INVALID",
  EXTERNAL_EFFECT_ORDER_INVALID: "ACTIVATION_PLAN_EXTERNAL_EFFECT_ORDER_INVALID",
  FINGERPRINT_MISMATCH: "ACTIVATION_PLAN_FINGERPRINT_MISMATCH",
  INVARIANT_SET_INCOMPLETE: "ACTIVATION_PLAN_INVARIANT_SET_INCOMPLETE",
  STRUCTURE_INVALID: "ACTIVATION_PLAN_STRUCTURE_INVALID",
});

export const PlanningCompatibleValidationBlockers = Object.freeze([
  "ATOMIC_TRANSACTION_UNAVAILABLE",
  "ATOMIC_COMMIT_UNAVAILABLE",
  "ROLLBACK_UNAVAILABLE",
  "STAGED_WRITES_UNAVAILABLE",
  "REVISION_LOCKING_UNAVAILABLE",
  "PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE",
]);

const REQUIRED_REVISION_KEYS = Object.freeze([
  "founderStoreRevision",
  "goalDraft",
  "protocolDraft",
  "activeGoalState",
  "historicalProtocolOwnership",
  "commitmentSourceState",
  "schedulerIntentSourceState",
  "evidenceRelationshipState",
  "activationCriticalState",
]);

export const GoalTransitionActivationStagedInvariantCode = Object.freeze({
  SOURCE_GOAL_EXISTS: "SOURCE_GOAL_EXISTS",
  SOURCE_GOAL_COMPLETED: "SOURCE_GOAL_COMPLETED",
  SOURCE_GOAL_NOT_DELETED: "SOURCE_GOAL_NOT_DELETED",
  SOURCE_GOAL_HISTORY_PRESERVED: "SOURCE_GOAL_HISTORY_PRESERVED",
  TARGET_GOAL_EXISTS: "TARGET_GOAL_EXISTS",
  TARGET_GOAL_SOLE_ACTIVE_PRIMARY: "TARGET_GOAL_SOLE_ACTIVE_PRIMARY",
  TARGET_GOAL_LINKS_SOURCE_TRANSITION: "TARGET_GOAL_LINKS_SOURCE_TRANSITION",
  ACTIVE_PRIMARY_COUNT_ONE: "ACTIVE_PRIMARY_COUNT_ONE",
  FUTURE_PROTOCOL_COUNT_MATCHES: "FUTURE_PROTOCOL_COUNT_MATCHES",
  ACTIVE_REPLACEMENT_COUNT_MATCHES: "ACTIVE_REPLACEMENT_COUNT_MATCHES",
  FUTURE_PROTOCOL_IDS_UNIQUE: "FUTURE_PROTOCOL_IDS_UNIQUE",
  FUTURE_PROTOCOL_IDS_DISTINCT_FROM_HISTORY: "FUTURE_PROTOCOL_IDS_DISTINCT_FROM_HISTORY",
  FUTURE_PROTOCOL_VERSIONS_EXIST: "FUTURE_PROTOCOL_VERSIONS_EXIST",
  FUTURE_PROTOCOL_PROVENANCE_COMPLETE: "FUTURE_PROTOCOL_PROVENANCE_COMPLETE",
  FUTURE_PROTOCOL_OWNERSHIP_COMPLETE: "FUTURE_PROTOCOL_OWNERSHIP_COMPLETE",
  HISTORICAL_PROTOCOL_ROOTS_UNCHANGED: "HISTORICAL_PROTOCOL_ROOTS_UNCHANGED",
  HISTORICAL_PROTOCOL_VERSIONS_UNCHANGED: "HISTORICAL_PROTOCOL_VERSIONS_UNCHANGED",
  HISTORICAL_PROTOCOL_OWNERSHIP_UNCHANGED: "HISTORICAL_PROTOCOL_OWNERSHIP_UNCHANGED",
  COMMITMENT_COUNT_MATCHES: "COMMITMENT_COUNT_MATCHES",
  COMMITMENTS_OWNED_BY_FUTURE_PROTOCOLS: "COMMITMENTS_OWNED_BY_FUTURE_PROTOCOLS",
  REMINDER_COUNT_MATCHES: "REMINDER_COUNT_MATCHES",
  REMINDERS_REFERENCE_STAGED_ENTITIES: "REMINDERS_REFERENCE_STAGED_ENTITIES",
  SCHEDULER_INTENT_COUNT_MATCHES: "SCHEDULER_INTENT_COUNT_MATCHES",
  CADENCE_WRITE_COUNT_MATCHES: "CADENCE_WRITE_COUNT_MATCHES",
  COMPLETION_RECOMMENDATION_RESOLVED: "COMPLETION_RECOMMENDATION_RESOLVED",
  HISTORICAL_BRIEFINGS_UNCHANGED: "HISTORICAL_BRIEFINGS_UNCHANGED",
  CANONICAL_EVIDENCE_UNCHANGED: "CANONICAL_EVIDENCE_UNCHANGED",
  EVIDENCE_RELATIONSHIPS_UNCHANGED: "EVIDENCE_RELATIONSHIPS_UNCHANGED",
  NON_CREATING_DISPOSITIONS_HAVE_NO_REPLACEMENTS: "NON_CREATING_DISPOSITIONS_HAVE_NO_REPLACEMENTS",
  EXPECTED_WRITE_COUNTS_RECONCILED: "EXPECTED_WRITE_COUNTS_RECONCILED",
  NO_DANGLING_ACTIVATION_REFERENCES: "NO_DANGLING_ACTIVATION_REFERENCES",
  FOUNDER_STORE_REVISION_MATCHES: "FOUNDER_STORE_REVISION_MATCHES",
  ACTIVATION_FINGERPRINTS_MATCH: "ACTIVATION_FINGERPRINTS_MATCH",
  GOAL_TRANSITION_DRAFT_CONSUMED: "GOAL_TRANSITION_DRAFT_CONSUMED",
  PROTOCOL_TRANSITION_DRAFT_CONSUMED: "PROTOCOL_TRANSITION_DRAFT_CONSUMED",
  TRANSITION_DRAFTS_CONSUMED_TOGETHER: "TRANSITION_DRAFTS_CONSUMED_TOGETHER",
  TRANSITION_DRAFT_CONSUMPTION_IDENTITY_MATCH:
    "TRANSITION_DRAFT_CONSUMPTION_IDENTITY_MATCH",
  TRANSITION_DRAFT_CONSUMPTION_COMMIT_METADATA_MATCH:
    "TRANSITION_DRAFT_CONSUMPTION_COMMIT_METADATA_MATCH",
  TRANSITION_DRAFT_CONSUMPTION_REVISION_MATCH:
    "TRANSITION_DRAFT_CONSUMPTION_REVISION_MATCH",
  TRANSITION_DRAFT_CONSUMPTION_PLAN_MATCH:
    "TRANSITION_DRAFT_CONSUMPTION_PLAN_MATCH",
  TRANSITION_DRAFT_CONTENT_PRESERVED: "TRANSITION_DRAFT_CONTENT_PRESERVED",
  TRANSITION_DRAFT_COUNT_RECONCILED: "TRANSITION_DRAFT_COUNT_RECONCILED",
});

const REQUIRED_INVARIANT_CODES = Object.freeze(Object.values(GoalTransitionActivationStagedInvariantCode));
const MUTATION_PHASES = new Set([
  GoalTransitionActivationPlanPhase.SOURCE_GOAL_COMPLETION,
  GoalTransitionActivationPlanPhase.TARGET_GOAL_CREATION,
  GoalTransitionActivationPlanPhase.FUTURE_PROTOCOL_CREATION,
  GoalTransitionActivationPlanPhase.PROTOCOL_VERSION_CREATION,
  GoalTransitionActivationPlanPhase.PROTOCOL_PROVENANCE_CREATION,
  GoalTransitionActivationPlanPhase.PROTOCOL_OWNERSHIP_LINKING,
  GoalTransitionActivationPlanPhase.COMMITMENT_CREATION,
  GoalTransitionActivationPlanPhase.REMINDER_AND_SCHEDULER_INTENT,
  GoalTransitionActivationPlanPhase.COACHING_AND_BRIEFING_CADENCE,
  GoalTransitionActivationPlanPhase.COMPLETION_RECOMMENDATION_RESOLUTION,
  GoalTransitionActivationPlanPhase.TARGET_GOAL_ACTIVATION,
  GoalTransitionActivationPlanPhase.TRANSITION_DRAFT_CONSUMPTION,
]);
const PHASE_SEQUENCE = Object.freeze(Object.values(GoalTransitionActivationPlanPhase));

export class GoalTransitionActivationPlanError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = "GoalTransitionActivationPlanError";
    this.code = code;
    this.field = context.field ?? null;
    this.expected = context.expected;
    this.actual = context.actual;
    this.operationId = context.operationId ?? null;
  }
}

export function buildGoalTransitionActivationTransactionPlan({
  validationResult,
  builtAt = null,
  executionCapabilities = {},
} = {}) {
  const input = normalizePlanningInput(validationResult);
  const goalDraft = input.validatedGoalDraft.value;
  const protocolDraft = input.validatedProtocolDraft.value;
  const targetGoalId = input.transitionIdentity.targetGoalDraftId;
  const sourceGoalId = input.transitionIdentity.sourceGoalId;
  const operations = [];
  const add = (operation) => {
    const order = operations.length;
    const id = operation.id ?? `activation_op_${String(order).padStart(3, "0")}_${slug(operation.type)}`;
    operations.push({
      id,
      order,
      dependsOn: [...new Set(operation.dependsOn ?? [])],
      rollbackModel: operation.rollbackModel ?? "discard_staged_state_before_atomic_commit",
      sideEffectClass: operation.sideEffectClass ?? "founder_store_staged",
      assertions: operation.assertions ?? [],
      ...operation,
      id,
      order,
    });
    return id;
  };

  const preconditionId = add({
    type: GoalTransitionActivationPlanOperationType.ASSERT_SOURCE_STATE,
    phase: GoalTransitionActivationPlanPhase.PRECONDITION_ASSERTIONS,
    repository: "transactionContext",
    action: "assertSourceRevisions",
    entityType: "activation_transition",
    entityId: input.transitionIdentity.goalTransitionDraftId,
    writeCategory: "read_only_assertion",
    payload: buildSourceRequirements(input),
    expectedEffect: "All authoritative revisions and fingerprints still match.",
    sideEffectClass: "read_only",
    rollbackModel: "no_mutation",
    assertions: REQUIRED_REVISION_KEYS.map((key) => `SOURCE_REVISION_${key}`),
  });
  const preserveSourceId = add({
    type: GoalTransitionActivationPlanOperationType.PRESERVE_SOURCE_HISTORY,
    phase: GoalTransitionActivationPlanPhase.SOURCE_GOAL_COMPLETION,
    repository: "goals",
    action: "updateLifecycle",
    entityType: "goal",
    entityId: sourceGoalId,
    dependsOn: [preconditionId],
    writeCategory: "goal_lifecycle_update",
    payload: {
      activationHistory: {
        transitionId: input.transitionIdentity.goalTransitionDraftId,
        targetGoalId,
        preservationMode: "additive_immutable_chapter",
        preserveProtocolAssociations: true,
        preserveEvidenceRelationships: true,
        preserveBriefingArtifacts: true,
      },
    },
    expectedEffect: "Source goal history is frozen additively without deleting relationships.",
    assertions: ["SOURCE_GOAL_ACTIVE", "HISTORICAL_RELATIONSHIPS_PRESERVED"],
  });
  const completeSourceId = add({
    type: GoalTransitionActivationPlanOperationType.COMPLETE_SOURCE_GOAL,
    phase: GoalTransitionActivationPlanPhase.SOURCE_GOAL_COMPLETION,
    repository: "goals",
    action: "updateLifecycle",
    entityType: "goal",
    entityId: sourceGoalId,
    dependsOn: [preserveSourceId],
    writeCategory: "goal_lifecycle_update",
    payload: {
      status: "completed",
      primary: false,
      completedAt: { source: "coordinator_commit_clock" },
      transitionReady: false,
      completion: {
        status: "confirmed_by_atomic_transition",
        transitionId: input.transitionIdentity.goalTransitionDraftId,
        preserveExistingEvidence: true,
      },
    },
    expectedEffect: "Visible Abs becomes completed but remains historically intact.",
    assertions: ["SOURCE_GOAL_NOT_ALREADY_COMPLETED", "SOURCE_GOAL_NOT_DELETED"],
  });
  const createTargetId = add({
    type: GoalTransitionActivationPlanOperationType.CREATE_TARGET_GOAL,
    phase: GoalTransitionActivationPlanPhase.TARGET_GOAL_CREATION,
    repository: "goals",
    action: "addFutureGoal",
    entityType: "goal",
    entityId: targetGoalId,
    sourceEntityId: sourceGoalId,
    dependsOn: [completeSourceId],
    writeCategory: "goal_creation",
    payload: {
      id: targetGoalId,
      userId: input.transitionIdentity.userId,
      title: goalDraft.primaryObjective.title,
      type: goalDraft.primaryObjective.type,
      primary: false,
      status: "paused",
      openingApproach: structuredClone(goalDraft.operatingState),
      guardrails: structuredClone(goalDraft.guardrails ?? []),
      progressMeasurement: structuredClone(goalDraft.evidenceStrategy),
      coachingCadenceReference: structuredClone(goalDraft.briefingCadence),
      sourceGoalId,
      createdFromTransitionId: input.transitionIdentity.goalTransitionDraftId,
      activationMetadata: { state: "prepared", activateOnlyAfterInvariantValidation: true },
    },
    expectedEffect: "Build Lean Mass exists only as a prepared staged goal.",
    assertions: ["TARGET_GOAL_ID_AVAILABLE", "TARGET_GOAL_NOT_ACTIVE"],
  });

  const protocolNodes = new Map();
  for (const protocolPlan of input.futureProtocolPlan) {
    if (/preview/i.test(protocolPlan.id)) {
      throw planError("GROUPED_PREVIEW_ID_FORBIDDEN", "Preview identity cannot be used as a production protocol ID.", {
        actual: protocolPlan.id,
      });
    }
    const review = (protocolDraft.protocolReviews ?? []).find((item) => item.id === protocolPlan.reviewId);
    const preview = (protocolDraft.protocolDrafts ?? []).find((item) => item.reviewId === protocolPlan.reviewId);
    const rootId = add({
      type: GoalTransitionActivationPlanOperationType.CREATE_FUTURE_PROTOCOL,
      phase: GoalTransitionActivationPlanPhase.FUTURE_PROTOCOL_CREATION,
      repository: "protocols",
      action: "addFutureProtocol",
      entityType: "protocol",
      entityId: protocolPlan.id,
      sourceEntityId: protocolPlan.sourceProtocolId,
      targetEntityId: targetGoalId,
      dependsOn: [createTargetId],
      writeCategory: "future_protocol_record",
      payload: {
        id: protocolPlan.id,
        userId: input.transitionIdentity.userId,
        protocolType: protocolPlan.category,
        category: protocolPlan.category,
        name: review?.name ?? preview?.effectiveSummary ?? protocolPlan.category,
        status: "planned",
        relatedGoalIds: [],
        sourceProtocolId: protocolPlan.sourceProtocolId,
        disposition: protocolPlan.disposition,
        effectiveStrategy: structuredClone(preview?.payload ?? {}),
        reviewId: protocolPlan.reviewId,
      },
      expectedEffect: "A distinct prepared protocol root is staged without changing history.",
      provenance: {
        sourceProtocolId: protocolPlan.sourceProtocolId,
        sourceVersionId: protocolPlan.sourceVersionId ?? null,
      },
      assertions: ["FUTURE_PROTOCOL_ID_RESERVED", "HISTORICAL_PROTOCOL_UNCHANGED"],
    });
    protocolNodes.set(protocolPlan.sourceProtocolId, {
      plan: protocolPlan,
      review,
      preview,
      rootId,
    });
  }
  for (const node of protocolNodes.values()) {
    const { plan: protocolPlan, preview, rootId } = node;
    const versionId = `${protocolPlan.id}_v1`;
    const versionOperationId = add({
      type: GoalTransitionActivationPlanOperationType.CREATE_PROTOCOL_VERSION,
      phase: GoalTransitionActivationPlanPhase.PROTOCOL_VERSION_CREATION,
      repository: "protocolVersions",
      action: "addFutureVersion",
      entityType: "protocol_version",
      entityId: versionId,
      sourceEntityId: protocolPlan.sourceVersionId ?? null,
      targetEntityId: protocolPlan.id,
      dependsOn: [rootId],
      writeCategory: "protocol_version_creation",
      payload: {
        id: versionId,
        protocolId: protocolPlan.id,
        protocolCategory: protocolPlan.category,
        versionNumber: 1,
        status: "planned",
        effectiveAt: { source: "coordinator_commit_clock" },
        change: {
          reason: `Activate ${protocolPlan.disposition} disposition for the new goal.`,
          previousVersionId: protocolPlan.sourceVersionId ?? null,
          reviewedChanges: structuredClone(preview?.payload ?? {}),
        },
        goalLinks: [{ goalId: targetGoalId, relationship: "supports" }],
        confirmation: { authority: "accepted_goal_transition" },
      },
      expectedEffect: "The future root receives one deterministic initial version.",
      assertions: ["FUTURE_VERSION_ID_AVAILABLE", "FUTURE_PROTOCOL_ROOT_EXISTS"],
    });
    node.versionOperationId = versionOperationId;
  }
  for (const node of protocolNodes.values()) {
    const { plan: protocolPlan, rootId, versionOperationId } = node;
    const provenanceId = add({
      type: GoalTransitionActivationPlanOperationType.CREATE_PROTOCOL_PROVENANCE,
      phase: GoalTransitionActivationPlanPhase.PROTOCOL_PROVENANCE_CREATION,
      repository: "protocolRelationships",
      action: "addProvenance",
      entityType: "protocol_provenance",
      entityId: `${protocolPlan.id}_provenance`,
      sourceEntityId: protocolPlan.sourceProtocolId,
      targetEntityId: protocolPlan.id,
      dependsOn: [rootId, versionOperationId],
      writeCategory: "provenance_relationship",
      payload: {
        futureProtocolId: protocolPlan.id,
        sourceProtocolId: protocolPlan.sourceProtocolId,
        sourceVersionId: protocolPlan.sourceVersionId ?? null,
        provenanceSourceType: protocolPlan.provenanceSourceType,
        ownershipTransferred: false,
      },
      expectedEffect: "Lineage is recorded without transferring historical ownership.",
      assertions: ["PROVENANCE_SOURCE_EXISTS", "OWNERSHIP_TRANSFER_FALSE"],
    });
    node.provenanceId = provenanceId;
  }
  for (const node of protocolNodes.values()) {
    const { plan: protocolPlan, rootId } = node;
    const ownershipId = add({
      type: GoalTransitionActivationPlanOperationType.LINK_PROTOCOL_TO_GOAL,
      phase: GoalTransitionActivationPlanPhase.PROTOCOL_OWNERSHIP_LINKING,
      repository: "protocolRelationships",
      action: "linkFutureProtocolToGoal",
      entityType: "protocol_goal_relationship",
      entityId: `${protocolPlan.id}_to_${targetGoalId}`,
      sourceEntityId: protocolPlan.id,
      targetEntityId: targetGoalId,
      dependsOn: [rootId, createTargetId],
      writeCategory: "active_protocol_goal_relationship",
      payload: { protocolId: protocolPlan.id, goalId: targetGoalId },
      expectedEffect: "Only the future protocol is owned by Build Lean Mass.",
      assertions: ["FUTURE_PROTOCOL_EXISTS", "TARGET_GOAL_EXISTS"],
    });
    node.ownershipId = ownershipId;
  }

  const commitmentIds = [];
  const reminderIds = [];
  const commitmentNodes = [];
  for (const commitment of protocolDraft.generatedCommitments ?? []) {
    const owner = protocolNodes.get(commitment.sourceProtocolId);
    if (!owner) {
      throw planError("STRUCTURE_INVALID", "Commitment cannot resolve a future protocol owner.", {
        actual: commitment.sourceProtocolId,
      });
    }
    const commitmentId = commitment.id;
    const operationId = add({
      type: GoalTransitionActivationPlanOperationType.CREATE_COMMITMENT,
      phase: GoalTransitionActivationPlanPhase.COMMITMENT_CREATION,
      repository: "commitments",
      action: "add",
      entityType: "commitment",
      entityId: commitmentId,
      sourceEntityId: owner.plan.id,
      targetEntityId: targetGoalId,
      dependsOn: [owner.rootId, owner.ownershipId],
      writeCategory: "future_commitment",
      payload: {
        id: commitmentId,
        userId: input.transitionIdentity.userId,
        sourceProtocolId: owner.plan.id,
        linkedGoalIds: [targetGoalId],
        title: commitment.requirement,
        requirement: commitment.requirement,
        frequency: commitment.frequency,
        cadence: { type: normalizeCommitmentCadence(commitment.frequency) },
        active: true,
      },
      expectedEffect: "A commitment owned only by the future protocol is staged.",
      assertions: ["COMMITMENT_ID_AVAILABLE", "FUTURE_PROTOCOL_OWNER_EXISTS"],
    });
    commitmentIds.push(operationId);
    commitmentNodes.push({ commitment, owner, operationId });
  }
  for (const { commitment, owner, operationId } of commitmentNodes) {
    const commitmentId = commitment.id;
    const reminderId = `${commitmentId}_reminder_intent`;
    const reminderOperationId = add({
      type: GoalTransitionActivationPlanOperationType.CREATE_REMINDER_INTENT,
      phase: GoalTransitionActivationPlanPhase.REMINDER_AND_SCHEDULER_INTENT,
      repository: "reminders",
      action: "add",
      entityType: "reminder",
      entityId: reminderId,
      sourceEntityId: commitmentId,
      targetEntityId: owner.plan.id,
      dependsOn: [operationId, owner.rootId],
      writeCategory: "reminder_intent",
      payload: {
        id: reminderId,
        userId: input.transitionIdentity.userId,
        linkedEntityType: "commitment",
        linkedEntityId: commitmentId,
        relatedGoalIds: [targetGoalId],
        sourceProtocolId: owner.plan.id,
        schedule: { cadence: commitment.frequency },
        active: true,
        externalApplicationStatus: "pending_after_commit",
      },
      expectedEffect: "Founder-store reminder intent is staged; no external job runs.",
      assertions: ["REMINDER_ID_AVAILABLE", "COMMITMENT_EXISTS", "EXTERNAL_SCHEDULER_NOT_CALLED"],
    });
    reminderIds.push(reminderOperationId);
  }
  const schedulerIntentId = add({
    type: GoalTransitionActivationPlanOperationType.CREATE_SCHEDULER_INTENT,
    phase: GoalTransitionActivationPlanPhase.REMINDER_AND_SCHEDULER_INTENT,
    repository: "reminders",
    action: "add",
    entityType: "scheduler_intent",
    entityId: `${input.transitionIdentity.goalTransitionDraftId}_scheduler_intent`,
    targetEntityId: targetGoalId,
    dependsOn: [...reminderIds],
    writeCategory: "scheduler_intent",
    payload: {
      id: `${input.transitionIdentity.goalTransitionDraftId}_scheduler_intent`,
      userId: input.transitionIdentity.userId,
      intentType: "apply_goal_transition_schedule",
      status: "pending_after_commit",
      idempotencyKey: `${input.transitionIdentity.goalTransitionDraftId}:scheduler`,
      relatedGoalIds: [targetGoalId],
    },
    expectedEffect: "One durable intent records deferred external scheduling work.",
    assertions: ["SCHEDULER_INTENT_ID_AVAILABLE", "NO_EXTERNAL_EXECUTION_DURING_TRANSACTION"],
  });
  const cadenceId = add({
    type: GoalTransitionActivationPlanOperationType.UPDATE_COACHING_CADENCE,
    phase: GoalTransitionActivationPlanPhase.COACHING_AND_BRIEFING_CADENCE,
    repository: "briefingCadence",
    action: "set",
    entityType: "coaching_cadence",
    entityId: `${targetGoalId}_coaching_cadence`,
    targetEntityId: targetGoalId,
    dependsOn: [createTargetId],
    writeCategory: "briefing_cadence_write",
    payload: structuredClone(goalDraft.briefingCadence),
    expectedEffect: "Twice-weekly coaching cadence is configured without generating briefings.",
    assertions: ["CADENCE_SUPPORTED", "HISTORICAL_BRIEFINGS_UNCHANGED"],
  });
  const resolutionId = add({
    type: GoalTransitionActivationPlanOperationType.RESOLVE_COMPLETION_RECOMMENDATION,
    phase: GoalTransitionActivationPlanPhase.COMPLETION_RECOMMENDATION_RESOLUTION,
    repository: "completionRecommendations",
    action: "resolve",
    entityType: "completion_recommendation",
    entityId: `${sourceGoalId}_completion_recommendation_resolution`,
    sourceEntityId: sourceGoalId,
    targetEntityId: targetGoalId,
    dependsOn: [completeSourceId],
    writeCategory: "completion_recommendation_write",
    payload: {
      goalId: sourceGoalId,
      resolution: {
        status: "resolved_by_atomic_goal_transition",
        transitionId: input.transitionIdentity.goalTransitionDraftId,
        preserveHistoricalBriefing: true,
      },
    },
    expectedEffect: "Resolution metadata is staged without editing the source briefing.",
    assertions: ["SOURCE_COMPLETION_STAGED", "RECOMMENDATION_SOURCE_IMMUTABLE"],
  });
  const activationDependencies = [
    completeSourceId,
    createTargetId,
    ...[...protocolNodes.values()].flatMap((node) => [
      node.versionOperationId,
      node.provenanceId,
      node.ownershipId,
    ]),
    ...commitmentIds,
    ...reminderIds,
    schedulerIntentId,
    cadenceId,
    resolutionId,
  ];
  const activateTargetId = add({
    type: GoalTransitionActivationPlanOperationType.ACTIVATE_TARGET_GOAL,
    phase: GoalTransitionActivationPlanPhase.TARGET_GOAL_ACTIVATION,
    repository: "goals",
    action: "updateLifecycle",
    entityType: "goal",
    entityId: targetGoalId,
    sourceEntityId: sourceGoalId,
    dependsOn: activationDependencies,
    writeCategory: "goal_lifecycle_update",
    payload: {
      status: "active",
      primary: true,
      activatedAt: { source: "coordinator_commit_clock" },
      activationState: "active",
    },
    expectedEffect: "Build Lean Mass becomes the sole active primary goal only after all dependencies.",
    assertions: ["SOURCE_GOAL_COMPLETED", "TARGET_DEPENDENCIES_COMPLETE", "ACTIVE_PRIMARY_COUNT_WILL_EQUAL_ONE"],
  });
  const consumptionTemplate = {
    transitionId: input.transitionIdentity.goalTransitionDraftId,
    consumedByTransitionId: input.transitionIdentity.goalTransitionDraftId,
    expectedStatus: "ready",
    expectedAccepted: true,
    expectedUnconsumed: true,
    sourceGoalId,
    targetGoalId,
    activationPlanId: { source: "current_immutable_plan_id" },
    activationPlanFingerprint: { source: "current_immutable_plan_fingerprint" },
    activationCommitId: null,
    activationCommittedRevision: null,
    consumedAt: { source: "coordinator_commit_clock" },
  };
  const consumeGoalDraftId = add({
    id: `activation_op_${String(operations.length).padStart(3, "0")}_consume_goal_transition_draft`,
    type: GoalTransitionActivationPlanOperationType.CONSUME_GOAL_TRANSITION_DRAFT,
    phase: GoalTransitionActivationPlanPhase.TRANSITION_DRAFT_CONSUMPTION,
    repository: "goalTransitionDrafts",
    action: "consume",
    entityType: "goal_transition_draft",
    entityId: input.transitionIdentity.goalTransitionDraftId,
    dependsOn: [activateTargetId],
    writeCategory: "goal_transition_draft_consumption",
    payload: {
      ...structuredClone(consumptionTemplate),
      draftId: input.transitionIdentity.goalTransitionDraftId,
      draftType: "goal_transition_draft",
      expectedDraftFingerprint: input.sourceRevisions.goalDraft,
    },
    expectedEffect: "The accepted Goal Creation draft is staged as consumed.",
    assertions: [
      "GOAL_DRAFT_ACCEPTED",
      "GOAL_DRAFT_UNCONSUMED",
      "GOAL_DRAFT_FINGERPRINT_MATCHES",
    ],
  });
  const consumeProtocolDraftId = add({
    id: `activation_op_${String(operations.length).padStart(3, "0")}_consume_protocol_transition_draft`,
    type: GoalTransitionActivationPlanOperationType.CONSUME_PROTOCOL_TRANSITION_DRAFT,
    phase: GoalTransitionActivationPlanPhase.TRANSITION_DRAFT_CONSUMPTION,
    repository: "protocolTransitionDrafts",
    action: "consume",
    entityType: "protocol_transition_draft",
    entityId: input.transitionIdentity.protocolTransitionDraftId,
    dependsOn: [activateTargetId, consumeGoalDraftId],
    writeCategory: "protocol_transition_draft_consumption",
    payload: {
      ...structuredClone(consumptionTemplate),
      draftId: input.transitionIdentity.protocolTransitionDraftId,
      draftType: "protocol_transition_draft",
      expectedDraftFingerprint: input.sourceRevisions.protocolDraft,
    },
    expectedEffect: "The accepted Protocol Transition draft is staged as consumed.",
    assertions: [
      "PROTOCOL_DRAFT_ACCEPTED",
      "PROTOCOL_DRAFT_UNCONSUMED",
      "PROTOCOL_DRAFT_FINGERPRINT_MATCHES",
    ],
  });
  const invariantId = add({
    type: GoalTransitionActivationPlanOperationType.VALIDATE_FINAL_STAGED_STATE,
    phase: GoalTransitionActivationPlanPhase.FINAL_STAGED_INVARIANT_VALIDATION,
    repository: "integrity",
    action: "assertIntegrity",
    entityType: "staged_founder_store",
    entityId: input.transitionIdentity.goalTransitionDraftId,
    dependsOn: [consumeGoalDraftId, consumeProtocolDraftId],
    writeCategory: "read_only_assertion",
    payload: { invariantCodes: REQUIRED_INVARIANT_CODES },
    expectedEffect: "Every final staged invariant passes before commit.",
    sideEffectClass: "read_only",
    rollbackModel: "validation_failure_discards_staged_state",
    assertions: REQUIRED_INVARIANT_CODES,
  });
  const commitId = add({
    type: GoalTransitionActivationPlanOperationType.COMMIT_FOUNDER_STORE,
    phase: GoalTransitionActivationPlanPhase.COMMIT,
    repository: "unitOfWork",
    action: "commit",
    entityType: "founder_store",
    entityId: "founder_runtime_store",
    dependsOn: [invariantId],
    writeCategory: "atomic_commit_boundary",
    payload: {
      expectedRevision: input.sourceRevisions.founderStoreRevision,
      commitCount: 1,
      compareAndSwapRequired: true,
    },
    expectedEffect: "One complete founder-store candidate is atomically installed.",
    sideEffectClass: "atomic_persistence",
    rollbackModel: "non_publication_on_pre_commit_failure",
    assertions: ["EXPECTED_REVISION_MATCHES", "FINAL_INVARIANTS_PASSED"],
  });
  const publicationId = add({
    type: GoalTransitionActivationPlanOperationType.PUBLISH_LIVE_RUNTIME,
    phase: GoalTransitionActivationPlanPhase.POST_COMMIT_PUBLICATION,
    repository: "unitOfWork",
    action: "publishCommittedState",
    entityType: "live_founder_runtime",
    entityId: "founder_runtime_singleton",
    dependsOn: [commitId],
    writeCategory: "runtime_publication",
    payload: { publicationCount: 1, onlyAfterDurableCommit: true },
    expectedEffect: "All live repository references observe the same committed revision.",
    sideEffectClass: "post_commit_runtime_publication",
    rollbackModel: "durable_store_remains_authoritative",
    assertions: ["DURABLE_COMMIT_SUCCEEDED"],
  });

  const externalEffects = buildExternalEffects(input);
  for (const effect of externalEffects) {
    add({
      type: GoalTransitionActivationPlanOperationType.DECLARE_EXTERNAL_EFFECT,
      phase: GoalTransitionActivationPlanPhase.POST_COMMIT_EXTERNAL_EFFECTS,
      repository: "externalEffects",
      action: "defer",
      entityType: "external_effect",
      entityId: effect.id,
      dependsOn: [publicationId],
      writeCategory: "post_commit_external_obligation",
      payload: effect,
      expectedEffect: "The effect is declared but not executed by the atomic transaction.",
      sideEffectClass: "post_commit_external",
      rollbackModel: "retry_idempotently_without_domain_rollback",
      assertions: ["DURABLE_COMMIT_SUCCEEDED", "IDEMPOTENCY_REQUIRED"],
    });
  }

  const generatedCounts = countPlannedWrites({
    operations,
    protocolDraft,
    futureProtocolPlan: input.futureProtocolPlan,
  });
  reconcileExpectedCounts(input.expectedWriteCounts, generatedCounts);
  const stagedInvariants = REQUIRED_INVARIANT_CODES.map((code) => ({
    code,
    required: true,
    timing: "after_all_staged_writes_before_commit",
  }));
  const sourceRequirements = buildSourceRequirements(input);
  const executionBlockers = buildExecutionBlockers(input, executionCapabilities);
  const semanticPlan = {
    planVersion: GoalTransitionActivationPlanVersion,
    transitionIdentity: input.transitionIdentity,
    sourceRevisions: input.sourceRevisions,
    sourceRevisionFingerprint: fingerprint(input.sourceRevisions),
    expectedWriteCounts: input.expectedWriteCounts,
    generatedWriteCounts: generatedCounts,
    operations,
    operationGraph: Object.fromEntries(operations.map((operation) => [
      operation.id,
      { order: operation.order, phase: operation.phase, dependsOn: operation.dependsOn },
    ])),
    preCommitRequirements: {
      ...sourceRequirements,
      revalidateBeforeStaging: true,
      revalidateBeforeCommit: true,
    },
    stagedInvariants,
    postCommitRequirements: {
      publicationRequired: true,
      externalEffectsOnlyAfterCommit: true,
      domainRollbackAfterCommitForbidden: true,
    },
    externalEffects,
    deferredWork: externalEffects.filter((effect) => effect.deferred),
    metadata: {
      planningCompatibleValidationBlockers: input.blockingReasons.map((reason) => reason.code),
      repositoryParticipants: getActivationStagedRepositoryCapabilities().participatingRepositories,
      canonicalEvidenceExcluded: true,
      groupedPresentationIdsAllowedAsProductionIds: false,
      operationCount: operations.length,
    },
  };
  const planFingerprint = fingerprint(semanticPlan);
  const planId = `goal_transition_activation_plan_${planFingerprint.slice(0, 24)}`;
  const plan = {
    planId,
    planVersion: GoalTransitionActivationPlanVersion,
    planFingerprint,
    builtAt: builtAt instanceof Date ? builtAt.toISOString() : builtAt,
    planComplete: true,
    executionInfrastructureReady: executionBlockers.length === 0,
    executable: executionBlockers.length === 0,
    executionBlockers,
    ...semanticPlan,
    preCommitRequirements: {
      ...semanticPlan.preCommitRequirements,
      planFingerprint,
    },
  };
  validateGoalTransitionActivationPlan(plan);
  return deepFreeze(plan);
}

export function validateGoalTransitionActivationPlan(plan) {
  if (!plan || !Array.isArray(plan.operations)) {
    throw planError("STRUCTURE_INVALID", "Activation plan operations are required.");
  }
  const ids = new Set();
  const createTargets = new Set();
  const participants = new Set(getActivationStagedRepositoryCapabilities().participatingRepositories);
  const allowedRepositories = new Set([
    ...participants,
    "transactionContext",
    "integrity",
    "unitOfWork",
    "externalEffects",
  ]);
  let invariantOrder = -1;
  let commitOrder = -1;
  const consumptionOrders = [];
  let previousPhaseIndex = -1;
  for (let index = 0; index < plan.operations.length; index += 1) {
    const operation = plan.operations[index];
    if (operation.order !== index) {
      throw planError("PHASE_ORDER_INVALID", "Operation order must be contiguous.", {
        operationId: operation.id, expected: index, actual: operation.order,
      });
    }
    const phaseIndex = PHASE_SEQUENCE.indexOf(operation.phase);
    if (phaseIndex < previousPhaseIndex || phaseIndex < 0) {
      throw planError("PHASE_ORDER_INVALID", "Operation phases must follow the authoritative phase sequence.", {
        operationId: operation.id, actual: operation.phase,
      });
    }
    previousPhaseIndex = phaseIndex;
    if (ids.has(operation.id)) {
      throw planError("OPERATION_ID_DUPLICATE", "Operation IDs must be unique.", {
        operationId: operation.id,
      });
    }
    ids.add(operation.id);
    if (!allowedRepositories.has(operation.repository)) {
      throw planError("REPOSITORY_UNSUPPORTED", "Operation targets an unsupported repository.", {
        operationId: operation.id, actual: operation.repository,
      });
    }
    if (/evidence/i.test(operation.repository) && MUTATION_PHASES.has(operation.phase)) {
      throw planError("EVIDENCE_WRITE_FORBIDDEN", "Evidence repositories cannot appear in activation mutations.", {
        operationId: operation.id,
      });
    }
    if (["updateHistoricalProtocol", "deleteHistoricalProtocol", "reassignHistoricalOwnership"].includes(operation.action)) {
      throw planError("HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN", "Historical protocol mutation is forbidden.", {
        operationId: operation.id,
      });
    }
    if (operation.action.startsWith("add") || operation.action.startsWith("create")) {
      const key = `${operation.entityType}:${operation.entityId}`;
      if (createTargets.has(key)) {
        throw planError("CREATE_TARGET_DUPLICATE", "Create targets must be unique.", {
          operationId: operation.id, actual: key,
        });
      }
      createTargets.add(key);
    }
    for (const dependency of operation.dependsOn ?? []) {
      const dependencyOperation = plan.operations.find((candidate) => candidate.id === dependency);
      if (!dependencyOperation || dependencyOperation.order >= operation.order) {
        throw planError("DEPENDENCY_INVALID", "Dependencies must reference earlier operations.", {
          operationId: operation.id, actual: dependency,
        });
      }
    }
    if (operation.type === GoalTransitionActivationPlanOperationType.VALIDATE_FINAL_STAGED_STATE) {
      invariantOrder = operation.order;
    }
    if ([
      GoalTransitionActivationPlanOperationType.CONSUME_GOAL_TRANSITION_DRAFT,
      GoalTransitionActivationPlanOperationType.CONSUME_PROTOCOL_TRANSITION_DRAFT,
    ].includes(operation.type)) {
      consumptionOrders.push(operation.order);
    }
    if (operation.type === GoalTransitionActivationPlanOperationType.COMMIT_FOUNDER_STORE) {
      commitOrder = operation.order;
    }
    if (operation.phase === GoalTransitionActivationPlanPhase.POST_COMMIT_EXTERNAL_EFFECTS
      && commitOrder < 0) {
      throw planError("EXTERNAL_EFFECT_ORDER_INVALID", "External effects must occur after commit.", {
        operationId: operation.id,
      });
    }
  }
  if (invariantOrder < 0 || commitOrder <= invariantOrder
    || consumptionOrders.length !== 2
    || consumptionOrders.some((order) => order >= invariantOrder)) {
    throw planError("COMMIT_BOUNDARY_INVALID", "Commit must follow final staged invariant validation.");
  }
  const invariantCodes = new Set((plan.stagedInvariants ?? []).map((invariant) => invariant.code));
  if (REQUIRED_INVARIANT_CODES.some((code) => !invariantCodes.has(code))) {
    throw planError("INVARIANT_SET_INCOMPLETE", "The required staged invariant suite is incomplete.");
  }
  if (REQUIRED_REVISION_KEYS.some((key) => !(key in (plan.sourceRevisions ?? {})))) {
    throw planError("SOURCE_REVISIONS_MISSING", "Plan source revisions are incomplete.");
  }
  const semantic = {
    planVersion: plan.planVersion,
    transitionIdentity: plan.transitionIdentity,
    sourceRevisions: plan.sourceRevisions,
    sourceRevisionFingerprint: plan.sourceRevisionFingerprint,
    expectedWriteCounts: plan.expectedWriteCounts,
    generatedWriteCounts: plan.generatedWriteCounts,
    operations: plan.operations,
    operationGraph: plan.operationGraph,
    preCommitRequirements: omitKey(plan.preCommitRequirements, "planFingerprint"),
    stagedInvariants: plan.stagedInvariants,
    postCommitRequirements: plan.postCommitRequirements,
    externalEffects: plan.externalEffects,
    deferredWork: plan.deferredWork,
    metadata: plan.metadata,
  };
  const expectedFingerprint = fingerprint(semantic);
  if (plan.planFingerprint !== expectedFingerprint
    || plan.preCommitRequirements?.planFingerprint !== expectedFingerprint) {
    throw planError("FINGERPRINT_MISMATCH", "Activation plan fingerprint does not match semantic content.");
  }
  return true;
}

function normalizePlanningInput(validationResult) {
  if (!validationResult) {
    throw planError("VALIDATION_RESULT_REQUIRED", "An authoritative validation result is required.");
  }
  const input = structuredClone(validationResult);
  if (input.draftReady !== true) {
    throw planError("DRAFT_NOT_READY", "The accepted transition is not draft-ready.");
  }
  if (!input.validatedGoalDraft?.value || !input.validatedProtocolDraft?.value) {
    throw planError("VALIDATED_DRAFT_MISSING", "Validated draft values are required for deterministic planning.");
  }
  if (!input.transitionIdentity?.goalTransitionDraftId
    || !input.transitionIdentity?.protocolTransitionDraftId
    || !input.transitionIdentity?.sourceGoalId
    || !input.transitionIdentity?.targetGoalDraftId) {
    throw planError("TRANSITION_IDENTITY_MISSING", "Complete transition identity is required.");
  }
  if (!input.sourceRevisions
    || REQUIRED_REVISION_KEYS.some((key) => !(key in input.sourceRevisions))) {
    throw planError("SOURCE_REVISIONS_MISSING", "Complete source revisions are required.");
  }
  if (!Array.isArray(input.futureProtocolPlan) || input.futureProtocolPlan.length === 0) {
    throw planError("FUTURE_PROTOCOL_PLAN_MISSING", "The validator-derived future protocol plan is required.");
  }
  if (!input.expectedWriteCounts || typeof input.expectedWriteCounts !== "object") {
    throw planError("EXPECTED_COUNT_MISMATCH", "Expected write counts are required.");
  }
  for (const reason of input.blockingReasons ?? []) {
    if (!PlanningCompatibleValidationBlockers.includes(reason.code)) {
      throw planError("BLOCKING_REASON_UNSUPPORTED", "Validation contains a non-planning-compatible blocker.", {
        actual: reason.code,
      });
    }
  }
  const goalDraft = input.validatedGoalDraft.value;
  const protocolDraft = input.validatedProtocolDraft.value;
  if (input.validatedGoalDraft.fingerprint !== input.sourceRevisions.goalDraft
    || input.validatedProtocolDraft.fingerprint !== input.sourceRevisions.protocolDraft
    || goalDraft.id !== input.transitionIdentity.goalTransitionDraftId
    || protocolDraft.id !== input.transitionIdentity.protocolTransitionDraftId
    || protocolDraft.goalTransitionDraftId !== goalDraft.id) {
    throw planError("STRUCTURE_INVALID", "Validated drafts and transition identity are inconsistent.");
  }
  return input;
}

function buildSourceRequirements(input) {
  return {
    expectedFounderStoreRevision: input.sourceRevisions.founderStoreRevision,
    activationCriticalFingerprint: input.sourceRevisions.activationCriticalState,
    goalDraftFingerprint: input.sourceRevisions.goalDraft,
    protocolDraftFingerprint: input.sourceRevisions.protocolDraft,
    activeGoalStateFingerprint: input.sourceRevisions.activeGoalState,
    historicalProtocolOwnershipFingerprint: input.sourceRevisions.historicalProtocolOwnership,
    commitmentSourceFingerprint: input.sourceRevisions.commitmentSourceState,
    schedulerSourceFingerprint: input.sourceRevisions.schedulerIntentSourceState,
    evidenceRelationshipFingerprint: input.sourceRevisions.evidenceRelationshipState,
    transitionIdentity: structuredClone(input.transitionIdentity),
  };
}

function buildExecutionBlockers(input, executionCapabilities) {
  const blockers = (input.blockingReasons ?? []).map((reason) => ({
    code: reason.code,
    category: "validation_infrastructure",
  }));
  if (executionCapabilities.activationCoordinator !== true) {
    blockers.push({ code: "ACTIVATION_COORDINATOR_UNAVAILABLE", category: "orchestration" });
  }
  if (executionCapabilities.productionActivationBoundary !== true) {
    blockers.push({ code: "PRODUCTION_ACTIVATION_BOUNDARY_UNAVAILABLE", category: "orchestration" });
  }
  if (executionCapabilities.finalFingerprintRevalidation !== true) {
    blockers.push({ code: "FINAL_FINGERPRINT_REVALIDATION_UNAVAILABLE", category: "orchestration" });
  }
  return blockers;
}

function buildExternalEffects(input) {
  const transitionId = input.transitionIdentity.goalTransitionDraftId;
  return [
    {
      id: `${transitionId}_external_scheduler`,
      type: "EXTERNAL_SCHEDULER_EXECUTION",
      timing: "post_commit_only",
      required: true,
      deferred: true,
      retryModel: "idempotent_retry_from_persisted_intent",
      idempotencyKey: `${transitionId}:scheduler`,
      failureImpact: "founder_store_remains_committed; scheduling remains retryable",
    },
    ...["HOME_RECONCILIATION", "GOALS_RECONCILIATION", "PROTOCOLS_RECONCILIATION", "EVIDENCE_LANDING_RECONCILIATION"]
      .map((type) => ({
        id: `${transitionId}_${type.toLowerCase()}`,
        type,
        timing: "post_commit_only",
        required: false,
        deferred: true,
        retryModel: "idempotent_read_model_refresh",
        idempotencyKey: `${transitionId}:${type.toLowerCase()}`,
        failureImpact: "temporary stale presentation; no domain rollback",
      })),
    {
      id: `${transitionId}_briefing_reconciliation`,
      type: "BRIEFING_REGENERATION_OR_CATCH_UP",
      timing: "post_commit_only",
      required: false,
      deferred: true,
      retryModel: "explicit_future_policy",
      idempotencyKey: `${transitionId}:briefing-reconciliation`,
      failureImpact: "historical briefings remain unchanged",
    },
  ];
}

function countPlannedWrites({ operations, protocolDraft, futureProtocolPlan }) {
  const count = (category) => operations.filter((operation) => operation.writeCategory === category).length;
  const reviews = protocolDraft.protocolReviews ?? [];
  return {
    futureProtocolRecords: count("future_protocol_record"),
    activeReplacementProtocols: futureProtocolPlan.filter((item) => item.active !== false).length,
    pausedProtocols: reviews.filter((review) => review.intendedDisposition === "pause").length,
    leftBehindProtocols: reviews.filter((review) => review.intendedDisposition === "leave_behind").length,
    provenanceRelationships: count("provenance_relationship"),
    activeProtocolGoalRelationships: count("active_protocol_goal_relationship"),
    futureCommitments: count("future_commitment"),
    schedulerIntents: count("scheduler_intent"),
    reminderIntents: count("reminder_intent"),
    briefingCadenceWrites: count("briefing_cadence_write"),
    evidenceWrites: 0,
    goalLifecycleUpdates: count("goal_lifecycle_update"),
    goalCreations: count("goal_creation"),
    protocolVersions: count("protocol_version_creation"),
    completionRecommendationWrites: count("completion_recommendation_write"),
    goalTransitionDraftConsumptions: count("goal_transition_draft_consumption"),
    protocolTransitionDraftConsumptions: count("protocol_transition_draft_consumption"),
    transitionDraftConsumptions:
      count("goal_transition_draft_consumption")
      + count("protocol_transition_draft_consumption"),
    founderStoreMutationOperations: operations.filter((operation) => MUTATION_PHASES.has(operation.phase)).length,
    readOnlyAssertionOperations: operations.filter((operation) => operation.writeCategory === "read_only_assertion").length,
    postCommitExternalObligations: count("post_commit_external_obligation"),
  };
}

function reconcileExpectedCounts(expected, generated) {
  const keys = [
    "futureProtocolRecords",
    "activeReplacementProtocols",
    "pausedProtocols",
    "leftBehindProtocols",
    "provenanceRelationships",
    "activeProtocolGoalRelationships",
    "futureCommitments",
    "schedulerIntents",
    "reminderIntents",
    "briefingCadenceWrites",
    "evidenceWrites",
    "goalTransitionDraftConsumptions",
    "protocolTransitionDraftConsumptions",
    "transitionDraftConsumptions",
  ];
  for (const key of keys) {
    if (expected[key] !== generated[key]) {
      throw planError("EXPECTED_COUNT_MISMATCH", `Expected write count does not reconcile for ${key}.`, {
        field: key, expected: expected[key], actual: generated[key],
      });
    }
  }
}

function normalizeCommitmentCadence(frequency) {
  if (frequency === "periodic") return "custom";
  return ["daily", "weekly"].includes(frequency) ? frequency : "custom";
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
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function omitKey(value, keyToOmit) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => key !== keyToOmit));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function planError(shortCode, message, context = {}) {
  return new GoalTransitionActivationPlanError(
    GoalTransitionActivationPlanErrorCode[shortCode] ?? shortCode,
    message,
    context
  );
}
