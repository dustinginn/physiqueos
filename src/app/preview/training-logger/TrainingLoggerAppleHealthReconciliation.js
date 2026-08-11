export const APPLE_WORKOUT_EVIDENCE_CATEGORIES = Object.freeze({
  STRENGTH: "strength",
  CARDIO: "cardio",
  ACTIVITY: "activity",
});

export const APPLE_WORKOUT_CONSUMPTION_STATES = Object.freeze({
  UNLINKED: "unlinked",
  CONSUMED: "consumed",
});

export const APPLE_WORKOUT_CANONICAL_OWNER_TYPES = Object.freeze({
  TRAINING_SESSION: "training_session",
  CARDIO_WORKOUT: "cardio_workout",
  ACTIVITY_RECORD: "activity_record",
});

export const APPLE_HEALTH_MATCH_STATES = Object.freeze({
  STRONG: "strong_match",
  MULTIPLE: "multiple_matches",
  NONE: "no_match",
});

export const APPLE_HEALTH_INGESTION_ADAPTERS = Object.freeze({
  SCREENSHOT_INTERPRETATION: "apple_health_screenshot_interpretation",
  HEALTH_KIT: "healthkit",
});

export const APPLE_HEALTH_RECONCILIATION_FIXTURES = Object.freeze({
  BATCH: Object.freeze([
    appleWorkout({
      sourceWorkoutId: "apple_workout_strength_20260810_1612",
      workoutType: "Traditional Strength Training",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH,
      startTime: "4:12 PM",
      endTime: "5:06 PM",
      durationMinutes: 54,
      activeCalories: 430,
    }),
    appleWorkout({
      sourceWorkoutId: "apple_workout_stairs_20260810_1714",
      workoutType: "Stair Stepper",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.CARDIO,
      startTime: "5:14 PM",
      endTime: "5:44 PM",
      durationMinutes: 30,
      activeCalories: 310,
    }),
    appleWorkout({
      sourceWorkoutId: "apple_workout_walk_20260810_1752",
      workoutType: "Walking",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.ACTIVITY,
      startTime: "5:52 PM",
      endTime: "6:02 PM",
      durationMinutes: 10,
      activeCalories: 55,
    }),
    appleWorkout({
      sourceWorkoutId: "apple_workout_strength_consumed_20260810_0700",
      batchId: "apple_health_batch_20260810_existing_morning",
      workoutType: "Traditional Strength Training",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH,
      startTime: "7:00 AM",
      endTime: "7:35 AM",
      durationMinutes: 35,
      activeCalories: 240,
      consumedBy: {
        canonicalOwnerType: APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
        canonicalOwnerId: "training_session_existing_20260810_morning",
      },
    }),
  ]),
  MULTIPLE: Object.freeze([
    appleWorkout({
      sourceWorkoutId: "apple_workout_strength_20260810_1612",
      workoutType: "Traditional Strength Training",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH,
      startTime: "4:12 PM",
      endTime: "5:06 PM",
      durationMinutes: 54,
      activeCalories: 430,
    }),
    appleWorkout({
      sourceWorkoutId: "apple_workout_functional_20260810_1740",
      workoutType: "Functional Strength Training",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH,
      startTime: "5:40 PM",
      endTime: "6:24 PM",
      durationMinutes: 44,
      activeCalories: 356,
    }),
  ]),
  NONE: Object.freeze([
    appleWorkout({
      sourceWorkoutId: "apple_workout_stairs_20260810_1714",
      workoutType: "Stair Stepper",
      category: APPLE_WORKOUT_EVIDENCE_CATEGORIES.CARDIO,
      startTime: "5:14 PM",
      endTime: "5:44 PM",
      durationMinutes: 30,
      activeCalories: 310,
    }),
  ]),
});

export function normalizeAppleWorkoutEvidence(item = {}) {
  const sourceWorkoutId = String(item.sourceWorkoutId ?? item.sourceEvidenceId ?? "").trim();
  if (!sourceWorkoutId) throw new Error("Normalized Apple workout evidence requires a sourceWorkoutId.");
  const consumedBy = item.consumedBy
    ? {
        canonicalOwnerType: item.consumedBy.canonicalOwnerType,
        canonicalOwnerId: item.consumedBy.canonicalOwnerId,
      }
    : null;
  return {
    sourceWorkoutId,
    sourceEvidenceId: String(item.sourceEvidenceId ?? `${sourceWorkoutId}_evidence`),
    sourceSystem: "apple_health",
    ingestionAdapter: item.ingestionAdapter
      ?? APPLE_HEALTH_INGESTION_ADAPTERS.SCREENSHOT_INTERPRETATION,
    batchId: String(item.batchId ?? "apple_health_batch_20260810_gym_visit"),
    sessionDate: String(item.sessionDate ?? "2026-08-10"),
    startTime: item.startTime ?? null,
    endTime: item.endTime ?? null,
    workoutType: String(item.workoutType ?? "Apple Health Workout"),
    category: item.category ?? APPLE_WORKOUT_EVIDENCE_CATEGORIES.ACTIVITY,
    durationMinutes: Number(item.durationMinutes ?? 0),
    activeCalories: Number(item.activeCalories ?? 0),
    consumption: consumedBy
      ? { state: APPLE_WORKOUT_CONSUMPTION_STATES.CONSUMED, ...consumedBy }
      : {
          state: APPLE_WORKOUT_CONSUMPTION_STATES.UNLINKED,
          canonicalOwnerType: null,
          canonicalOwnerId: null,
        },
  };
}

export function createAppleHealthReconciliation({ evidenceItems, workoutDate }) {
  const normalizedEvidence = evidenceItems.map(normalizeAppleWorkoutEvidence);
  const batchId = normalizedEvidence[0]?.batchId ?? null;
  const strengthCandidates = listUnlinkedStrengthCandidates({
    batchId,
    evidenceItems: normalizedEvidence,
    workoutDate,
  });
  const matchState = getAppleHealthMatchState(strengthCandidates);
  return {
    batchId,
    normalizedEvidence,
    matchState,
    strengthCandidateIds: strengthCandidates.map((item) => item.sourceWorkoutId),
    selectedStrengthSourceId:
      matchState === APPLE_HEALTH_MATCH_STATES.STRONG
        ? strengthCandidates[0].sourceWorkoutId
        : null,
    continueWithoutStrength: false,
    additionalEvidenceActions: normalizedEvidence
      .filter((item) =>
        item.batchId === batchId
        && item.sessionDate === workoutDate
        && item.consumption.state === APPLE_WORKOUT_CONSUMPTION_STATES.UNLINKED
        && item.category !== APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH
      )
      .map((item) => ({
        sourceWorkoutId: item.sourceWorkoutId,
        included: true,
        canonicalOwnerType: getAdditionalCanonicalOwnerType(item.category),
      })),
    proposedCanonicalRecords: [],
    finalized: false,
  };
}

export function listUnlinkedStrengthCandidates({ batchId = null, evidenceItems, workoutDate }) {
  return evidenceItems.filter((item) =>
    (!batchId || item.batchId === batchId)
    && item.sessionDate === workoutDate
    && item.category === APPLE_WORKOUT_EVIDENCE_CATEGORIES.STRENGTH
    && item.consumption.state === APPLE_WORKOUT_CONSUMPTION_STATES.UNLINKED
  );
}

export function getAppleHealthMatchState(candidates) {
  if (candidates.length === 0) return APPLE_HEALTH_MATCH_STATES.NONE;
  if (candidates.length === 1) return APPLE_HEALTH_MATCH_STATES.STRONG;
  return APPLE_HEALTH_MATCH_STATES.MULTIPLE;
}

export function selectStrengthEvidence(reconciliation, sourceWorkoutId) {
  if (reconciliation.finalized) return reconciliation;
  const eligible = reconciliation.strengthCandidateIds.includes(sourceWorkoutId)
    && isEvidenceUnlinked(reconciliation.normalizedEvidence, sourceWorkoutId);
  if (!eligible) return reconciliation;
  return {
    ...reconciliation,
    selectedStrengthSourceId: sourceWorkoutId,
    continueWithoutStrength: false,
  };
}

export function continueWithoutStrengthEvidence(reconciliation) {
  if (reconciliation.finalized) return reconciliation;
  return {
    ...reconciliation,
    selectedStrengthSourceId: null,
    continueWithoutStrength: true,
  };
}

export function toggleAdditionalEvidence(reconciliation, sourceWorkoutId) {
  if (reconciliation.finalized) return reconciliation;
  return {
    ...reconciliation,
    additionalEvidenceActions: reconciliation.additionalEvidenceActions.map((action) =>
      action.sourceWorkoutId === sourceWorkoutId
        ? { ...action, included: !action.included }
        : action
    ),
  };
}

export function canFinalizeAppleHealthReconciliation(reconciliation) {
  if (reconciliation.finalized) return true;
  if (reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.NONE) {
    return reconciliation.continueWithoutStrength;
  }
  return Boolean(reconciliation.selectedStrengthSourceId);
}

export function finalizeAppleHealthReconciliation(
  reconciliation,
  { trainingSessionProposalId = "preview_training_session_proposal" } = {}
) {
  if (reconciliation.finalized || !canFinalizeAppleHealthReconciliation(reconciliation)) {
    return reconciliation;
  }

  let normalizedEvidence = reconciliation.normalizedEvidence;
  const proposedCanonicalRecords = [{
    proposalId: trainingSessionProposalId,
    canonicalOwnerType: APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
    sourceWorkoutId: reconciliation.selectedStrengthSourceId,
    disposition: reconciliation.selectedStrengthSourceId
      ? "link_to_detailed_workout"
      : "create_detailed_workout_without_apple_link",
  }];

  if (reconciliation.selectedStrengthSourceId) {
    normalizedEvidence = consumeAppleWorkoutEvidence(normalizedEvidence, {
      sourceWorkoutId: reconciliation.selectedStrengthSourceId,
      canonicalOwnerType: APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION,
      canonicalOwnerId: trainingSessionProposalId,
    }).evidenceItems;
  }

  reconciliation.additionalEvidenceActions
    .filter((action) => action.included)
    .forEach((action, index) => {
      const proposalId = `preview_${action.canonicalOwnerType}_proposal_${index + 1}`;
      const consumption = consumeAppleWorkoutEvidence(normalizedEvidence, {
        sourceWorkoutId: action.sourceWorkoutId,
        canonicalOwnerType: action.canonicalOwnerType,
        canonicalOwnerId: proposalId,
      });
      if (!consumption.consumed) return;
      normalizedEvidence = consumption.evidenceItems;
      proposedCanonicalRecords.push({
        proposalId,
        canonicalOwnerType: action.canonicalOwnerType,
        sourceWorkoutId: action.sourceWorkoutId,
        disposition: action.canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
          ? "create_separate_cardio_workout"
          : "create_separate_activity_record",
      });
    });

  return {
    ...reconciliation,
    normalizedEvidence,
    proposedCanonicalRecords,
    finalized: true,
  };
}

export function consumeAppleWorkoutEvidence(
  evidenceItems,
  { sourceWorkoutId, canonicalOwnerType, canonicalOwnerId }
) {
  const evidence = evidenceItems.find((item) => item.sourceWorkoutId === sourceWorkoutId);
  if (!evidence || evidence.consumption.state !== APPLE_WORKOUT_CONSUMPTION_STATES.UNLINKED) {
    return { consumed: false, reason: "source_already_consumed_or_missing", evidenceItems };
  }
  return {
    consumed: true,
    reason: null,
    evidenceItems: evidenceItems.map((item) => item.sourceWorkoutId === sourceWorkoutId
      ? {
          ...item,
          consumption: {
            state: APPLE_WORKOUT_CONSUMPTION_STATES.CONSUMED,
            canonicalOwnerType,
            canonicalOwnerId,
          },
        }
      : item),
  };
}

export function getReconciliationEvidenceItem(reconciliation, sourceWorkoutId) {
  return reconciliation.normalizedEvidence.find(
    (item) => item.sourceWorkoutId === sourceWorkoutId
  ) ?? null;
}

function isEvidenceUnlinked(evidenceItems, sourceWorkoutId) {
  return getEvidenceItem(evidenceItems, sourceWorkoutId)?.consumption.state
    === APPLE_WORKOUT_CONSUMPTION_STATES.UNLINKED;
}

function getEvidenceItem(evidenceItems, sourceWorkoutId) {
  return evidenceItems.find((item) => item.sourceWorkoutId === sourceWorkoutId) ?? null;
}

function getAdditionalCanonicalOwnerType(category) {
  return category === APPLE_WORKOUT_EVIDENCE_CATEGORIES.CARDIO
    ? APPLE_WORKOUT_CANONICAL_OWNER_TYPES.CARDIO_WORKOUT
    : APPLE_WORKOUT_CANONICAL_OWNER_TYPES.ACTIVITY_RECORD;
}

function appleWorkout(overrides) {
  return Object.freeze({
    batchId: "apple_health_batch_20260810_gym_visit",
    sessionDate: "2026-08-10",
    ingestionAdapter: APPLE_HEALTH_INGESTION_ADAPTERS.SCREENSHOT_INTERPRETATION,
    ...overrides,
  });
}
