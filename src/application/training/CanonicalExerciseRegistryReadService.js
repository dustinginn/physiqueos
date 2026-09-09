import {
  listCanonicalTrainingExerciseIdentities,
  registerRuntimeTrainingExercises,
} from "../../domain/models/trainingExerciseIdentity.js";
import { validateTrainingNavigationTaxonomy } from "../../navigation/trainingNavigationMapping.js";

export function hydrateCanonicalTrainingExerciseRegistry(
  runtimeExercises = []
) {
  const canonicalExercises = registerRuntimeTrainingExercises(runtimeExercises);
  const registrations = canonicalExercises.map((exercise) => ({
    canonicalExerciseId: exercise.id,
    familyLabel: exercise.movement_pattern,
    label: exercise.name,
    primaryMuscleGroupId: exercise.primary_muscle_group_id,
    primaryMuscleGroups: exercise.primary_muscle_groups,
    regionLabel: exercise.body_region,
  }));
  const result = validateTrainingNavigationTaxonomy(registrations, {
    browsableCanonicalIds: canonicalExercises.map((exercise) => exercise.id),
  });
  if (!result.valid) {
    throw Object.assign(
      new Error("The canonical Training exercise registry has invalid Library taxonomy."),
      {
        code: "CANONICAL_EXERCISE_TAXONOMY_INVALID",
        diagnostics: result,
      }
    );
  }
  return Object.freeze([...canonicalExercises]);
}

export function readCurrentCanonicalTrainingExerciseRegistry() {
  return Object.freeze([...listCanonicalTrainingExerciseIdentities()]);
}
