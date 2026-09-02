import { describe, expect, it } from "vitest";
import { FOUNDER_ALPHA_TRAINING_EXERCISES } from "../domain/models/trainingExerciseIdentity";
import {
  resolvePrimaryTrainingNavigationCategory,
  validateTrainingNavigationTaxonomy,
} from "./trainingNavigationMapping";

function browseExercise(exercise) {
  return {
    canonicalExerciseId: exercise.id,
    familyLabel: exercise.movement_pattern,
    id: exercise.id,
    label: exercise.name,
    primaryMuscleGroups: exercise.primary_muscle_groups,
    regionLabel: exercise.primary_muscle_groups[0],
  };
}

describe("Training Library primary browse taxonomy", () => {
  it.each([
    ["Glute Squats", "glutes"],
    ["Lying Leg Curls", "hamstrings"],
    ["Seated Leg Curl", "hamstrings"],
    ["Romanian Deadlifts", "glutes"],
    ["Bulgarian Split Squat (Smith Machine)", "quads"],
    ["Leg Extensions", "quads"],
    ["Leg Press (Feet Middle)", "quads"],
    ["Leg Press (Sumo Stance)", "quads"],
    ["Pendulum Squat Machine", "quads"],
  ])("maps %s to exactly one stable primary category", (name, expectedCategory) => {
    const exercise = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
      (candidate) => candidate.name === name
    );
    expect(exercise).toBeDefined();
    expect(
      resolvePrimaryTrainingNavigationCategory(browseExercise(exercise))
    ).toMatchObject({
      primaryNavigationCategory: expectedCategory,
    });
  });

  it.each([
    ["Glute Squats", "glutes", "explicit_canonical_exercise_mapping"],
    ["Lying Leg Curls", "hamstrings", "explicit_canonical_exercise_mapping"],
    ["Seated Leg Curl", "hamstrings", "explicit_canonical_exercise_mapping"],
    ["Romanian Deadlifts", "glutes", "explicit_canonical_exercise_mapping"],
  ])("uses an explicit high-confidence correction for %s", (name, category, source) => {
    const exercise = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
      (candidate) => candidate.name === name
    );
    expect(
      resolvePrimaryTrainingNavigationCategory(browseExercise(exercise))
    ).toMatchObject({
      confidence: "high",
      primaryNavigationCategory: category,
      source,
    });
  });

  it("maps a sparse live Hyperextension Machine projection by canonical ID", () => {
    const sparseProjection = {
      canonicalExerciseId: "hyperextension_machine",
      id: "exercise_hypertension_machine_20260717",
      label: "Hyperextension Machine",
      primaryMuscleGroups: [],
      regionLabel: "Lower Body",
    };
    const resolution =
      resolvePrimaryTrainingNavigationCategory(sparseProjection);

    expect(resolution).toEqual({
      confidence: "high",
      primaryNavigationCategory: "glutes",
      source: "explicit_canonical_exercise_mapping",
    });
    expect(
      validateTrainingNavigationTaxonomy([sparseProjection], {
        browsableCanonicalIds: ["hyperextension_machine"],
      })
    ).toMatchObject({
      valid: true,
      missingCanonicalIds: [],
      multiplePrimaryCategories: [],
      unknownCategories: [],
      unmappedCanonicalIds: [],
      registrations: { hyperextension_machine: "glutes" },
    });
  });

  it.each([
    ["sumo_squat_machine", "Sumo Squat Machine", "glutes"],
    [
      "leg_press_high_narrow",
      "Leg Press High And Narrow Feet",
      "hamstrings",
    ],
  ])("maps precise runtime identity %s without using a generic movement", (id, label, category) => {
    expect(
      resolvePrimaryTrainingNavigationCategory({
        canonicalExerciseId: id,
        label,
        primaryMuscleGroups: [],
        regionLabel: "Lower Body",
      })
    ).toEqual({
      confidence: "high",
      primaryNavigationCategory: category,
      source: "explicit_canonical_exercise_mapping",
    });
  });

  it("keeps the exact preferred-label fallback when the UI projection drops canonical ID", () => {
    expect(
      resolvePrimaryTrainingNavigationCategory({
        label: "Hyperextension Machine",
        primaryMuscleGroups: [],
        regionLabel: "Lower Body",
      })
    ).toEqual({
      confidence: "high",
      primaryNavigationCategory: "glutes",
      source: "explicit_exercise_mapping",
    });
    expect(
      resolvePrimaryTrainingNavigationCategory({
        label: "Reverse Hyperextension",
        primaryMuscleGroups: [],
        regionLabel: "Lower Body",
      }).primaryNavigationCategory
    ).toBeNull();
  });

  it("keeps the corrected exercises out of their prior categories", () => {
    const categories = Object.fromEntries(
      ["Glute Squats", "Lying Leg Curls", "Seated Leg Curl", "Romanian Deadlifts"].map((name) => {
        const exercise = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
          (candidate) => candidate.name === name
        );
        return [
          exercise.id,
          resolvePrimaryTrainingNavigationCategory(
            browseExercise(exercise)
          ).primaryNavigationCategory,
        ];
      })
    );

    expect(categories).toEqual({
      glute_squat: "glutes",
      lying_leg_curl: "hamstrings",
      seated_leg_curl: "hamstrings",
      romanian_deadlift: "glutes",
    });
    expect(categories.glute_squat).not.toBe("quads");
    expect(categories.lying_leg_curl).not.toBe("biceps");
    expect(categories.seated_leg_curl).not.toBe("biceps");
  });

  it("does not let the generic 'curl' movement family capture leg-curl variants, while real biceps curls stay biceps", () => {
    // ProgressReportingService's inferMovementFamily buckets ANY exercise whose name
    // contains "curl" into one "Curl" movement family, and FAMILY_NAVIGATION_CATEGORIES
    // maps that whole family to biceps at a higher priority than primary-muscle-group
    // resolution. Leg-curl variants must be pulled out via the explicit canonical-ID
    // override (checked before the family fallback) rather than relying on muscle-group
    // data the family match would otherwise shadow.
    const legCurlVariants = ["Lying Leg Curls", "Seated Leg Curl"];
    const realBicepsCurls = ["Spider Curls", "EZ Bar Curls"];

    for (const name of legCurlVariants) {
      const exercise = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (candidate) => candidate.name === name
      );
      expect(exercise).toBeDefined();
      // Simulate the live browse projection: a generic "Curl" family label (as
      // inferMovementFamily would assign) alongside the exercise's real canonical ID
      // and muscle groups.
      const resolution = resolvePrimaryTrainingNavigationCategory({
        ...browseExercise(exercise),
        familyLabel: "Curl",
      });
      expect(resolution.primaryNavigationCategory).toBe("hamstrings");
      expect(resolution.primaryNavigationCategory).not.toBe("biceps");
    }

    for (const name of realBicepsCurls) {
      const exercise = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (candidate) => candidate.name === name
      );
      expect(exercise).toBeDefined();
      const resolution = resolvePrimaryTrainingNavigationCategory({
        ...browseExercise(exercise),
        familyLabel: "Curl",
      });
      expect(resolution.primaryNavigationCategory).toBe("biceps");
    }
  });

  it("leaves unrelated Quads/Glutes/Calves categories unaffected by the Seated Leg Curl correction", () => {
    const unaffected = [
      ["Glute Squats", "glutes"],
      ["Hack Squats", "quads"],
      ["Leg Extensions", "quads"],
      ["Hip Thrusts", "glutes"],
    ];
    for (const [name, expectedCategory] of unaffected) {
      const exercise = FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (candidate) => candidate.name === name
      );
      expect(exercise).toBeDefined();
      expect(
        resolvePrimaryTrainingNavigationCategory(browseExercise(exercise))
      ).toMatchObject({ primaryNavigationCategory: expectedCategory });
    }
  });

  it("registers every browsable canonical exercise exactly once with no duplicates", () => {
    const exercises = FOUNDER_ALPHA_TRAINING_EXERCISES.map(browseExercise);
    const canonicalIds = FOUNDER_ALPHA_TRAINING_EXERCISES.map(
      (exercise) => exercise.id
    );
    const result = validateTrainingNavigationTaxonomy(exercises, {
      browsableCanonicalIds: canonicalIds,
    });

    expect(result).toMatchObject({
      valid: true,
      missingCanonicalIds: [],
      multiplePrimaryCategories: [],
      unknownCategories: [],
      unmappedCanonicalIds: [],
    });
    expect(Object.keys(result.registrations)).toHaveLength(canonicalIds.length);
    expect(new Set(Object.keys(result.registrations)).size).toBe(
      canonicalIds.length
    );
  });

  it("detects missing, duplicate, unknown, and unmapped registrations", () => {
    const result = validateTrainingNavigationTaxonomy(
      [
        {
          canonicalExerciseId: "duplicate",
          label: "Bench Press",
        },
        {
          canonicalExerciseId: "duplicate",
          label: "Bench Press",
        },
        {
          canonicalExerciseId: "unknown",
          label: "Bench Press",
          primaryNavigationCategory: "not-a-category",
        },
        {
          canonicalExerciseId: "unmapped",
          label: "Unregistered Movement",
        },
      ],
      { browsableCanonicalIds: ["duplicate", "missing"] }
    );

    expect(result.valid).toBe(false);
    expect(result.missingCanonicalIds).toEqual(["missing"]);
    expect(result.multiplePrimaryCategories).toEqual([
      { canonicalExerciseId: "duplicate", categories: ["chest", "chest"] },
    ]);
    expect(result.unknownCategories).toEqual([
      { canonicalExerciseId: "unknown", category: "not-a-category" },
    ]);
    expect(result.unmappedCanonicalIds).toEqual(["unmapped"]);
  });

  it("preserves canonical IDs and alphabetical browse ordering", () => {
    const names = [
      "Romanian Deadlifts",
      "Hyperextension Machine",
      "Glute Squats",
      "Hip Thrust",
    ].filter((name) =>
      FOUNDER_ALPHA_TRAINING_EXERCISES.some(
        (exercise) => exercise.name === name
      )
    );
    const sorted = [...names].sort((left, right) => left.localeCompare(right));

    expect(sorted).toEqual([
      "Glute Squats",
      "Hyperextension Machine",
      "Romanian Deadlifts",
    ]);
    expect(
      FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (exercise) => exercise.name === "Glute Squats"
      ).id
    ).toBe("glute_squat");
    expect(
      FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (exercise) => exercise.name === "Lying Leg Curls"
      ).id
    ).toBe("lying_leg_curl");
    expect(
      FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (exercise) => exercise.name === "Romanian Deadlifts"
      ).id
    ).toBe("romanian_deadlift");
    expect(
      FOUNDER_ALPHA_TRAINING_EXERCISES.find(
        (exercise) => exercise.name === "Hyperextension Machine"
      )
    ).toMatchObject({
      id: "hyperextension_machine",
      name: "Hyperextension Machine",
    });
  });
});
