import { describe, expect, it } from "vitest";
import {
  normalizeTrainingExecutionVariant,
} from "./trainingExecutionVariant";
import { parseStrengthTrainingText } from "./trainingSessionEvidence";

describe("Training execution variants", () => {
  it("parses Spider Curls Static Hold without changing canonical identity or sets", () => {
    const [exercise] = parseStrengthTrainingText([
      "Spider Curls (Static Hold)",
      "35p 13r",
      "35p 10r",
      "35p 10r",
      "35p 10r",
    ].join("\n"));

    expect(exercise).toMatchObject({
      name: "Spider Curls",
      canonicalExerciseId: "spider_curl",
      executionVariant: {
        key: "static_hold",
        label: "Static Hold",
        rawLabel: "Static Hold",
      },
    });
    expect(exercise.sets.map(({ reps, weight }) => [reps, weight])).toEqual([
      [13, 35], [10, 35], [10, 35], [10, 35],
    ]);
  });

  it.each([
    ["Leg Press (Feet Middle)", "leg_press_feet_middle"],
    ["Leg Press (Feet High)", "leg_press_feet_high"],
    ["Leg Press (Feet Low)", "leg_press_feet_low"],
    ["Leg Press (Sumo Stance)", "leg_press_sumo_stance"],
    ["Bulgarian Split Squat (Smith Machine)", "bulgarian_split_squat_smith_machine"],
  ])("keeps exact parenthetical canonical identity %s", (heading, canonicalExerciseId) => {
    const [exercise] = parseStrengthTrainingText(`${heading}\n35p 10r`);
    expect(exercise).toMatchObject({ canonicalExerciseId, name: heading });
    expect(exercise.executionVariant).toBeUndefined();
  });

  it("keeps an unknown parenthetical reviewable on a known base", () => {
    const [exercise] = parseStrengthTrainingText("Spider Curls (Something New)\n35p 10r");
    expect(exercise).toMatchObject({
      canonicalExerciseId: "spider_curl",
      resolutionStatus: "resolved",
      executionVariant: { key: "something_new", label: "Something New" },
    });
    expect(exercise.provisionalExercise).toBeNull();
  });

  it("keeps an unknown base provisional while preserving its parenthetical", () => {
    const [exercise] = parseStrengthTrainingText("Unknown Curl (Static Hold)\n35p 10r");
    expect(exercise).toMatchObject({
      name: "Unknown Curl",
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
      executionVariant: { key: "static_hold", label: "Static Hold" },
      provisionalExercise: { rawSubmittedName: "Unknown Curl" },
    });
  });

  it("keeps ordinary and variant occurrences separate and normalizes aliases", () => {
    const exercises = parseStrengthTrainingText([
      "Spider Curls", "35p 10r", "", "Spider Curls (Static Holds)", "35p 13r",
    ].join("\n"));
    expect(exercises).toHaveLength(2);
    expect(exercises.map((exercise) => exercise.sets[0].reps)).toEqual([10, 13]);
    expect(exercises[1].executionVariant).toEqual({
      key: "static_hold",
      label: "Static Hold",
      rawLabel: "Static Holds",
    });
    expect(normalizeTrainingExecutionVariant("  STATIC-hold  ").key).toBe("static_hold");
  });
});
