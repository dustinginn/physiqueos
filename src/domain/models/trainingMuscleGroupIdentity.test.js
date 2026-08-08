import { describe, expect, it } from "vitest";
import { TRAINING_NAVIGATION_CATEGORIES } from "../../navigation/trainingNavigationMapping";
import {
  CANONICAL_TRAINING_MUSCLE_GROUPS,
  resolveCanonicalTrainingMuscleGroup,
  searchCanonicalTrainingMuscleGroups,
  suggestCanonicalTrainingMuscleGroup,
} from "./trainingMuscleGroupIdentity";

describe("canonical training muscle-group identity", () => {
  it("is the source used to derive the existing training navigation categories", () => {
    expect(TRAINING_NAVIGATION_CATEGORIES).toEqual(
      CANONICAL_TRAINING_MUSCLE_GROUPS.map((item) => item.id)
    );
    expect(new Set(TRAINING_NAVIGATION_CATEGORIES).size)
      .toBe(TRAINING_NAVIGATION_CATEGORIES.length);
  });

  it("exposes the complete existing IDs and exact display labels", () => {
    expect(CANONICAL_TRAINING_MUSCLE_GROUPS).toEqual([
      { id: "chest", label: "Chest" },
      { id: "back", label: "Back" },
      { id: "shoulders", label: "Shoulders" },
      { id: "biceps", label: "Biceps" },
      { id: "triceps", label: "Triceps" },
      { id: "core", label: "Core" },
      { id: "quads", label: "Quads" },
      { id: "hamstrings", label: "Hamstrings" },
      { id: "glutes", label: "Glutes" },
      { id: "calves", label: "Calves" },
      { id: "adductors", label: "Adductors" },
    ]);
  });

  it("resolves only canonical IDs or exact canonical labels", () => {
    expect(resolveCanonicalTrainingMuscleGroup("GLUTES"))
      .toEqual({ id: "glutes", label: "Glutes" });
    expect(resolveCanonicalTrainingMuscleGroup("Glutes"))
      .toEqual({ id: "glutes", label: "Glutes" });
    expect(resolveCanonicalTrainingMuscleGroup("Glute Muscles")).toBeNull();
    expect(resolveCanonicalTrainingMuscleGroup("unknown")).toBeNull();
  });

  it("searches existing options without creating a query-backed option", () => {
    expect(searchCanonicalTrainingMuscleGroups("Glu"))
      .toEqual([{ id: "glutes", label: "Glutes" }]);
    expect(searchCanonicalTrainingMuscleGroups("Glute Muscles")).toEqual([]);
    expect(searchCanonicalTrainingMuscleGroups("")).toHaveLength(
      CANONICAL_TRAINING_MUSCLE_GROUPS.length
    );
  });

  it("provides only high-confidence canonical suggestions", () => {
    expect(suggestCanonicalTrainingMuscleGroup("Smith Machine Hip Thrusts"))
      .toEqual({
        confidence: "high",
        muscleGroup: { id: "glutes", label: "Glutes" },
      });
    expect(suggestCanonicalTrainingMuscleGroup("Unknown Rotation"))
      .toEqual({ confidence: "low", muscleGroup: null });
  });
});
