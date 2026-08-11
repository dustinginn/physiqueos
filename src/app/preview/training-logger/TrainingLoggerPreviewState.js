import {
  getCanonicalTrainingExerciseSlug,
  listCanonicalTrainingExerciseIdentities,
  normalizeExercisePhrase,
  resolveTrainingExerciseIdentity,
} from "../../../domain/models/trainingExerciseIdentity";
import {
  listCanonicalTrainingMuscleGroups,
  resolveCanonicalTrainingMuscleGroup,
} from "../../../domain/models/trainingMuscleGroupIdentity";
import {
  normalizeTrainingExecutionVariant,
} from "../../../domain/models/trainingExecutionVariant";
import {
  createTrainingExerciseOccurrenceId,
  createTrainingExerciseRelationshipGroup,
  removeExerciseFromTrainingRelationshipGroups,
  TRAINING_EXERCISE_RELATIONSHIP_TYPES,
} from "../../../domain/models/trainingExerciseRelationship";
import {
  getPrimaryTrainingNavigationGroup,
} from "../../../navigation/trainingNavigationMapping";
import {
  resolvePreviousExerciseOccurrence,
} from "../../../domain/services/TrainingExerciseOccurrenceHistoryService";
import {
  createTrainingLoggerProgressionRecommendation,
  TRAINING_LOGGER_PROGRESSION_STATUS,
} from "../../../domain/services/TrainingLoggerProgressionService";
import {
  createTrainingLoggerSuggestion,
} from "../../../domain/services/TrainingLoggerSuggestionService";
import { createClientDraftId } from "../../../lib/clientDraftId";
import {
  APPLE_HEALTH_RECONCILIATION_FIXTURES,
  APPLE_WORKOUT_CANONICAL_OWNER_TYPES,
  canFinalizeAppleHealthReconciliation,
  continueWithoutStrengthEvidence,
  createAppleHealthReconciliation,
  finalizeAppleHealthReconciliation,
  getReconciliationEvidenceItem,
  selectStrengthEvidence,
  toggleAdditionalEvidence,
} from "./TrainingLoggerAppleHealthReconciliation";

export {
  APPLE_HEALTH_MATCH_STATES,
  APPLE_HEALTH_RECONCILIATION_FIXTURES,
  APPLE_WORKOUT_CANONICAL_OWNER_TYPES,
} from "./TrainingLoggerAppleHealthReconciliation";

export const TRAINING_LOGGER_PREVIEW_VERSION = "training_logger_preview_v1_3";

export const TRAINING_LOGGER_MODES = Object.freeze({
  LIVE: "live",
  RETROSPECTIVE: "retrospective",
});

export const TRAINING_LOGGER_EXERCISE_SCOPES = Object.freeze({
  ALL_CANONICAL: "all_canonical",
  PERFORMED_HISTORY: "performed_history",
});

export const TRAINING_LOGGER_STEPS = Object.freeze({
  ENTRY: "entry",
  CATEGORIES: "categories",
  EXERCISES: "exercises",
  LOGGER: "logger",
  ADD_EXERCISE: "add_exercise",
  SUMMARY: "summary",
  RECONCILIATION: "reconciliation",
  EVIDENCE_REVIEW: "evidence_review",
  COMPLETE: "complete",
});

export const PROGRESSION_STATES = Object.freeze({
  OPPORTUNITY: "progression_opportunity",
  MAINTAIN: "maintain_current_performance",
  RECOVER: "recover_prior_performance",
});

export const PROGRESSION_CHOICES = Object.freeze({
  PREVIOUS: "previous",
  SUGGESTION: "suggestion",
});

export const TRAINING_LOGGER_CATEGORY_SUGGESTION = Object.freeze({
  id: "suggested_arms_core",
  label: "Arms + Core",
  categories: Object.freeze(["Biceps", "Triceps", "Core"]),
  reason: "Based on your recent training rhythm",
  source: "synthetic_preview_fixture",
  futureLearningSource: "confirmed_training_evidence_history",
});

export const TRAINING_LOGGER_VARIANT_OPTIONS = Object.freeze([
  "Static Hold",
  "3-Second Pause",
  "Slow Eccentric",
]);

export const TRAINING_LOGGER_DENSITY_CONTRACT = Object.freeze({
  canonicalShellWidthPx: 393,
  narrowShellWidthPx: 360,
  primaryTapTargetPx: 44,
  denseSetControlTargetPx: 40,
  setRowVisualHeightPx: 40,
  setRowGapPx: 0,
  setHeaderWithAddSetHeightPx: 40,
  exerciseCardGapPx: 8,
  v1_2StructuralEstimate: Object.freeze({
    headerContextPx: 60,
    recommendationPx: 52,
    setSectionPx: 261,
    ordinaryFourSetCardPx: 376,
  }),
  v1_3StructuralTarget: Object.freeze({
    ordinaryHeaderContextPx: 65,
    narrowOrdinaryHeaderContextPx: 85,
    variantAndSupersetHeaderContextPx: 85,
    recommendationPx: 52,
    narrowRecommendationPx: 60,
    setSectionPx: 214,
    ordinaryFourSetCardMaxPx: 334,
    narrowOrContextualFourSetCardMaxPx: 362,
  }),
});

export const TRAINING_LOGGER_USER_FACING_AREA_IDS = Object.freeze([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
]);

const DEFAULT_HISTORY = Object.freeze({
  date: "2026-08-03",
  reps: 10,
  load: 25,
  unit: "lb",
  setCount: 3,
  context: "Same exercise",
});

const HISTORY_FIXTURES = Object.freeze({
  spider_curl: Object.freeze({
    ordinary: Object.freeze({
      standalone: history("2026-08-03", 12, 35, 4, "Same exercise · ordinary sets"),
    }),
    static_hold: Object.freeze({
      standalone: history("2026-07-27", 10, 35, 4, "Same exercise · Static Hold"),
      "superset|partners:cable_pushdown": history(
        "2026-07-20",
        12,
        35,
        4,
        "Static Hold · Superset with Cable Rope Pushdowns"
      ),
    }),
  }),
  cable_pushdown: Object.freeze({
    ordinary: Object.freeze({
      standalone: history("2026-08-03", 12, 50, 4, "Same exercise · ordinary sets"),
      "superset|partners:spider_curl": history(
        "2026-07-20",
        12,
        45,
        4,
        "Superset with Spider Curls"
      ),
    }),
  }),
  hanging_leg_raise: Object.freeze({
    ordinary: Object.freeze({
      standalone: history("2026-08-01", 10, 0, 3, "Same exercise · bodyweight"),
    }),
  }),
  incline_dumbbell_press: Object.freeze({
    ordinary: Object.freeze({
      standalone: history("2026-07-31", 10, 70, 4, "Same exercise · ordinary sets"),
    }),
  }),
  seated_cable_row: Object.freeze({
    ordinary: Object.freeze({
      standalone: history("2026-07-30", 10, 120, 4, "Same exercise · ordinary sets"),
    }),
  }),
  leg_press: Object.freeze({
    ordinary: Object.freeze({
      standalone: history("2026-07-29", 10, 270, 4, "Same exercise · ordinary sets"),
    }),
  }),
});

const RECOMMENDATION_FIXTURES = Object.freeze({
  spider_curl: Object.freeze({
    state: PROGRESSION_STATES.OPPORTUNITY,
    eyebrow: "Progression opportunity",
    message: "You’ve held 35 lb across recent comparable sessions.",
    prescription: "Try 40 lb × 8–10",
    suggestedLoad: 40,
    suggestedReps: 8,
  }),
  cable_pushdown: Object.freeze({
    state: PROGRESSION_STATES.MAINTAIN,
    eyebrow: "Maintain current performance",
    message: "Your current load is moving at the right pace.",
    prescription: "Repeat 50 lb × 12 with clean reps",
    suggestedLoad: 50,
    suggestedReps: 12,
  }),
  hanging_leg_raise: Object.freeze({
    state: PROGRESSION_STATES.RECOVER,
    eyebrow: "Recent performance is down",
    message: "Match your last successful session before adding difficulty.",
    prescription: "Return to 10 controlled reps",
    suggestedLoad: 0,
    suggestedReps: 10,
  }),
});

export function listTrainingLoggerCategories() {
  const userFacingAreas = new Set(TRAINING_LOGGER_USER_FACING_AREA_IDS);
  return listCanonicalTrainingMuscleGroups()
    .filter((muscleGroup) => userFacingAreas.has(muscleGroup.id))
    .map((muscleGroup) => muscleGroup.label);
}

export function listTrainingLoggerExercises({
  categories = [],
  exerciseLibrary = null,
  performedExerciseIds = [],
  search = "",
  scope = TRAINING_LOGGER_EXERCISE_SCOPES.ALL_CANONICAL,
} = {}) {
  const selected = new Set(categories.map((category) => category.toLowerCase()));
  const query = String(search).trim().toLowerCase();
  const canonicalExercises = Array.isArray(exerciseLibrary) && exerciseLibrary.length > 0
    ? exerciseLibrary
    : listCanonicalTrainingExerciseIdentities();
  const performed = new Set(performedExerciseIds);
  return canonicalExercises.filter((exercise) => {
    const scopeMatches = scope !== TRAINING_LOGGER_EXERCISE_SCOPES.PERFORMED_HISTORY ||
      performed.has(exercise.id);
    const categoryMatches = selected.size === 0 || listTrainingLoggerExerciseCategories(exercise)
      .some((category) => selected.has(category));
    const searchMatches = !query || [exercise.name, exercise.movement_pattern, exercise.equipment]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
    return scopeMatches && categoryMatches && searchMatches;
  });
}

export function canCreateNewTrainingLoggerExercise({
  exerciseLibrary = null,
  search = "",
} = {}) {
  const normalized = normalizeExercisePhrase(search);
  if (!normalized) return false;
  const canonicalExercises = Array.isArray(exerciseLibrary) && exerciseLibrary.length > 0
    ? exerciseLibrary
    : listCanonicalTrainingExerciseIdentities();
  return !canonicalExercises.some((exercise) =>
    [exercise.name, ...(exercise.aliases ?? [])]
      .some((value) => normalizeExercisePhrase(value) === normalized)
  );
}

export function listTrainingLoggerExerciseCategories(exercise = {}) {
  const provisionalCategory = resolveCanonicalTrainingMuscleGroup(
    exercise.provisionalExercise?.suggestedPrimaryMuscleGroupId ??
      exercise.provisionalExercise?.suggestedPrimaryMuscleGroup
  );
  if (provisionalCategory) return [provisionalCategory.id];
  const navigationCategory = getPrimaryTrainingNavigationGroup({
    canonicalExerciseId: exercise.id ?? exercise.canonicalExerciseId,
    label: exercise.name,
    primaryMuscleGroups: exercise.primary_muscle_groups,
    regionLabel: exercise.body_region ?? exercise.bodyRegion,
  });
  return navigationCategory ? [navigationCategory] : [];
}

export function listPerformedTrainingLoggerExerciseIds(sessions = []) {
  return [...new Set(sessions
    .map((candidate) => candidate?.payload ?? candidate)
    .filter((session) => session?.evidence_type === "training")
    .flatMap((session) => session.exercises ?? [])
    .map((exercise) =>
      exercise.canonicalExerciseId ?? getCanonicalTrainingExerciseSlug(exercise.name)
    )
    .filter(Boolean))];
}

export function createTrainingLoggerProductionDraft({
  exerciseLibrary = [],
  goalContext = null,
  historySessions = [],
  mode = null,
  performedExerciseIds = null,
  workoutDate,
} = {}) {
  const draftId = createClientDraftId("training_logger");
  return {
    draftVersion: "training_logger_web_v1",
    draftId,
    isolation: {
      persistence: "local_draft_recovery",
      canonicalTrainingSessionWritesEnabled: false,
      fixtureHistoryReadOnly: false,
    },
    productionContext: {
      exerciseLibrary,
      goalContext,
      historySessions,
      performedExerciseIds: Array.isArray(performedExerciseIds)
        ? performedExerciseIds
        : listPerformedTrainingLoggerExerciseIds(historySessions),
    },
    categorySuggestion: createTrainingLoggerSuggestion({
      date: workoutDate,
      sessions: historySessions,
    }),
    step: mode ? TRAINING_LOGGER_STEPS.CATEGORIES : TRAINING_LOGGER_STEPS.ENTRY,
    mode,
    workoutDate,
    workoutTime: null,
    startedAt: null,
    finishedAt: null,
    startedAtLabel: mode === TRAINING_LOGGER_MODES.LIVE ? "Started now" : null,
    selectedCategories: [],
    acceptedSuggestionId: null,
    exercises: [],
    exerciseRelationshipGroups: [],
    nextOccurrenceIndex: 0,
    reconciliation: createAppleHealthReconciliation({
      evidenceItems: [],
      workoutDate,
    }),
  };
}

export function hydrateTrainingLoggerProductionDraft(
  recoveredDraft,
  {
    exerciseLibrary = [],
    goalContext = null,
    historySessions = [],
    performedExerciseIds = null,
    workoutDate,
  } = {}
) {
  if (
    recoveredDraft?.draftVersion !== "training_logger_web_v1" ||
    !recoveredDraft?.draftId ||
    !Object.values(TRAINING_LOGGER_STEPS).includes(recoveredDraft.step)
  ) {
    return createTrainingLoggerProductionDraft({
      exerciseLibrary,
      goalContext,
      historySessions,
      performedExerciseIds,
      workoutDate,
    });
  }
  return refreshComparableContexts({
    ...recoveredDraft,
    isolation: {
      persistence: "local_draft_recovery",
      canonicalTrainingSessionWritesEnabled: false,
      fixtureHistoryReadOnly: false,
    },
    productionContext: {
      exerciseLibrary,
      goalContext,
      historySessions,
      performedExerciseIds: Array.isArray(performedExerciseIds)
        ? performedExerciseIds
        : listPerformedTrainingLoggerExerciseIds(historySessions),
    },
    categorySuggestion: createTrainingLoggerSuggestion({
      date: recoveredDraft.workoutDate ?? workoutDate,
      sessions: historySessions,
    }),
  });
}

export function serializeTrainingLoggerRecoveryDraft(draft) {
  if (!isProductionDraft(draft)) return null;
  const { productionContext: _productionContext, ...recoverable } = draft;
  return recoverable;
}

export function attachProductionAppleHealthReconciliation(draft, reconciliation) {
  if (!isProductionDraft(draft) || !reconciliation) return draft;
  return { ...draft, reconciliation };
}

export function createTrainingLoggerPreviewDraft({
  mode = null,
  workoutDate = "2026-08-10",
} = {}) {
  return {
    previewVersion: TRAINING_LOGGER_PREVIEW_VERSION,
    isolation: {
      persistence: "memory_only",
      canonicalTrainingSessionWritesEnabled: false,
      fixtureHistoryReadOnly: true,
    },
    step: mode ? TRAINING_LOGGER_STEPS.CATEGORIES : TRAINING_LOGGER_STEPS.ENTRY,
    mode,
    workoutDate,
    workoutTime: null,
    startedAtLabel: mode === TRAINING_LOGGER_MODES.LIVE ? "Started now" : null,
    selectedCategories: [],
    acceptedSuggestionId: null,
    exercises: [],
    exerciseRelationshipGroups: [],
    nextOccurrenceIndex: 0,
    reconciliation: createAppleHealthReconciliation({
      evidenceItems: APPLE_HEALTH_RECONCILIATION_FIXTURES.BATCH,
      workoutDate,
    }),
  };
}

export function initializeTrainingLoggerMode(draft, mode) {
  if (!Object.values(TRAINING_LOGGER_MODES).includes(mode)) return draft;
  return {
    ...draft,
    mode,
    step: TRAINING_LOGGER_STEPS.CATEGORIES,
    startedAt: isProductionDraft(draft) && mode === TRAINING_LOGGER_MODES.LIVE
      ? new Date().toISOString()
      : null,
    finishedAt: null,
    startedAtLabel: mode === TRAINING_LOGGER_MODES.LIVE ? "Started now" : null,
    workoutTime: null,
  };
}

export function finishTrainingLoggerDraft(draft) {
  return {
    ...draft,
    finishedAt: isProductionDraft(draft) && draft.mode === TRAINING_LOGGER_MODES.LIVE
      ? new Date().toISOString()
      : null,
    step: TRAINING_LOGGER_STEPS.SUMMARY,
  };
}

export function canFinishTrainingLoggerDraft(draft) {
  return (draft?.exercises ?? []).length > 0 && draft.exercises.every((exercise) =>
    (exercise.sets ?? []).length > 0 && exercise.sets.every((set) => {
      const reps = Number(set.reps);
      const load = Number(set.load);
      return Number.isFinite(reps) && reps > 0 && Number.isFinite(load) && load >= 0;
    })
  );
}

export function updateWorkoutContext(draft, changes = {}) {
  const workoutDate = changes.workoutDate ?? draft.workoutDate;
  const updated = {
    ...draft,
    ...changes,
    workoutDate,
    workoutTime: draft.mode === TRAINING_LOGGER_MODES.RETROSPECTIVE
      ? null
      : changes.workoutTime ?? draft.workoutTime,
    reconciliation: workoutDate === draft.workoutDate
      ? draft.reconciliation
      : createAppleHealthReconciliation({
          evidenceItems: draft.reconciliation.normalizedEvidence,
          workoutDate,
        }),
  };
  if (!isProductionDraft(updated)) return updated;
  return refreshComparableContexts({
    ...updated,
    categorySuggestion: createTrainingLoggerSuggestion({
      date: workoutDate,
      sessions: updated.productionContext?.historySessions ?? [],
    }),
  });
}

export function toggleTrainingCategory(draft, category) {
  if (!listTrainingLoggerCategories().includes(category)) return draft;
  const selected = new Set(draft.selectedCategories);
  if (selected.has(category)) selected.delete(category);
  else selected.add(category);
  return {
    ...draft,
    selectedCategories: [...selected],
    acceptedSuggestionId: null,
  };
}

export function acceptTrainingCategorySuggestion(
  draft,
  suggestion = TRAINING_LOGGER_CATEGORY_SUGGESTION
) {
  return {
    ...draft,
    selectedCategories: [...suggestion.categories],
    acceptedSuggestionId: suggestion.id,
  };
}

export function goToTrainingLoggerStep(draft, step) {
  if (!Object.values(TRAINING_LOGGER_STEPS).includes(step)) return draft;
  return { ...draft, step };
}

export function addTrainingExercise(draft, canonicalExerciseId) {
  if (draft.exercises.some((exercise) => exercise.canonicalExerciseId === canonicalExerciseId)) {
    return draft;
  }
  const identity = (
    draft.productionContext?.exerciseLibrary?.length
      ? draft.productionContext.exerciseLibrary
      : listCanonicalTrainingExerciseIdentities()
  ).find(
    (exercise) => exercise.id === canonicalExerciseId
  );
  if (!identity) return draft;

  const occurrenceIndex = draft.nextOccurrenceIndex;
  const id = createTrainingExerciseOccurrenceId({
    canonicalExerciseId,
    occurrenceIndex,
    provenanceRef: isProductionDraft(draft)
      ? `training_logger_draft_${draft.draftId}`
      : "training_logger_preview_draft",
  });
  const previousPerformance = selectDraftPreviousPerformance(draft, {
    canonicalExerciseId,
  });
  const sets = Array.from({ length: previousPerformance.setCount }, (_, index) => ({
    id: `${id}_set_${index + 1}`,
    order: index + 1,
    reps: previousPerformance.reps,
    load: previousPerformance.load,
    unit: previousPerformance.unit,
    confirmed: false,
  }));
  const occurrence = {
    id,
    exerciseOccurrenceId: id,
    canonicalExerciseId: identity.id,
    name: identity.name,
    bodyRegion: identity.body_region,
    equipment: identity.equipment,
    executionVariant: null,
    sets,
    previousPerformance,
    progressionRecommendation: selectDraftProgressionRecommendation(draft, {
      canonicalExerciseId,
      previousPerformance,
    }),
    progressionChoice: PROGRESSION_CHOICES.PREVIOUS,
  };
  return {
    ...draft,
    exercises: [...draft.exercises, occurrence],
    nextOccurrenceIndex: occurrenceIndex + 1,
  };
}

export function addProvisionalTrainingExercise(draft, input = {}) {
  const definition = resolveProvisionalTrainingLoggerInput(draft, input);
  if (!definition) return draft;
  if (definition.canonicalExerciseId) {
    return addTrainingExercise(draft, definition.canonicalExerciseId);
  }
  if (draft.exercises.some((exercise) =>
    !exercise.canonicalExerciseId &&
    normalizeExercisePhrase(exercise.name) === normalizeExercisePhrase(definition.name)
  )) return draft;

  const occurrenceIndex = draft.nextOccurrenceIndex;
  const occurrenceId = createTrainingExerciseOccurrenceId({
    name: definition.name,
    occurrenceIndex,
    provenanceRef: getTrainingLoggerDraftProvenanceRef(draft),
  });
  const previousPerformance = createFirstUsePreviousPerformance();
  return {
    ...draft,
    exercises: [...draft.exercises, createProvisionalTrainingLoggerOccurrence({
      category: definition.category,
      draft,
      name: definition.name,
      occurrenceId,
      previousPerformance,
    })],
    nextOccurrenceIndex: occurrenceIndex + 1,
  };
}

export function swapTrainingExercise(draft, exerciseOccurrenceId, input = {}) {
  const current = draft.exercises.find((exercise) => exercise.id === exerciseOccurrenceId);
  if (!current) return draft;
  const definition = resolveProvisionalTrainingLoggerInput(draft, input);
  if (!definition) return draft;
  if (
    definition.canonicalExerciseId &&
    draft.exercises.some((exercise) =>
      exercise.id !== exerciseOccurrenceId &&
      exercise.canonicalExerciseId === definition.canonicalExerciseId
    )
  ) return draft;

  const relationshipContext = getRelationshipContext(draft, exerciseOccurrenceId);
  const relationshipKey = getRelationshipKey(draft, exerciseOccurrenceId);
  const previousPerformance = definition.canonicalExerciseId
    ? selectDraftPreviousPerformance(draft, {
        canonicalExerciseId: definition.canonicalExerciseId,
        executionVariant: null,
        relationshipContext,
        relationshipKey,
      })
    : createFirstUsePreviousPerformance();
  const replacement = definition.canonicalExerciseId
    ? buildCanonicalTrainingLoggerOccurrence({
        draft,
        identity: definition.identity,
        occurrenceId: exerciseOccurrenceId,
        previousPerformance,
        relationshipContext,
      })
    : createProvisionalTrainingLoggerOccurrence({
        category: definition.category,
        draft,
        name: definition.name,
        occurrenceId: exerciseOccurrenceId,
        previousPerformance,
      });

  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === exerciseOccurrenceId ? replacement : exercise
    ),
  };
}

export function removeTrainingExercise(draft, exerciseOccurrenceId) {
  const exercises = draft.exercises.filter(
    (exercise) => exercise.id !== exerciseOccurrenceId
  );
  const exerciseRelationshipGroups = removeExerciseFromTrainingRelationshipGroups(
    draft.exerciseRelationshipGroups,
    exerciseOccurrenceId
  );
  return refreshComparableContexts({
    ...draft,
    exercises,
    exerciseRelationshipGroups,
  });
}

export function updateTrainingSet(draft, exerciseOccurrenceId, setId, changes = {}) {
  return updateExercise(draft, exerciseOccurrenceId, (exercise) => ({
    ...exercise,
    ...(Object.hasOwn(changes, "reps") || Object.hasOwn(changes, "load")
      ? { progressionChoice: null }
      : {}),
    sets: exercise.sets.map((set) => set.id === setId
      ? {
          ...set,
          ...(Object.hasOwn(changes, "reps") ? { reps: toNonNegativeNumber(changes.reps) } : {}),
          ...(Object.hasOwn(changes, "load") ? { load: toNonNegativeNumber(changes.load) } : {}),
          ...(Object.hasOwn(changes, "confirmed") ? { confirmed: Boolean(changes.confirmed) } : {}),
        }
      : set),
  }));
}

export function toggleTrainingSetCompletion(draft, exerciseOccurrenceId, setId) {
  const exercise = draft.exercises.find((candidate) => candidate.id === exerciseOccurrenceId);
  const set = exercise?.sets.find((candidate) => candidate.id === setId);
  if (!set) return draft;
  return updateTrainingSet(draft, exerciseOccurrenceId, setId, {
    confirmed: !set.confirmed,
  });
}

export function addTrainingSet(draft, exerciseOccurrenceId) {
  return updateExercise(draft, exerciseOccurrenceId, (exercise) => {
    const lastSet = exercise.sets.at(-1) ?? {
      reps: exercise.previousPerformance.reps,
      load: exercise.previousPerformance.load,
      unit: exercise.previousPerformance.unit,
    };
    const order = exercise.sets.length + 1;
    return {
      ...exercise,
      sets: [...exercise.sets, {
        id: `${exercise.id}_set_${order}`,
        order,
        reps: lastSet.reps,
        load: lastSet.load,
        unit: lastSet.unit,
        confirmed: false,
      }],
    };
  });
}

export function removeTrainingSet(draft, exerciseOccurrenceId, setId) {
  return updateExercise(draft, exerciseOccurrenceId, (exercise) => ({
    ...exercise,
    sets: exercise.sets
      .filter((set) => set.id !== setId)
      .map((set, index) => ({ ...set, order: index + 1 })),
  }));
}

export function assignTrainingVariant(draft, exerciseOccurrenceId, value) {
  const executionVariant = normalizeTrainingExecutionVariant(value);
  return refreshComparableContexts(updateExercise(
    draft,
    exerciseOccurrenceId,
    (exercise) => ({ ...exercise, executionVariant })
  ));
}

export function removeTrainingVariant(draft, exerciseOccurrenceId) {
  return refreshComparableContexts(updateExercise(
    draft,
    exerciseOccurrenceId,
    (exercise) => ({ ...exercise, executionVariant: null })
  ));
}

export function createTrainingSuperset(draft, firstExerciseId, secondExerciseId) {
  if (!firstExerciseId || !secondExerciseId || firstExerciseId === secondExerciseId) return draft;
  if (![firstExerciseId, secondExerciseId].every((id) =>
    draft.exercises.some((exercise) => exercise.id === id)
  )) return draft;

  let groups = removeExerciseFromTrainingRelationshipGroups(
    draft.exerciseRelationshipGroups,
    firstExerciseId
  );
  groups = removeExerciseFromTrainingRelationshipGroups(groups, secondExerciseId);
  const group = createTrainingExerciseRelationshipGroup({
    memberExerciseIds: [firstExerciseId, secondExerciseId],
    provenance_ref: isProductionDraft(draft)
      ? `training_logger_draft_${draft.draftId}`
      : "training_logger_preview_draft",
    relationshipType: TRAINING_EXERCISE_RELATIONSHIP_TYPES.SUPERSET,
  });
  return refreshComparableContexts({
    ...draft,
    exerciseRelationshipGroups: [...groups, group],
  });
}

export function removeTrainingSuperset(draft, relationshipGroupId) {
  return refreshComparableContexts({
    ...draft,
    exerciseRelationshipGroups: draft.exerciseRelationshipGroups.filter(
      (group) => group.id !== relationshipGroupId
    ),
  });
}

export function applyProgressionSuggestion(draft, exerciseOccurrenceId) {
  return updateExercise(draft, exerciseOccurrenceId, (exercise) => {
    const recommendation = exercise.progressionRecommendation;
    if (
      recommendation?.suggestedReps == null ||
      recommendation?.suggestedLoad == null
    ) return exercise;
    return {
      ...exercise,
      progressionChoice: PROGRESSION_CHOICES.SUGGESTION,
      sets: exercise.sets.map((set) => ({
        ...set,
        reps: recommendation.suggestedReps,
        load: recommendation.suggestedLoad,
        confirmed: false,
      })),
    };
  });
}

export function keepPreviousPerformance(draft, exerciseOccurrenceId) {
  return updateExercise(draft, exerciseOccurrenceId, (exercise) => ({
    ...exercise,
    progressionChoice: PROGRESSION_CHOICES.PREVIOUS,
    sets: exercise.sets.map((set) => ({
      ...set,
      reps: exercise.previousPerformance.reps,
      load: exercise.previousPerformance.load,
      confirmed: false,
    })),
  }));
}

export function buildTrainingWorkoutSummary(draft) {
  const sets = draft.exercises.flatMap((exercise) => exercise.sets);
  return {
    exerciseCount: draft.exercises.length,
    setCount: sets.length,
    confirmedSetCount: sets.filter((set) => set.confirmed).length,
    variantCount: draft.exercises.filter((exercise) => exercise.executionVariant).length,
    supersetCount: draft.exerciseRelationshipGroups.length,
    durationMinutes: isProductionDraft(draft) && draft.mode === TRAINING_LOGGER_MODES.LIVE
      ? getElapsedMinutes(draft.startedAt, draft.finishedAt)
      : draft.mode === TRAINING_LOGGER_MODES.LIVE
        ? 54
        : null,
  };
}

export function loadAppleHealthReconciliationFixture(draft, fixtureName) {
  const evidenceItems = APPLE_HEALTH_RECONCILIATION_FIXTURES[fixtureName];
  if (!evidenceItems) return draft;
  return {
    ...draft,
    reconciliation: createAppleHealthReconciliation({
      evidenceItems,
      workoutDate: draft.workoutDate,
    }),
  };
}

export function selectAppleHealthMatch(draft, sourceWorkoutId) {
  return {
    ...draft,
    reconciliation: selectStrengthEvidence(draft.reconciliation, sourceWorkoutId),
  };
}

export function continueWithoutAppleHealthMatch(draft) {
  return {
    ...draft,
    reconciliation: continueWithoutStrengthEvidence(draft.reconciliation),
  };
}

export function toggleAppleHealthAdditionalEvidence(draft, sourceWorkoutId) {
  return {
    ...draft,
    reconciliation: toggleAdditionalEvidence(draft.reconciliation, sourceWorkoutId),
  };
}

export function finalizeTrainingLoggerReconciliation(draft) {
  return {
    ...draft,
    reconciliation: finalizeAppleHealthReconciliation(draft.reconciliation),
  };
}

export function buildEvidenceReviewHandoff(draft) {
  const summary = buildTrainingWorkoutSummary(draft);
  const proposedRecords = draft.reconciliation.proposedCanonicalRecords;
  const strengthProposal = proposedRecords.find((record) =>
    record.canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION
  );
  const acceptedAppleWorkouts = proposedRecords
    .filter((record) => record.sourceWorkoutId)
    .map((record) => ({
      ...getReconciliationEvidenceItem(draft.reconciliation, record.sourceWorkoutId),
      canonicalOwnerType: record.canonicalOwnerType,
      disposition: record.disposition,
    }));
  return {
    status: "ready_to_log",
    previewOnly: true,
    workoutDetails: {
      ...summary,
      workoutDate: draft.workoutDate,
      workoutTime: draft.workoutTime,
    },
    appleHealth: {
      status: strengthProposal?.sourceWorkoutId ? "matched" : "not_linked",
      batchId: draft.reconciliation.batchId,
      acceptedWorkouts: acceptedAppleWorkouts,
      strengthWorkout: acceptedAppleWorkouts.find((workout) =>
        workout.canonicalOwnerType === APPLE_WORKOUT_CANONICAL_OWNER_TYPES.TRAINING_SESSION
      ) ?? null,
    },
    proposedCanonicalRecords: proposedRecords,
    structuredTrainingContext: {
      executionContexts: draft.exercises
        .filter((exercise) => exercise.executionVariant)
        .map((exercise) => ({
          exerciseOccurrenceId: exercise.id,
          canonicalExerciseId: exercise.canonicalExerciseId,
          exerciseName: exercise.name,
          executionVariant: exercise.executionVariant,
        })),
      exerciseRelationshipGroups: draft.exerciseRelationshipGroups,
    },
  };
}

export function getSupersetContext(draft, exerciseOccurrenceId) {
  const group = draft.exerciseRelationshipGroups.find((candidate) =>
    candidate.memberExerciseIds.includes(exerciseOccurrenceId)
  );
  if (!group) return null;
  const partners = group.memberExerciseIds
    .filter((id) => id !== exerciseOccurrenceId)
    .map((id) => draft.exercises.find((exercise) => exercise.id === id))
    .filter(Boolean);
  return { group, partners };
}

export function canContinueFromReconciliation(draft) {
  return canFinalizeAppleHealthReconciliation(draft.reconciliation);
}

function updateExercise(draft, exerciseOccurrenceId, updater) {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === exerciseOccurrenceId ? updater(exercise) : exercise
    ),
  };
}

function refreshComparableContexts(draft) {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) => {
      const relationshipContext = getRelationshipContext(draft, exercise.id);
      const previousPerformance = selectDraftPreviousPerformance(draft, {
        canonicalExerciseId: exercise.canonicalExerciseId,
        executionVariant: exercise.executionVariant,
        relationshipContext,
        relationshipKey: getRelationshipKey(draft, exercise.id),
      });
      return {
        ...exercise,
        previousPerformance,
        progressionRecommendation: selectDraftProgressionRecommendation(draft, {
          canonicalExerciseId: exercise.canonicalExerciseId,
          executionVariant: exercise.executionVariant,
          previousPerformance,
          relationshipContext,
        }),
      };
    }),
  };
}

function getRelationshipContext(draft, exerciseOccurrenceId) {
  const context = getSupersetContext(draft, exerciseOccurrenceId);
  if (!context) return null;
  return {
    relationshipType: context.group.relationshipType,
    orderedPartners: context.partners.map((partner) => ({
      canonicalExerciseId: partner.canonicalExerciseId,
      name: partner.name,
    })),
  };
}

function getRelationshipKey(draft, exerciseOccurrenceId) {
  const context = getSupersetContext(draft, exerciseOccurrenceId);
  if (!context) return "standalone";
  const partnerIds = context.partners
    .map((partner) => partner.canonicalExerciseId)
    .sort()
    .join(",");
  return `superset|partners:${partnerIds}`;
}

function selectComparablePreviousPerformance({
  canonicalExerciseId,
  executionVariant = null,
  relationshipKey = "standalone",
}) {
  const variantKey = normalizeTrainingExecutionVariant(executionVariant)?.key ?? "ordinary";
  const fixture = HISTORY_FIXTURES[canonicalExerciseId]?.[variantKey]?.[relationshipKey]
    ?? HISTORY_FIXTURES[canonicalExerciseId]?.[variantKey]?.standalone
    ?? HISTORY_FIXTURES[canonicalExerciseId]?.ordinary?.standalone
    ?? DEFAULT_HISTORY;
  return { ...fixture };
}

function selectDraftPreviousPerformance(draft, context) {
  if (!isProductionDraft(draft)) return selectComparablePreviousPerformance(context);
  const result = resolvePreviousExerciseOccurrence({
    before: `${draft.workoutDate}T00:00:00.000Z`,
    canonicalExerciseId: context.canonicalExerciseId,
    relationshipContext: context.relationshipContext,
    sessions: draft.productionContext?.historySessions ?? [],
    variantKey: context.executionVariant,
  });
  const occurrence = result.exactVariantOccurrence;
  if (!occurrence) {
    return {
      date: null,
      reps: 0,
      load: 0,
      unit: "lb",
      setCount: 3,
      context: "No comparable history yet",
      firstUse: true,
      matchKind: result.matchKind,
    };
  }
  const set = selectRepresentativeSet(occurrence.exercise.sets);
  return {
    date: String(occurrence.session.observed_at ?? occurrence.session.date).slice(0, 10),
    reps: set?.reps ?? 0,
    load: set?.load ?? 0,
    unit: set?.unit ?? "lb",
    setCount: Math.max(1, occurrence.exercise.sets?.length ?? 0),
    context: "Previous comparable session",
    firstUse: false,
    matchKind: result.matchKind,
    sourceSessionId: occurrence.session.id ?? null,
  };
}

function selectDraftProgressionRecommendation(draft, context) {
  if (!isProductionDraft(draft)) {
    return RECOMMENDATION_FIXTURES[context.canonicalExerciseId]
      ?? createMaintainRecommendation(context.previousPerformance);
  }
  const result = createTrainingLoggerProgressionRecommendation({
    canonicalExerciseId: context.canonicalExerciseId,
    goalContext: draft.productionContext?.goalContext,
    nowDate: draft.workoutDate,
    relationshipContext: context.relationshipContext,
    sessions: draft.productionContext?.historySessions ?? [],
    variant: context.executionVariant,
  });
  if (result.status === TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT) return null;
  const state = result.status === TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY
    ? PROGRESSION_STATES.OPPORTUNITY
    : result.status === TRAINING_LOGGER_PROGRESSION_STATUS.RECOVER
      ? PROGRESSION_STATES.RECOVER
      : PROGRESSION_STATES.MAINTAIN;
  const prescription = result.recommendedLoad != null && result.recommendedReps != null
    ? `${result.recommendedLoad} lb × ${result.recommendedReps}`
    : result.recommendedAction === "consider_progression"
      ? "Progress manually if today’s performance supports it"
      : "Repeat the latest comparable performance";
  return {
    state,
    eyebrow: state === PROGRESSION_STATES.OPPORTUNITY
      ? "Progression opportunity"
      : state === PROGRESSION_STATES.RECOVER
        ? "Recovery opportunity"
        : "Maintain current performance",
    message: result.reason,
    prescription,
    suggestedLoad: result.recommendedLoad,
    suggestedReps: result.recommendedReps,
    confidence: result.confidence,
    historyReferences: result.historyReferences,
    comparisonContext: result.comparisonContext,
    calibration: result.calibration,
  };
}

function selectRepresentativeSet(sets = []) {
  return (sets ?? []).map((set) => ({
    load: Number(set.weight ?? set.load ?? 0),
    reps: Number(set.reps ?? 0),
    unit: set.weight_unit ?? set.unit ?? "lb",
  })).sort((left, right) => right.load - left.load || right.reps - left.reps)[0] ?? null;
}

function resolveProvisionalTrainingLoggerInput(draft, input = {}) {
  const canonicalExercises = draft.productionContext?.exerciseLibrary?.length
    ? draft.productionContext.exerciseLibrary
    : listCanonicalTrainingExerciseIdentities();
  if (input.canonicalExerciseId) {
    const identity = canonicalExercises.find(
      (exercise) => exercise.id === input.canonicalExerciseId
    );
    return identity ? { canonicalExerciseId: identity.id, identity } : null;
  }

  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  const normalizedName = normalizeExercisePhrase(name);
  const exactIdentity = canonicalExercises.find((exercise) =>
    [exercise.name, ...(exercise.aliases ?? [])]
      .some((value) => normalizeExercisePhrase(value) === normalizedName)
  );
  const resolved = exactIdentity ? null : resolveTrainingExerciseIdentity(name);
  const identity = exactIdentity ?? canonicalExercises.find(
    (exercise) => exercise.id === resolved?.canonicalExerciseId
  );
  if (identity) return { canonicalExerciseId: identity.id, identity };

  const category = resolveCanonicalTrainingMuscleGroup(input.category);
  if (!category || !TRAINING_LOGGER_USER_FACING_AREA_IDS.includes(category.id)) return null;
  return { canonicalExerciseId: null, category, name };
}

function buildCanonicalTrainingLoggerOccurrence({
  draft,
  identity,
  occurrenceId,
  previousPerformance,
  relationshipContext = null,
}) {
  return {
    id: occurrenceId,
    exerciseOccurrenceId: occurrenceId,
    canonicalExerciseId: identity.id,
    name: identity.name,
    bodyRegion: identity.body_region,
    equipment: identity.equipment,
    executionVariant: null,
    sets: createTrainingLoggerDraftSets(occurrenceId, previousPerformance),
    previousPerformance,
    progressionRecommendation: selectDraftProgressionRecommendation(draft, {
      canonicalExerciseId: identity.id,
      executionVariant: null,
      previousPerformance,
      relationshipContext,
    }),
    progressionChoice: PROGRESSION_CHOICES.PREVIOUS,
  };
}

function createProvisionalTrainingLoggerOccurrence({
  category,
  draft,
  name,
  occurrenceId,
  previousPerformance,
}) {
  const provenanceRef = getTrainingLoggerDraftProvenanceRef(draft);
  const provisionalExerciseId = `provisional_exercise_${occurrenceId
    .replace(/^exercise_occurrence_/, "")}`;
  return {
    id: occurrenceId,
    exerciseOccurrenceId: occurrenceId,
    canonicalExerciseId: null,
    name,
    bodyRegion: null,
    equipment: null,
    executionVariant: null,
    resolutionStatus: "unresolved_provisional",
    provisionalExercise: {
      provisionalExerciseId,
      rawSubmittedName: name,
      normalizedDisplayName: name,
      originalSourceText: name,
      sourceProvenance: { sourceArtifactRefs: [provenanceRef] },
      resolutionStatus: "unresolved",
      suggestedCanonicalName: name,
      suggestedPrimaryMuscleGroup: category.label,
      suggestedPrimaryMuscleGroupId: category.id,
      suggestedPrimaryMuscleGroupConfidence: "user_supplied",
      suggestedMovementPattern: null,
      suggestedEquipment: null,
      suggestedLaterality: null,
      suggestedAliases: [],
      matchingCanonicalCandidates: [],
    },
    sets: createTrainingLoggerDraftSets(occurrenceId, previousPerformance),
    previousPerformance,
    progressionRecommendation: null,
    progressionChoice: PROGRESSION_CHOICES.PREVIOUS,
  };
}

function createTrainingLoggerDraftSets(occurrenceId, previousPerformance) {
  return Array.from({ length: previousPerformance.setCount }, (_, index) => ({
    id: `${occurrenceId}_set_${index + 1}`,
    order: index + 1,
    reps: previousPerformance.reps,
    load: previousPerformance.load,
    unit: previousPerformance.unit,
    confirmed: false,
  }));
}

function createFirstUsePreviousPerformance() {
  return {
    date: null,
    reps: 0,
    load: 0,
    unit: "lb",
    setCount: 3,
    context: "No comparable history yet",
    firstUse: true,
    matchKind: "none",
  };
}

function getTrainingLoggerDraftProvenanceRef(draft) {
  return isProductionDraft(draft)
    ? `training_logger_draft_${draft.draftId}`
    : "training_logger_preview_draft";
}

function isProductionDraft(draft) {
  return draft?.draftVersion === "training_logger_web_v1";
}

function getElapsedMinutes(startedAt, finishedAt = null) {
  const started = Date.parse(String(startedAt ?? ""));
  if (!Number.isFinite(started)) return null;
  const finished = Date.parse(String(finishedAt ?? ""));
  const end = Number.isFinite(finished) ? finished : Date.now();
  return Math.max(1, Math.round((end - started) / 60000));
}

function createMaintainRecommendation(previousPerformance) {
  return {
    state: PROGRESSION_STATES.MAINTAIN,
    eyebrow: "Maintain current performance",
    message: "Repeat the last comparable performance with consistent form.",
    prescription: `Repeat ${previousPerformance.load} lb × ${previousPerformance.reps}`,
    suggestedLoad: previousPerformance.load,
    suggestedReps: previousPerformance.reps,
  };
}

function history(date, reps, load, setCount, context) {
  return Object.freeze({ date, reps, load, unit: "lb", setCount, context });
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}
