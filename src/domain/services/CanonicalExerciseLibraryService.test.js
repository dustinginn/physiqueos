import { describe, expect, it } from "vitest";
import {
  assertNoUnresolvedProvisionalExercises,
  canonicalDefinitionsPendingCreation,
  createCanonicalExerciseDefinition,
  findCanonicalExerciseConflict,
  listExercisesWithoutCanonicalIdentity,
  prepareCanonicalExerciseIdentitiesForConfirmation,
  searchCanonicalExerciseOptions,
  resolveProvisionalExerciseInPackage,
} from "./CanonicalExerciseLibraryService";
import {
  registerRuntimeTrainingExercises,
} from "../models/trainingExerciseIdentity";
import { afterEach } from "vitest";

afterEach(() => registerRuntimeTrainingExercises([]));

describe("canonical exercise review resolution", () => {
  it("blocks unresolved confirmation without changing the package", () => {
    const evidencePackage = fixture();
    expect(() => assertNoUnresolvedProvisionalExercises(evidencePackage))
      .toThrow(/needs details/);
    expect(evidencePackage.evidence_objects[0].exercises[0].sets).toHaveLength(4);
  });

  it("blocks a resolved-looking exercise that lacks a canonical ID", () => {
    const evidencePackage = fixture();
    evidencePackage.evidence_objects[0].exercises[0] = {
      ...evidencePackage.evidence_objects[0].exercises[0],
      provisionalExercise: null,
      resolutionStatus: "resolved",
    };
    expect(() => assertNoUnresolvedProvisionalExercises(evidencePackage))
      .toThrow(/needs details/);
  });

  it("recovers only resolver-validated canonical IDs for confirmation", () => {
    const evidencePackage = {
      evidence_objects: [{
        evidence_type: "training",
        exercises: [
          { name: "Bench Press", canonicalExerciseId: null, sets: [{ reps: 10, weight: 135 }] },
          { name: "Mystery Press", canonicalExerciseId: "fabricated", sets: [{ reps: 10, weight: 20 }] },
        ],
      }],
    };
    const prepared = prepareCanonicalExerciseIdentitiesForConfirmation(
      evidencePackage
    );
    expect(prepared.evidence_objects[0].exercises[0].canonicalExerciseId)
      .toBe("bench_press");
    expect(prepared.evidence_objects[0].exercises[1].canonicalExerciseId)
      .toBeNull();
  });

  it("resolves a new definition while retaining sets and provenance", () => {
    const canonical = createCanonicalExerciseDefinition({
      canonicalName: "Bicep Curl Machine",
      primaryMuscleGroupId: "biceps",
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
      id: "provisional_1",
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

  it("automatically dissolves a Superset when a member occurrence is removed", () => {
    const evidencePackage = fixture();
    evidencePackage.evidence_objects[0].exercises.push({
      id: "press_1",
      name: "Chest Press Machine",
      canonicalExerciseId: "chest_press_machine",
      sets: [{ reps: 8, weight: 100 }],
    });
    evidencePackage.evidence_objects[0].exerciseRelationshipGroups = [{
      id: "superset_1",
      relationshipType: "superset",
      memberExerciseIds: ["provisional_1", "press_1"],
    }];

    const resolved = resolveProvisionalExerciseInPackage(
      evidencePackage,
      "provisional_1",
      { mode: "remove" }
    );

    expect(resolved.evidence_objects[0].exerciseRelationshipGroups).toEqual([]);
    expect(resolved.evidence_objects[0].exercises).toHaveLength(2);
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

  it("requires only canonical name and primary muscle group", () => {
    expect(createCanonicalExerciseDefinition({
      canonicalName: "Smith Machine Hip Thrusts",
      primaryMuscleGroupId: "glutes",
    })).toMatchObject({
      equipment: null,
      laterality: null,
      movement_pattern: null,
      name: "Smith Machine Hip Thrusts",
      primary_muscle_group_id: "glutes",
      primary_muscle_groups: ["Glutes"],
    });
    expect(() => createCanonicalExerciseDefinition({
      canonicalName: "",
      primaryMuscleGroupId: "glutes",
    })).toThrow(/Canonical exercise name/);
    expect(() => createCanonicalExerciseDefinition({
      canonicalName: "Smith Machine Hip Thrusts",
      primaryMuscleGroupId: "",
    })).toThrow(/valid primary muscle group/i);
  });

  it("rejects arbitrary labels and stale IDs while canonicalizing accepted casing", () => {
    expect(() => createCanonicalExerciseDefinition({
      canonicalName: "Smith Machine Hip Thrusts",
      primaryMuscleGroupId: "Glute Muscles",
    })).toThrow(/valid primary muscle group/i);
    expect(() => createCanonicalExerciseDefinition({
      canonicalName: "Smith Machine Hip Thrusts",
      primaryMuscleGroupId: "removed_group",
    })).toThrow(/valid primary muscle group/i);
    expect(createCanonicalExerciseDefinition({
      canonicalName: "Smith Machine Hip Thrusts",
      primaryMuscleGroupId: "GLUTES",
    })).toMatchObject({
      primary_muscle_group_id: "glutes",
      primary_muscle_groups: ["Glutes"],
    });
  });

  it("blocks normalized singular, plural, punctuation, and alias duplicates", () => {
    registerRuntimeTrainingExercises([{
      id: "smith_machine_hip_thrust",
      name: "Smith Machine Hip Thrust",
      aliases: ["Machine Glute Drive"],
    }]);
    expect(findCanonicalExerciseConflict(createCanonicalExerciseDefinition({
      canonicalName: "smith-machine hip thrusts",
      primaryMuscleGroupId: "glutes",
    }))?.id).toBe("smith_machine_hip_thrust");
    expect(findCanonicalExerciseConflict(createCanonicalExerciseDefinition({
      canonicalName: "Machine Glute Drive",
      primaryMuscleGroupId: "glutes",
    }))?.id).toBe("smith_machine_hip_thrust");
  });

  it("searches the complete canonical option model by name and alias", () => {
    const candidates = [
      { id: "sumo", name: "Sumo Squat Machine", aliases: ["Wide Stance Squat"] },
      { id: "curl", name: "Bicep Curl Machine", aliases: ["Machine Bicep Curl"] },
    ];
    expect(searchCanonicalExerciseOptions(candidates, "sumo")[0].id).toBe("sumo");
    expect(searchCanonicalExerciseOptions(candidates, "machine bicep")[0].id)
      .toBe("curl");
    expect(searchCanonicalExerciseOptions(candidates, "")).toHaveLength(2);
  });

  it("uses the server-provided app-wide options for client gate parity", () => {
    const evidencePackage = {
      evidence_objects: [{
        evidence_type: "training",
        exercises: [{
          name: "Bicep Curl Machine",
          canonicalExerciseId: "bicep_curl_machine",
          sets: [{ reps: 10, weight: 50 }],
        }],
      }],
    };
    expect(listExercisesWithoutCanonicalIdentity(evidencePackage, {
      canonicalExercises: [{
        id: "bicep_curl_machine",
        name: "Bicep Curl Machine",
      }],
    })).toEqual([]);
  });

  it("keeps each resolved-new muscle-group identity independently gated", () => {
    const valid = createCanonicalExerciseDefinition({
      canonicalName: "Smith Machine Hip Thrusts",
      primaryMuscleGroupId: "glutes",
    });
    const invalid = {
      ...valid,
      id: "unknown_rotation_machine",
      name: "Unknown Rotation Machine",
      primary_muscle_group_id: "removed_group",
    };
    const evidencePackage = {
      evidence_objects: [{
        evidence_type: "training",
        exercises: [valid, invalid].map((definition) => ({
          name: definition.name,
          canonicalExerciseId: definition.id,
          resolutionStatus: "resolved_new_canonical",
          provisionalExercise: {
            resolutionStatus: "resolved_new_canonical",
            confirmedDefinition: definition,
          },
        })),
      }],
    };
    expect(listExercisesWithoutCanonicalIdentity(evidencePackage))
      .toEqual([
        expect.objectContaining({ name: "Unknown Rotation Machine" }),
      ]);
    expect(() => assertNoUnresolvedProvisionalExercises(evidencePackage))
      .toThrow(/needs details/);
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
