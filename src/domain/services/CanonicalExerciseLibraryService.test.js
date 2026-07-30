import { describe, expect, it } from "vitest";
import {
  assertNoUnresolvedProvisionalExercises,
  canonicalDefinitionsPendingCreation,
  createCanonicalExerciseDefinition,
  findCanonicalExerciseConflict,
  resolveProvisionalExerciseInPackage,
} from "./CanonicalExerciseLibraryService";

describe("canonical exercise review resolution", () => {
  it("blocks unresolved confirmation without changing the package", () => {
    const evidencePackage = fixture();
    expect(() => assertNoUnresolvedProvisionalExercises(evidencePackage))
      .toThrow(/needs details/);
    expect(evidencePackage.evidence_objects[0].exercises[0].sets).toHaveLength(4);
  });

  it("resolves a new definition while retaining sets and provenance", () => {
    const canonical = createCanonicalExerciseDefinition({
      canonicalName: "Bicep Curl Machine",
      primaryMuscleGroup: "Biceps",
      movementPattern: "Elbow Flexion",
      equipment: "Machine",
      laterality: "Bilateral",
      aliases: "Machine Bicep Curl, Biceps Curl Machine",
    });
    const resolved = resolveProvisionalExerciseInPackage(
      fixture(),
      "provisional_1",
      { mode: "new", canonical }
    );
    const exercise = resolved.evidence_objects[0].exercises[0];
    expect(exercise).toMatchObject({
      canonicalExerciseId: "bicep_curl_machine",
      resolutionStatus: "resolved_new_canonical",
      provenance_ref: "typed_fixture",
    });
    expect(exercise.sets).toHaveLength(4);
    expect(canonicalDefinitionsPendingCreation(resolved)).toEqual([canonical]);
    expect(() => assertNoUnresolvedProvisionalExercises(resolved)).not.toThrow();
  });

  it("maps to an existing identity without creating a definition", () => {
    const canonical = {
      id: "spider_curls", name: "Spider Curls", aliases: [],
      equipment: "dumbbell", body_region: "upper_body",
      primary_muscle_groups: ["biceps"], movement_pattern: "elbow_flexion",
      laterality: "bilateral",
    };
    const resolved = resolveProvisionalExerciseInPackage(
      fixture(), "provisional_1", { mode: "existing", canonical }
    );
    expect(resolved.evidence_objects[0].exercises[0].canonicalExerciseId).toBe("spider_curls");
    expect(canonicalDefinitionsPendingCreation(resolved)).toEqual([]);
  });

  it("records explicit removal", () => {
    const resolved = resolveProvisionalExerciseInPackage(
      fixture(), "provisional_1", { mode: "remove" }
    );
    expect(resolved.evidence_objects[0].exercises[0]).toMatchObject({
      removed: true,
      provisionalExercise: { disposition: "explicitly_removed_from_workout" },
    });
    expect(() => assertNoUnresolvedProvisionalExercises(resolved)).not.toThrow();
  });

  it("detects normalized name and alias conflicts without fuzzy matching", () => {
    expect(findCanonicalExerciseConflict(createCanonicalExerciseDefinition({
      canonicalName: "Spider-Curls",
      primaryMuscleGroup: "Biceps",
      movementPattern: "Elbow Flexion",
      equipment: "Dumbbell",
      laterality: "Bilateral",
    }))?.id).toBe("spider_curl");
  });
});

function fixture() {
  return {
    evidence_objects: [{
      id: "training_1",
      evidence_type: "training",
      exercises: [{
        id: "provisional_1",
        name: "Bicep Curl Machine",
        provenance_ref: "typed_fixture",
        sets: Array.from({ length: 4 }, () => ({ reps: 18, weight: 75 })),
        resolutionStatus: "unresolved_provisional",
        provisionalExercise: {
          provisionalExerciseId: "provisional_1",
          resolutionStatus: "unresolved",
        },
      }],
    }],
  };
}
