import { describe, expect, it } from "vitest";
import { parseStrengthTrainingText } from "./trainingSessionEvidence";
import { getCanonicalTrainingExerciseSlug } from "./trainingExerciseIdentity";
import { JUL_14_STRENGTH_NOTE } from "../../fixtures/jul14StrengthEvidenceFixture";

const summary = (set) => ({ loadType: set.load_type, reps: set.reps, weight: set.weight, unit: set.weight_unit });

describe("typed strength Set N prefixes", () => {
  it("preserves the exact Jul 14 four-exercise structure", () => {
    const exercises = parseStrengthTrainingText(JUL_14_STRENGTH_NOTE);
    expect(exercises.map((exercise) => exercise.name)).toEqual([
      "Bulgarian Split Squat (Smith Machine)", "Pendulum Squat Machine", "Leg Extension", "Leg Press (Feet Middle)",
    ]);
    expect(exercises.map((exercise) => getCanonicalTrainingExerciseSlug(exercise.name))).toEqual([
      "bulgarian_split_squat_smith_machine", "pendulum_squat_machine", "leg_extension", "leg_press_feet_middle",
    ]);
    expect(exercises.flatMap((exercise) => exercise.sets)).toHaveLength(13);
    expect(exercises.map((exercise) => exercise.sets.map(summary))).toEqual([
      [
        { loadType: "bodyweight", reps: 10, weight: null, unit: "bodyweight" },
        { loadType: "bodyweight", reps: 10, weight: null, unit: "bodyweight" },
        { loadType: "bodyweight", reps: 10, weight: null, unit: "bodyweight" },
      ],
      Array(3).fill({ loadType: "external_load", reps: 10, weight: 35, unit: "lb" }),
      Array(3).fill({ loadType: "external_load", reps: 30, weight: 25, unit: "lb" }),
      [
        { loadType: "external_load", reps: 13, weight: 135, unit: "lb" },
        { loadType: "external_load", reps: 12, weight: 180, unit: "lb" },
        { loadType: "external_load", reps: 8, weight: 270, unit: "lb" },
        { loadType: "external_load", reps: 6, weight: 270, unit: "lb" },
      ],
    ]);
  });

  it.each([
    ["bodyweight", "Pull-Up\nSet 1: 10 reps · Bodyweight", "bodyweight", null],
    ["external load", "Leg Extension\nSet 1: 30 reps @ 25 lb", "external_load", 25],
    ["parentheses", "Leg Press (Feet Middle)\nSet 1: 13 reps @ 135 lb", "external_load", 135],
    ["end of file", "Pendulum Squat Machine\nSet 1: 10 reps @ 35 lb", "external_load", 35],
  ])("parses Set N: %s", (_label, text, loadType, weight) => {
    const [exercise] = parseStrengthTrainingText(text);
    expect(exercise.sets[0]).toMatchObject({ load_type: loadType, weight });
  });

  it("supports mixed bodyweight and weighted sets without carrying load", () => {
    const [exercise] = parseStrengthTrainingText("Bulgarian Split Squat (Smith Machine)\nSet 1: 10 reps bodyweight\nSet 2: 10 reps @ 20 lb\nSet 3: 8 reps bodyweight");
    expect(exercise.sets.map(summary)).toEqual([
      { loadType: "bodyweight", reps: 10, weight: null, unit: "bodyweight" },
      { loadType: "external_load", reps: 10, weight: 20, unit: "lb" },
      { loadType: "bodyweight", reps: 8, weight: null, unit: "bodyweight" },
    ]);
  });

  it("preserves multiple headings with or without blank lines", () => {
    for (const separator of ["\n\n", "\n"]) {
      const parsed = parseStrengthTrainingText(`Pull-Up\nSet 1: 10 reps bodyweight${separator}Leg Extension\nSet 1: 20 reps @ 30 lb`);
      expect(parsed.map((exercise) => getCanonicalTrainingExerciseSlug(exercise.name))).toEqual(["pull_up", "leg_extension"]);
    }
  });

  it("does not regress shorthand, timed sets, or repeated-name merge semantics", () => {
    expect(parseStrengthTrainingText("Leg Extension\n10r 35p")[0].sets[0]).toMatchObject({ reps: 10, weight: 35 });
    expect(parseStrengthTrainingText("Plank\nSet 1: 1:15 x 1")[0].sets[0]).toMatchObject({ duration_seconds: 75 });
    const repeated = parseStrengthTrainingText("Leg Extension\nSet 1: 10 reps @ 25 lb\nLeg Extension\nSet 2: 12 reps @ 25 lb");
    expect(repeated).toHaveLength(1);
    expect(repeated[0].sets).toHaveLength(2);
  });
});
