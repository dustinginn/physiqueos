import { resolveTrainingExerciseIdentity } from "../domain/models/trainingExerciseIdentity";
import { resolveCanonicalTrainingMuscleGroup } from "../domain/models/trainingMuscleGroupIdentity";
import { getPrimaryTrainingNavigationGroup } from "../navigation/trainingNavigationMapping";

const INTERNAL_EXERCISE_IDENTIFIER = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

export function createTrainingExercisePresentation({
  canonicalExerciseId,
  canonicalName,
  category,
  historicalName,
} = {}) {
  const internalId = clean(canonicalExerciseId);
  const resolved = internalId
    ? resolveTrainingExerciseIdentity(internalId)
    : null;
  const resolvedName = clean(resolved?.canonicalExerciseName);
  const trustedName = firstSafeLabel(canonicalName, historicalName);
  const displayName = resolvedName || trustedName || "Exercise";
  const muscleGroup = resolveCanonicalTrainingMuscleGroup(category);

  return Object.freeze({
    canonicalExerciseId: internalId || null,
    categoryLabel: muscleGroup?.label ?? null,
    displayName,
    historicalOnly: !internalId,
    missingDisplayName: displayName === "Exercise",
    navigationLabel: displayName,
  });
}

export function getCanonicalTrainingCategoryLabel(value) {
  return resolveCanonicalTrainingMuscleGroup(value)?.label ?? null;
}

export function createTrainingLoggerExercisePickerPresentation(exercise = {}) {
  const exercisePresentation = createTrainingExercisePresentation({
    canonicalExerciseId: exercise.id ?? exercise.canonicalExerciseId,
    canonicalName: exercise.name,
    historicalName: exercise.name,
  });
  const navigationGroup = getPrimaryTrainingNavigationGroup({
    canonicalExerciseId: exercise.id ?? exercise.canonicalExerciseId,
    label: exercise.name,
    primaryMuscleGroups: exercise.primary_muscle_groups,
    regionLabel: exercise.body_region,
  });
  const categoryLabel = getCanonicalTrainingCategoryLabel(navigationGroup);
  const movementLabel = humanizeExerciseMetadata(exercise.movement_pattern);
  const secondaryParts = [...new Set([categoryLabel, movementLabel].filter(Boolean))];

  return Object.freeze({
    canonicalExerciseId: exercisePresentation.canonicalExerciseId,
    displayName: exercisePresentation.displayName,
    secondaryLabel: secondaryParts.join(" · ") || null,
  });
}

export function createTrainingLibraryMetadata(presentation) {
  return {
    title: `${presentation.displayName} | PhysiqueOS`,
    description: presentation.missingDisplayName
      ? "Review exercise training history and performance."
      : `Review ${presentation.displayName} training history and performance.`,
  };
}

function firstSafeLabel(...values) {
  return values.map(clean).find((value) => value && !isInternalIdentifier(value)) ?? "";
}

function isInternalIdentifier(value) {
  return INTERNAL_EXERCISE_IDENTIFIER.test(value);
}

function humanizeExerciseMetadata(value) {
  const normalized = clean(value);
  if (!normalized || /^(?:null|undefined)$/i.test(normalized)) return null;
  const words = normalized.replaceAll("_", " ").replace(/\s+/g, " ").trim();
  if (!words) return null;
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function clean(value) {
  return String(value ?? "").trim();
}
