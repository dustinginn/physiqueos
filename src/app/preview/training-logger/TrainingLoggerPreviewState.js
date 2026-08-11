import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
} from "../../../domain/models/trainingExerciseIdentity";
import {
  listCanonicalTrainingMuscleGroups,
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

export const TRAINING_LOGGER_PREVIEW_VERSION = "training_logger_preview_v1_1";

export const TRAINING_LOGGER_MODES = Object.freeze({
  LIVE: "live",
  RETROSPECTIVE: "retrospective",
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

export const APPLE_HEALTH_MATCH_STATES = Object.freeze({
  STRONG: "strong_match",
  MULTIPLE: "multiple_matches",
  NONE: "no_match",
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

export const APPLE_HEALTH_MATCH_FIXTURES = Object.freeze({
  [APPLE_HEALTH_MATCH_STATES.STRONG]: Object.freeze([
    healthMatch("health_strength_1612", "Traditional Strength Training", "4:12 PM", "5:06 PM", 54, 430),
  ]),
  [APPLE_HEALTH_MATCH_STATES.MULTIPLE]: Object.freeze([
    healthMatch("health_strength_1612", "Traditional Strength Training", "4:12 PM", "5:06 PM", 54, 430),
    healthMatch("health_strength_1740", "Functional Strength Training", "5:40 PM", "6:24 PM", 44, 356),
  ]),
  [APPLE_HEALTH_MATCH_STATES.NONE]: Object.freeze([]),
});

export function listTrainingLoggerCategories() {
  return listCanonicalTrainingMuscleGroups().map((muscleGroup) => muscleGroup.label);
}

export function listTrainingLoggerExercises({ categories = [], search = "" } = {}) {
  const selected = new Set(categories.map((category) => category.toLowerCase()));
  const query = String(search).trim().toLowerCase();
  return FOUNDER_ALPHA_TRAINING_EXERCISES.filter((exercise) => {
    const categoryMatches = selected.size === 0 || getExerciseTrainingCategories(exercise)
      .some((category) => selected.has(category));
    const searchMatches = !query || [exercise.name, exercise.movement_pattern, exercise.equipment]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
    return categoryMatches && searchMatches;
  });
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
    reconciliation: {
      matchState: APPLE_HEALTH_MATCH_STATES.STRONG,
      candidates: cloneMatches(APPLE_HEALTH_MATCH_STATES.STRONG),
      selectedMatchId: null,
      continueWithoutMatch: false,
    },
  };
}

export function initializeTrainingLoggerMode(draft, mode) {
  if (!Object.values(TRAINING_LOGGER_MODES).includes(mode)) return draft;
  return {
    ...draft,
    mode,
    step: TRAINING_LOGGER_STEPS.CATEGORIES,
    startedAtLabel: mode === TRAINING_LOGGER_MODES.LIVE ? "Started now" : null,
    workoutTime: null,
  };
}

export function updateWorkoutContext(draft, changes = {}) {
  return {
    ...draft,
    ...changes,
    workoutTime: draft.mode === TRAINING_LOGGER_MODES.RETROSPECTIVE
      ? null
      : changes.workoutTime ?? draft.workoutTime,
  };
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
  const identity = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
    (exercise) => exercise.id === canonicalExerciseId
  );
  if (!identity) return draft;

  const occurrenceIndex = draft.nextOccurrenceIndex;
  const id = createTrainingExerciseOccurrenceId({
    canonicalExerciseId,
    occurrenceIndex,
    provenanceRef: "training_logger_preview_draft",
  });
  const previousPerformance = selectComparablePreviousPerformance({
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
    progressionRecommendation:
      RECOMMENDATION_FIXTURES[canonicalExerciseId] ?? createMaintainRecommendation(previousPerformance),
    progressionChoice: PROGRESSION_CHOICES.PREVIOUS,
  };
  return {
    ...draft,
    exercises: [...draft.exercises, occurrence],
    nextOccurrenceIndex: occurrenceIndex + 1,
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
    provenance_ref: "training_logger_preview_draft",
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
    durationMinutes: draft.mode === TRAINING_LOGGER_MODES.LIVE ? 54 : null,
  };
}

export function setAppleHealthMatchState(draft, matchState) {
  if (!Object.values(APPLE_HEALTH_MATCH_STATES).includes(matchState)) return draft;
  return {
    ...draft,
    reconciliation: {
      matchState,
      candidates: cloneMatches(matchState),
      selectedMatchId: null,
      continueWithoutMatch: false,
    },
  };
}

export function selectAppleHealthMatch(draft, matchId) {
  const exists = draft.reconciliation.candidates.some((match) => match.id === matchId);
  if (!exists) return draft;
  return {
    ...draft,
    reconciliation: {
      ...draft.reconciliation,
      selectedMatchId: matchId,
      continueWithoutMatch: false,
    },
  };
}

export function continueWithoutAppleHealthMatch(draft) {
  return {
    ...draft,
    reconciliation: {
      ...draft.reconciliation,
      selectedMatchId: null,
      continueWithoutMatch: true,
    },
  };
}

export function buildEvidenceReviewHandoff(draft) {
  const summary = buildTrainingWorkoutSummary(draft);
  const selectedMatch = draft.reconciliation.candidates.find(
    (match) => match.id === draft.reconciliation.selectedMatchId
  ) ?? null;
  return {
    status: "ready_to_log",
    previewOnly: true,
    workoutDetails: summary,
    appleHealth: selectedMatch
      ? { status: "matched", workout: selectedMatch }
      : { status: "not_linked", workout: null },
    executionContexts: draft.exercises
      .filter((exercise) => exercise.executionVariant)
      .map((exercise) => ({
        exerciseOccurrenceId: exercise.id,
        canonicalExerciseId: exercise.canonicalExerciseId,
        exerciseName: exercise.name,
        executionVariant: exercise.executionVariant,
      })),
    exerciseRelationshipGroups: draft.exerciseRelationshipGroups,
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
  if (draft.reconciliation.matchState === APPLE_HEALTH_MATCH_STATES.NONE) {
    return draft.reconciliation.continueWithoutMatch;
  }
  return Boolean(draft.reconciliation.selectedMatchId);
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
    exercises: draft.exercises.map((exercise) => ({
      ...exercise,
      previousPerformance: selectComparablePreviousPerformance({
        canonicalExerciseId: exercise.canonicalExerciseId,
        executionVariant: exercise.executionVariant,
        relationshipKey: getRelationshipKey(draft, exercise.id),
      }),
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

function healthMatch(id, type, startTime, endTime, durationMinutes, activeCalories) {
  return Object.freeze({ id, type, startTime, endTime, durationMinutes, activeCalories });
}

function cloneMatches(matchState) {
  return APPLE_HEALTH_MATCH_FIXTURES[matchState].map((match) => ({ ...match }));
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function getExerciseTrainingCategories(exercise) {
  const navigationCategory = getPrimaryTrainingNavigationGroup({
    canonicalExerciseId: exercise.id,
    label: exercise.name,
    primaryMuscleGroups: exercise.primary_muscle_groups,
    regionLabel: exercise.body_region,
  });
  return navigationCategory ? [navigationCategory] : [];
}
