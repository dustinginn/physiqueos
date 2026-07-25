import { activationFingerprint as fingerprint } from "./GoalTransitionActivationCanonicalization";

export const GoalTransitionActivationReasonCode = Object.freeze({
  GOAL_DRAFT_MISSING: "GOAL_DRAFT_MISSING",
  GOAL_DRAFT_NOT_ACCEPTED: "GOAL_DRAFT_NOT_ACCEPTED",
  GOAL_DRAFT_INVALID: "GOAL_DRAFT_INVALID",
  PROTOCOL_DRAFT_MISSING: "PROTOCOL_DRAFT_MISSING",
  PROTOCOL_DRAFT_NOT_ACCEPTED: "PROTOCOL_DRAFT_NOT_ACCEPTED",
  PROTOCOL_DRAFT_INVALID: "PROTOCOL_DRAFT_INVALID",
  GOAL_TRANSITION_DRAFT_ALREADY_CONSUMED: "GOAL_TRANSITION_DRAFT_ALREADY_CONSUMED",
  PROTOCOL_TRANSITION_DRAFT_ALREADY_CONSUMED:
    "PROTOCOL_TRANSITION_DRAFT_ALREADY_CONSUMED",
  TRANSITION_DRAFT_CONSUMPTION_STATE_MISMATCH:
    "TRANSITION_DRAFT_CONSUMPTION_STATE_MISMATCH",
  TRANSITION_DRAFT_CONSUMED_BY_DIFFERENT_TRANSITION:
    "TRANSITION_DRAFT_CONSUMED_BY_DIFFERENT_TRANSITION",
  TRANSITION_ID_MISMATCH: "TRANSITION_ID_MISMATCH",
  PROTOCOL_DECISIONS_UNRESOLVED: "PROTOCOL_DECISIONS_UNRESOLVED",
  ACCEPTED_PROTOCOL_COUNT_MISMATCH: "ACCEPTED_PROTOCOL_COUNT_MISMATCH",
  ACTIVE_GOAL_COUNT_INVALID: "ACTIVE_GOAL_COUNT_INVALID",
  ACTIVE_SOURCE_GOAL_MISMATCH: "ACTIVE_SOURCE_GOAL_MISMATCH",
  SOURCE_GOAL_STATE_INVALID: "SOURCE_GOAL_STATE_INVALID",
  TARGET_GOAL_ALREADY_ACTIVE: "TARGET_GOAL_ALREADY_ACTIVE",
  TARGET_GOAL_CONFLICT: "TARGET_GOAL_CONFLICT",
  CONFLICTING_TRANSITION: "CONFLICTING_TRANSITION",
  HISTORICAL_PROTOCOL_OWNERSHIP_INVALID: "HISTORICAL_PROTOCOL_OWNERSHIP_INVALID",
  FUTURE_PROTOCOL_ID_MISSING: "FUTURE_PROTOCOL_ID_MISSING",
  FUTURE_PROTOCOL_ID_COLLISION: "FUTURE_PROTOCOL_ID_COLLISION",
  PROTOCOL_PROVENANCE_INVALID: "PROTOCOL_PROVENANCE_INVALID",
  DISPOSITION_UNSUPPORTED: "DISPOSITION_UNSUPPORTED",
  DISPOSITION_WRITE_MAPPING_INVALID: "DISPOSITION_WRITE_MAPPING_INVALID",
  GROUPED_PROTOCOL_IDENTITY_INVALID: "GROUPED_PROTOCOL_IDENTITY_INVALID",
  COMMITMENT_INPUT_INCOMPLETE: "COMMITMENT_INPUT_INCOMPLETE",
  COMMITMENT_OWNER_INVALID: "COMMITMENT_OWNER_INVALID",
  COMMITMENT_ID_CONFLICT: "COMMITMENT_ID_CONFLICT",
  SCHEDULER_INTENT_INVALID: "SCHEDULER_INTENT_INVALID",
  SCHEDULER_INTENT_CONFLICT: "SCHEDULER_INTENT_CONFLICT",
  TIMEZONE_MISSING: "TIMEZONE_MISSING",
  GOAL_COMPLETION_INTEGRITY_INVALID: "GOAL_COMPLETION_INTEGRITY_INVALID",
  EVIDENCE_PRESERVATION_INVALID: "EVIDENCE_PRESERVATION_INVALID",
  ATOMIC_TRANSACTION_UNAVAILABLE: "ATOMIC_TRANSACTION_UNAVAILABLE",
  ATOMIC_COMMIT_UNAVAILABLE: "ATOMIC_COMMIT_UNAVAILABLE",
  ROLLBACK_UNAVAILABLE: "ROLLBACK_UNAVAILABLE",
  STAGED_WRITES_UNAVAILABLE: "STAGED_WRITES_UNAVAILABLE",
  REVISION_LOCKING_UNAVAILABLE: "REVISION_LOCKING_UNAVAILABLE",
  PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE: "PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE",
});

const SOURCE_GOAL_ID = "goal_visible_abs_at_rest";
const TARGET_TYPE = "build_lean_mass";
const CREATING_DISPOSITIONS = new Set(["keep", "update", "replace"]);
const NON_CREATING_DISPOSITIONS = new Set(["pause", "leave_behind"]);
const SUPPORTED_DISPOSITIONS = new Set([...CREATING_DISPOSITIONS, ...NON_CREATING_DISPOSITIONS]);
const INFRASTRUCTURE_CHECKS = [
  ["crossRepositoryTransaction", "ATOMIC_TRANSACTION_UNAVAILABLE"],
  ["atomicCommit", "ATOMIC_COMMIT_UNAVAILABLE"],
  ["rollback", "ROLLBACK_UNAVAILABLE"],
  ["stagedWrites", "STAGED_WRITES_UNAVAILABLE"],
  ["revisionLocking", "REVISION_LOCKING_UNAVAILABLE"],
  ["persistenceErrorsPropagate", "PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE"],
];

export function validateGoalTransitionActivation({
  snapshot,
  capabilities = {},
  evaluatedAt = null,
}) {
  const state = structuredClone(snapshot ?? {});
  const blockingReasons = [];
  const warnings = [];
  const goalDraft = state.goalDraft ?? null;
  const protocolDraft = state.protocolDraft ?? null;
  const goals = state.goals ?? [];
  const protocols = state.protocols ?? [];
  const protocolVersions = state.protocolVersions ?? [];
  const executionItems = state.executionItems ?? [];
  const reminders = state.reminders ?? [];
  const issue = (code, category, context = {}) => {
    blockingReasons.push({
      code,
      category,
      message: messageFor(code),
      ...context,
    });
  };

  validateGoalDraft({ goalDraft, issue });
  validateProtocolDraft({ goalDraft, protocolDraft, issue });
  validateDraftConsumption({ goalDraft, protocolDraft, issue });
  validateGoalState({ state, goals, goalDraft, issue });

  const dispositionResult = validateDispositions({
    protocolDraft,
    protocols,
    protocolVersions,
    issue,
  });
  validateCommitments({
    protocolDraft,
    executionItems,
    dispositionResult,
    issue,
  });
  validateScheduler({ state, goalDraft, reminders, issue });
  validateCompletionAndEvidence({ state, goals, protocols, issue });

  for (const [capability, code] of INFRASTRUCTURE_CHECKS) {
    if (capabilities[capability] !== true) {
      issue(code, "infrastructure", {
        entityType: "persistence_capability",
        field: capability,
        expected: true,
        actual: capabilities[capability] ?? false,
      });
    }
  }

  const draftReasons = blockingReasons.filter((reason) => reason.category !== "infrastructure");
  const infrastructureReasons = blockingReasons.filter((reason) => reason.category === "infrastructure");
  const expectedWriteCounts = Object.freeze({
    futureProtocolRecords: dispositionResult.futureRecords.length,
    activeReplacementProtocols: dispositionResult.activeReplacementCount,
    pausedProtocols: dispositionResult.pausedCount,
    leftBehindProtocols: dispositionResult.leftBehindCount,
    provenanceRelationships: dispositionResult.provenanceCount,
    activeProtocolGoalRelationships: dispositionResult.activeReplacementCount,
    futureCommitments: protocolDraft?.generatedCommitments?.length ?? 0,
    schedulerIntents: goalDraft?.briefingCadence?.type === "twice_weekly" ? 1 : 0,
    reminderIntents: (protocolDraft?.generatedRoutine ?? []).filter(hasScheduleInput).length,
    briefingCadenceWrites: goalDraft?.briefingCadence ? 1 : 0,
    evidenceWrites: 0,
    goalTransitionDraftConsumptions: 1,
    protocolTransitionDraftConsumptions: 1,
    transitionDraftConsumptions: 2,
  });
  const sourceRevisions = Object.freeze({
    founderStoreRevision: state.repositoryRevision ?? null,
    goalDraft: fingerprint(goalDraft),
    protocolDraft: fingerprint(protocolDraft),
    activeGoalState: fingerprint(goals),
    historicalProtocolOwnership: fingerprint({ protocols, protocolVersions }),
    commitmentSourceState: fingerprint(executionItems),
    schedulerIntentSourceState: fingerprint({
      reminders,
      briefingCadence: state.currentBriefingCadence ?? null,
      timeZone: resolvedTimeZone(state),
    }),
    evidenceRelationshipState: fingerprint(state.evidenceRelationships ?? []),
    activationCriticalState: fingerprint({
      goalDraft,
      protocolDraft,
      goals,
      protocols,
      protocolVersions,
      executionItems,
      reminders,
      currentBriefingCadence: state.currentBriefingCadence ?? null,
      timeZone: resolvedTimeZone(state),
      repositoryRevision: state.repositoryRevision ?? null,
    }),
  });

  return Object.freeze({
    ready: blockingReasons.length === 0,
    draftReady: draftReasons.length === 0,
    infrastructureReady: infrastructureReasons.length === 0,
    blockingReasons: Object.freeze(blockingReasons),
    warnings: Object.freeze(warnings),
    validatedGoalDraft: goalDraft ? {
      id: goalDraft.id,
      fingerprint: sourceRevisions.goalDraft,
      value: structuredClone(goalDraft),
    } : null,
    validatedProtocolDraft: protocolDraft ? {
      id: protocolDraft.id,
      fingerprint: sourceRevisions.protocolDraft,
      value: structuredClone(protocolDraft),
    } : null,
    expectedWriteCounts,
    sourceRevisions,
    evaluatedAt: evaluatedAt instanceof Date ? evaluatedAt.toISOString() : evaluatedAt,
    transitionIdentity: Object.freeze({
      userId: goalDraft?.userId ?? state.userId ?? null,
      sourceGoalId: goalDraft?.sourceGoalId ?? null,
      targetGoalDraftId: goalDraft?.primaryObjective?.id ?? null,
      goalTransitionDraftId: goalDraft?.id ?? null,
      protocolTransitionDraftId: protocolDraft?.id ?? null,
    }),
    futureProtocolPlan: Object.freeze(dispositionResult.futureRecords),
  });
}

function validateDraftConsumption({ goalDraft, protocolDraft, issue }) {
  const goalConsumed = isConsumed(goalDraft);
  const protocolConsumed = isConsumed(protocolDraft);
  if (goalConsumed) {
    issue("GOAL_TRANSITION_DRAFT_ALREADY_CONSUMED", "draft", {
      entityType: "goal_transition_draft", entityId: goalDraft?.id ?? null,
    });
  }
  if (protocolConsumed) {
    issue("PROTOCOL_TRANSITION_DRAFT_ALREADY_CONSUMED", "draft", {
      entityType: "protocol_transition_draft", entityId: protocolDraft?.id ?? null,
    });
  }
  if (goalConsumed !== protocolConsumed) {
    issue("TRANSITION_DRAFT_CONSUMPTION_STATE_MISMATCH", "draft", {
      entityType: "activation_transition",
    });
  }
  const transitionId = goalDraft?.id;
  for (const draft of [goalDraft, protocolDraft]) {
    const consumedBy = draft?.activationConsumption?.consumedByTransitionId
      ?? draft?.consumedByTransitionId;
    if (consumedBy && consumedBy !== transitionId) {
      issue("TRANSITION_DRAFT_CONSUMED_BY_DIFFERENT_TRANSITION", "draft", {
        entityType: "transition_draft", entityId: draft.id, actual: consumedBy,
      });
    }
  }
}

function isConsumed(draft) {
  return draft?.consumed === true
    || Boolean(draft?.consumedAt)
    || Boolean(draft?.appliedAt)
    || draft?.status === "applied"
    || draft?.activationConsumption?.consumed === true;
}

function validateGoalDraft({ goalDraft, issue }) {
  if (!goalDraft) {
    issue("GOAL_DRAFT_MISSING", "draft", { entityType: "goal_transition_draft" });
    return;
  }
  if (goalDraft.status !== "ready") {
    issue("GOAL_DRAFT_NOT_ACCEPTED", "draft", {
      entityType: "goal_transition_draft", entityId: goalDraft.id,
      field: "status", expected: "ready", actual: goalDraft.status,
    });
  }
  const acceptedEvidence = [
    ...(goalDraft.evidenceStrategy?.outcomeMeasures ?? []),
    ...(goalDraft.evidenceStrategy?.predictiveSignals ?? []),
  ].filter((item) => item.accepted === true);
  const bodyFatGuardrail = (goalDraft.guardrails ?? []).some(
    (item) => item.accepted === true && /8\s*[–-]\s*9%|8.*9.*body fat/i.test(item.text ?? "")
  );
  const valid = goalDraft.sourceGoalId === SOURCE_GOAL_ID
    && goalDraft.primaryObjective?.type === TARGET_TYPE
    && goalDraft.primaryObjective?.title === "Build Lean Mass"
    && goalDraft.operatingState?.value === "calibration"
    && goalDraft.operatingState?.accepted === true
    && bodyFatGuardrail
    && goalDraft.briefingCadence?.type === "twice_weekly"
    && sameSet(goalDraft.briefingCadence?.days, ["wednesday", "sunday"])
    && acceptedEvidence.some((item) => item.role === "outcome")
    && acceptedEvidence.some((item) => item.role === "predictive")
    && goalDraft.sourceGoalSnapshot?.status === "active"
    && !["applied", "abandoned", "invalidated", "superseded"].includes(goalDraft.status)
    && !goalDraft.appliedAt;
  if (!valid) {
    issue("GOAL_DRAFT_INVALID", "draft", {
      entityType: "goal_transition_draft", entityId: goalDraft.id,
    });
  }
}

function validateProtocolDraft({ goalDraft, protocolDraft, issue }) {
  if (!protocolDraft) {
    issue("PROTOCOL_DRAFT_MISSING", "draft", { entityType: "protocol_transition_draft" });
    return;
  }
  if (protocolDraft.status !== "ready" || protocolDraft.readyForActivation !== true) {
    issue("PROTOCOL_DRAFT_NOT_ACCEPTED", "draft", {
      entityType: "protocol_transition_draft", entityId: protocolDraft.id,
      field: "status", expected: "ready", actual: protocolDraft.status,
    });
  }
  if (goalDraft && (protocolDraft.goalTransitionDraftId !== goalDraft.id
    || protocolDraft.sourceGoalId !== goalDraft.sourceGoalId
    || protocolDraft.pendingGoalDraftId !== goalDraft.primaryObjective?.id)) {
    issue("TRANSITION_ID_MISMATCH", "draft", {
      entityType: "protocol_transition_draft", entityId: protocolDraft.id,
    });
  }
  const unresolved = protocolDraft.validation?.unresolvedReviewIds ?? [];
  if (unresolved.length || (protocolDraft.validation?.unresolvedCount ?? 0) !== 0) {
    issue("PROTOCOL_DECISIONS_UNRESOLVED", "draft", {
      entityType: "protocol_transition_draft", entityId: protocolDraft.id,
      field: "validation.unresolvedReviewIds", expected: [], actual: unresolved,
    });
  }
  if (protocolDraft.validation?.preparedCount !== 15 || (protocolDraft.protocolReviews ?? []).length !== 15) {
    issue("ACCEPTED_PROTOCOL_COUNT_MISMATCH", "draft", {
      entityType: "protocol_transition_draft", entityId: protocolDraft.id,
      field: "validation.preparedCount", expected: 15,
      actual: protocolDraft.validation?.preparedCount ?? null,
    });
  }
  if (protocolDraft.validation?.valid !== true
    || ["applied", "abandoned", "invalidated", "superseded"].includes(protocolDraft.status)
    || protocolDraft.appliedAt) {
    issue("PROTOCOL_DRAFT_INVALID", "draft", {
      entityType: "protocol_transition_draft", entityId: protocolDraft.id,
    });
  }
}

function validateGoalState({ state, goals, goalDraft, issue }) {
  const activePrimary = goals.filter((goal) => goal.primary === true && goal.status === "active");
  if (activePrimary.length !== 1) {
    issue("ACTIVE_GOAL_COUNT_INVALID", "goal", {
      entityType: "goal", field: "activePrimaryCount", expected: 1, actual: activePrimary.length,
    });
  }
  if (activePrimary.length === 1 && activePrimary[0].id !== SOURCE_GOAL_ID) {
    issue("ACTIVE_SOURCE_GOAL_MISMATCH", "goal", {
      entityType: "goal", entityId: activePrimary[0].id,
      expected: SOURCE_GOAL_ID, actual: activePrimary[0].id,
    });
  }
  const source = goals.find((goal) => goal.id === SOURCE_GOAL_ID);
  if (!source || source.status !== "active" || source.completedAt || source.transitionAppliedAt) {
    issue("SOURCE_GOAL_STATE_INVALID", "goal", {
      entityType: "goal", entityId: SOURCE_GOAL_ID,
    });
  }
  const targetGoals = goals.filter((goal) => goal.type === TARGET_TYPE || /build lean mass/i.test(goal.title ?? ""));
  if (targetGoals.some((goal) => goal.primary === true && goal.status === "active")) {
    issue("TARGET_GOAL_ALREADY_ACTIVE", "goal", {
      entityType: "goal", entityId: targetGoals.find((goal) => goal.status === "active")?.id,
    });
  } else if (targetGoals.length) {
    issue("TARGET_GOAL_CONFLICT", "goal", {
      entityType: "goal", entityId: targetGoals[0].id,
    });
  }
  const conflicting = (state.goalTransitionDrafts ?? []).find(
    (draft) => draft.id !== goalDraft?.id && ["draft", "ready"].includes(draft.status)
  );
  if (conflicting) {
    issue("CONFLICTING_TRANSITION", "goal", {
      entityType: "goal_transition_draft", entityId: conflicting.id,
    });
  }
}

function validateDispositions({ protocolDraft, protocols, protocolVersions, issue }) {
  const reviews = protocolDraft?.protocolReviews ?? [];
  const previews = protocolDraft?.protocolDrafts ?? [];
  const historicalIds = new Set(protocols.map((protocol) => protocol.id));
  const historicalVersionIds = new Set(protocolVersions.map((version) => version.id));
  const futureRecords = [];
  let pausedCount = 0;
  let leftBehindCount = 0;
  let provenanceCount = 0;
  for (const review of reviews) {
    const disposition = review.intendedDisposition;
    if (!SUPPORTED_DISPOSITIONS.has(disposition)) {
      issue("DISPOSITION_UNSUPPORTED", "protocol", {
        entityType: "protocol_review", entityId: review.id,
        field: "intendedDisposition", actual: disposition,
      });
      continue;
    }
    const matchingPreviews = previews.filter((preview) => preview.reviewId === review.id);
    const sourceIsVirtual = String(review.sourceProtocolId ?? "").startsWith("virtual_");
    const historical = protocols.find((protocol) => protocol.id === review.sourceProtocolId);
    if (!sourceIsVirtual && (!historical
      || historical.relatedGoalIds?.includes(protocolDraft?.pendingGoalDraftId)
      || review.reassignHistoricalOwnership === true
      || review.mutateHistoricalProtocol === true)) {
      issue("HISTORICAL_PROTOCOL_OWNERSHIP_INVALID", "protocol", {
        entityType: "protocol", entityId: review.sourceProtocolId,
      });
    }
    if (!sourceIsVirtual && review.sourceVersionId
      && (!historicalVersionIds.has(review.sourceVersionId)
        || !protocolVersions.some((version) => version.id === review.sourceVersionId
          && version.protocolId === review.sourceProtocolId))) {
      issue("PROTOCOL_PROVENANCE_INVALID", "protocol", {
        entityType: "protocol_review", entityId: review.id,
        field: "sourceVersionId", actual: review.sourceVersionId,
      });
    }
    if (CREATING_DISPOSITIONS.has(disposition)) {
      const preview = matchingPreviews[0];
      const futureId = deriveFutureProtocolId(protocolDraft?.id, review);
      if (!futureId) {
        issue("FUTURE_PROTOCOL_ID_MISSING", "protocol", {
          entityType: "protocol_review", entityId: review.id,
        });
      }
      if (historicalIds.has(futureId)) {
        issue("FUTURE_PROTOCOL_ID_COLLISION", "protocol", {
          entityType: "protocol_review", entityId: review.id,
          field: "futureProtocolId", actual: futureId,
        });
      }
      if (futureRecords.some((record) => record.id === futureId)) {
        issue("FUTURE_PROTOCOL_ID_COLLISION", "protocol", {
          entityType: "protocol_review", entityId: review.id,
          field: "futureProtocolId", actual: futureId,
        });
      }
      if (!preview || preview.status !== "ready"
        || preview.sourceProtocolId !== review.sourceProtocolId
        || (disposition === "update" && !Object.keys(preview.payload ?? {}).length)) {
        issue("DISPOSITION_WRITE_MAPPING_INVALID", "protocol", {
          entityType: "protocol_review", entityId: review.id,
          field: "replacementProtocolDraftId", actual: review.replacementProtocolDraftId ?? null,
        });
      }
      if (!sourceIsVirtual && !review.sourceProtocolId) {
        issue("PROTOCOL_PROVENANCE_INVALID", "protocol", {
          entityType: "protocol_review", entityId: review.id,
        });
      }
      futureRecords.push(Object.freeze({
        id: futureId,
        reviewId: review.id,
        sourceProtocolId: review.sourceProtocolId,
        sourceVersionId: review.sourceVersionId ?? null,
        provenanceSourceType: sourceIsVirtual ? "virtual_plan" : "historical_protocol",
        disposition,
        category: review.category,
        active: true,
      }));
      provenanceCount += 1;
    } else {
      if (disposition === "pause") pausedCount += 1;
      if (disposition === "leave_behind") leftBehindCount += 1;
      if (matchingPreviews.length || review.replacementProtocolDraftId) {
        issue("DISPOSITION_WRITE_MAPPING_INVALID", "protocol", {
          entityType: "protocol_review", entityId: review.id,
          field: "replacementProtocolDraftId",
        });
      }
    }
  }
  for (const category of ["peptide", "supplement"]) {
    const grouped = reviews.filter((review) => review.category === category);
    const sourceIds = grouped.map((review) => review.sourceProtocolId);
    const futureIds = futureRecords.filter((record) => record.category === category).map((record) => record.id);
    if (new Set(sourceIds).size !== sourceIds.length || new Set(futureIds).size !== futureIds.length) {
      issue("GROUPED_PROTOCOL_IDENTITY_INVALID", "protocol", {
        entityType: "protocol_group", entityId: category,
      });
    }
  }
  return {
    futureRecords,
    activeReplacementCount: futureRecords.length,
    pausedCount,
    leftBehindCount,
    provenanceCount,
  };
}

function validateCommitments({ protocolDraft, executionItems, dispositionResult, issue }) {
  const commitments = protocolDraft?.generatedCommitments ?? [];
  const futureBySource = new Map(
    dispositionResult.futureRecords.map((record) => [record.sourceProtocolId, record])
  );
  const ids = new Set();
  for (const commitment of commitments) {
    if (!commitment.id || !commitment.requirement || !commitment.frequency || !commitment.sourceProtocolId) {
      issue("COMMITMENT_INPUT_INCOMPLETE", "commitment", {
        entityType: "commitment_preview", entityId: commitment.id ?? null,
      });
    }
    if (ids.has(commitment.id)
      || executionItems.some((item) => item.id === commitment.id && item.active !== false)) {
      issue("COMMITMENT_ID_CONFLICT", "commitment", {
        entityType: "commitment_preview", entityId: commitment.id,
      });
    }
    ids.add(commitment.id);
    if (!futureBySource.has(commitment.sourceProtocolId)) {
      issue("COMMITMENT_OWNER_INVALID", "commitment", {
        entityType: "commitment_preview", entityId: commitment.id,
        field: "sourceProtocolId", actual: commitment.sourceProtocolId,
      });
    }
  }
}

function validateScheduler({ state, goalDraft, reminders, issue }) {
  const cadence = goalDraft?.briefingCadence;
  if (cadence?.type !== "twice_weekly" || !sameSet(cadence?.days, ["wednesday", "sunday"])) {
    issue("SCHEDULER_INTENT_INVALID", "scheduler", {
      entityType: "coaching_cadence", field: "type",
      expected: "twice_weekly", actual: cadence?.type ?? null,
    });
  }
  if (!resolvedTimeZone(state)) {
    issue("TIMEZONE_MISSING", "scheduler", {
      entityType: "user", entityId: state.userId ?? null, field: "timeZone",
    });
  }
  const schedulerKey = goalDraft?.id ? `${goalDraft.id}:coaching:twice_weekly` : null;
  if (!schedulerKey) {
    issue("SCHEDULER_INTENT_INVALID", "scheduler", {
      entityType: "scheduler_intent", field: "identity",
    });
  } else if (reminders.some((reminder) => reminder.schedulerKey === schedulerKey && reminder.active !== false)) {
    issue("SCHEDULER_INTENT_CONFLICT", "scheduler", {
      entityType: "reminder", field: "schedulerKey", actual: schedulerKey,
    });
  }
}

function validateCompletionAndEvidence({ state, goals, protocols, issue }) {
  const source = goals.find((goal) => goal.id === SOURCE_GOAL_ID);
  if (!source || source.status !== "active"
    || state.completionRecommendation?.userDecisionPending === false
    || state.completionRecommendation?.appliedAt) {
    issue("GOAL_COMPLETION_INTEGRITY_INVALID", "goal", {
      entityType: "goal", entityId: SOURCE_GOAL_ID,
    });
  }
  const evidenceWriteSet = state.proposedWriteSet?.evidence ?? [];
  const reassignedEvidence = (state.evidenceRelationships ?? []).some(
    (relationship) => relationship.delete === true || relationship.reassign === true
  );
  const historicalProtocolMutation = protocols.some(
    (protocol) => protocol.delete === true || protocol.overwriteInPlace === true
  );
  if (evidenceWriteSet.length || reassignedEvidence || historicalProtocolMutation) {
    issue("EVIDENCE_PRESERVATION_INVALID", "evidence", {
      entityType: "evidence_relationship",
    });
  }
}

function deriveFutureProtocolId(transitionId, review) {
  if (review?.futureProtocolId !== undefined) return review.futureProtocolId || null;
  if (!transitionId || !review?.id || !review?.sourceProtocolId) return null;
  return `${transitionId}_future_${slug(review.sourceProtocolId)}_${slug(review.id).slice(-24)}`;
}

function hasScheduleInput(item) {
  return Boolean(item?.frequency && item?.text && item?.sourcePreviewProtocolId);
}

function resolvedTimeZone(state) {
  return state.timeZone ?? state.defaultTimeZone ?? null;
}

function sameSet(actual = [], expected = []) {
  return actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function slug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function messageFor(code) {
  return code.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()) + ".";
}
