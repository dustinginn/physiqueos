import { resolveTrainingExerciseIdentity } from "../domain/models/trainingExerciseIdentity";
import { resolveCanonicalTrainingMuscleGroup } from "../domain/models/trainingMuscleGroupIdentity";

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

function clean(value) {
  return String(value ?? "").trim();
}
