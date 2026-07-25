import { describe, expect, it } from "vitest";
import { parseStrengthTrainingText } from "./trainingSessionEvidence";

const JUL_17_STRENGTH_NOTE = `Lying Hamstring Curls
12r 65p
12r 75p
12r 90p
12r 95p

RDLs
12r 90p
12r 140p
12r 180p
11r 230p

Glute Squats
12r 90p
10r 140p
12r 115p
12r 125p

Leg Press, Sumo
12r 180p
10r 225
10r 225
10r 225

Hypertension Machine
10r 50p
12r 50p
12r 50p
10r 50p

Hanging Leg Raise
16r bodyweight
16r bodyweight
16r bodyweight
16r bodyweight`;

describe("Jul 17 strength exercise identities", () => {
  it("preserves identity-bearing variants, order, and every set", () => {
    const exercises = parseStrengthTrainingText(JUL_17_STRENGTH_NOTE);

    expect(exercises.map((exercise) => exercise.name)).toEqual([
      "Lying Leg Curls",
      "Romanian Deadlifts",
      "Glute Squats",
      "Leg Press (Sumo Stance)",
      "Hyperextension Machine",
      "Hanging Leg Raises",
    ]);
    expect(exercises.map((exercise) => exercise.sets.map((set) => ({
      reps: set.reps,
      weight: set.weight,
      weight_unit: set.weight_unit,
    })))).toEqual([
      [
        { reps: 12, weight: 65, weight_unit: "lb" },
        { reps: 12, weight: 75, weight_unit: "lb" },
        { reps: 12, weight: 90, weight_unit: "lb" },
        { reps: 12, weight: 95, weight_unit: "lb" },
      ],
      [
        { reps: 12, weight: 90, weight_unit: "lb" },
        { reps: 12, weight: 140, weight_unit: "lb" },
        { reps: 12, weight: 180, weight_unit: "lb" },
        { reps: 11, weight: 230, weight_unit: "lb" },
      ],
      [
        { reps: 12, weight: 90, weight_unit: "lb" },
        { reps: 10, weight: 140, weight_unit: "lb" },
        { reps: 12, weight: 115, weight_unit: "lb" },
        { reps: 12, weight: 125, weight_unit: "lb" },
      ],
      [
        { reps: 12, weight: 180, weight_unit: "lb" },
        { reps: 10, weight: 225, weight_unit: "lb" },
        { reps: 10, weight: 225, weight_unit: "lb" },
        { reps: 10, weight: 225, weight_unit: "lb" },
      ],
      [
        { reps: 10, weight: 50, weight_unit: "lb" },
        { reps: 12, weight: 50, weight_unit: "lb" },
        { reps: 12, weight: 50, weight_unit: "lb" },
        { reps: 10, weight: 50, weight_unit: "lb" },
      ],
      Array(4).fill({ reps: 16, weight: null, weight_unit: "bodyweight" }),
    ]);
  });
});
