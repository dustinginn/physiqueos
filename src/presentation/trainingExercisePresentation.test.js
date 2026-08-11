import { afterEach, describe, expect, it } from "vitest";
import {
  registerRuntimeTrainingExercises,
} from "../domain/models/trainingExerciseIdentity";
import {
  createTrainingLibraryMetadata,
  createTrainingExercisePresentation,
  createTrainingLoggerExercisePickerPresentation,
  getCanonicalTrainingCategoryLabel,
} from "./trainingExercisePresentation";

afterEach(() => registerRuntimeTrainingExercises([]));

describe("Training Library exercise presentation", () => {
  it.each([
    ["chest_fly_machine", "Chest Fly Machine"],
    ["single_leg_leg_press", "Single-Leg Leg Press"],
  ])("resolves %s through the canonical display-name contract", (id, displayName) => {
    expect(createTrainingExercisePresentation({ canonicalExerciseId: id }))
      .toMatchObject({ displayName, missingDisplayName: false });
  });

  it.each([
    ["bicep_curl_machine", "Bicep Curl Machine"],
    ["sumo_squat_machine", "Sumo Squat Machine"],
    ["leg_press_high_narrow", "Leg Press High And Narrow Feet"],
  ])("uses the stored runtime canonical name for %s", (id, displayName) => {
    registerRuntimeTrainingExercises([{ id, name: displayName }]);
    expect(createTrainingExercisePresentation({ canonicalExerciseId: id }).displayName)
      .toBe(displayName);
  });

  it("preserves historical-only names without fabricating canonical identity", () => {
    expect(createTrainingExercisePresentation({
      historicalName: "Historical Machine Squat",
      category: "glutes",
    })).toEqual(expect.objectContaining({
      canonicalExerciseId: null,
      categoryLabel: "Glutes",
      displayName: "Historical Machine Squat",
      historicalOnly: true,
    }));
  });

  it("uses an observable safe fallback instead of exposing an internal ID", () => {
    expect(createTrainingExercisePresentation({
      canonicalExerciseId: "provisional_exercise_47402721",
      canonicalName: "provisional_exercise_47402721",
    })).toMatchObject({ displayName: "Exercise", missingDisplayName: true });
  });

  it.each([
    ["chest", "Chest"],
    ["hamstrings", "Hamstrings"],
    ["glutes", "Glutes"],
    ["unknown_enum_key", null],
  ])("uses the authoritative category vocabulary for %s", (value, label) => {
    expect(getCanonicalTrainingCategoryLabel(value)).toBe(label);
  });

  it("builds canonical document metadata without the route slug", () => {
    const metadata = createTrainingLibraryMetadata({
      displayName: "Chest Fly Machine",
      missingDisplayName: false,
    });

    expect(metadata).toEqual({
      title: "Chest Fly Machine | PhysiqueOS",
      description: "Review Chest Fly Machine training history and performance.",
    });
    expect(JSON.stringify(metadata)).not.toContain("chest_fly_machine");
  });

  it("creates a human-readable Logger picker label without raw taxonomy leakage", () => {
    registerRuntimeTrainingExercises([{
      id: "runtime_curl",
      name: "Runtime Curl",
      body_region: "upper_body",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: null,
    }]);

    const presentation = createTrainingLoggerExercisePickerPresentation({
      id: "runtime_curl",
      name: "runtime_curl",
      body_region: "upper_body",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: null,
    });

    expect(presentation).toMatchObject({
      displayName: "Runtime Curl",
      secondaryLabel: "Biceps",
    });
    expect(`${presentation.displayName} ${presentation.secondaryLabel}`)
      .not.toMatch(/upper_body|runtime_curl|null|undefined/);
  });

  it("humanizes movement enums rather than exposing raw underscored values", () => {
    const presentation = createTrainingLoggerExercisePickerPresentation({
      id: "spider_curl",
      name: "Spider Curls",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: "elbow_flexion",
    });

    expect(presentation.secondaryLabel).toBe("Biceps · Elbow flexion");
    expect(presentation.secondaryLabel).not.toContain("elbow_flexion");
  });

  it("uses generic metadata when the canonical display name is missing", () => {
    expect(createTrainingLibraryMetadata({
      displayName: "Exercise",
      missingDisplayName: true,
    })).toEqual({
      title: "Exercise | PhysiqueOS",
      description: "Review exercise training history and performance.",
    });
  });
});
