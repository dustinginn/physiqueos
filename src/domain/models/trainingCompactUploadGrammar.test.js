import { describe, expect, it } from "vitest";
import { JUL_25_STRENGTH_NOTE } from "../../fixtures/jul25TrainingEvidenceFixture";
import { resolveTrainingExerciseIdentity } from "./trainingExerciseIdentity";
import { parseStrengthTrainingText } from "./trainingSessionEvidence";

const sets = (text) => parseStrengthTrainingText(text)[0]?.sets ?? [];
const summary = (set) => ({
  reps: set.reps,
  unit: set.weight_unit,
  weight: set.weight,
});

describe("compact Training upload grammar", () => {
  it.each([
    ["reps-first shorthand", "14r 40p"],
    ["load-first shorthand", "40p 14r"],
    ["reps-first long form", "14 reps 40 lb"],
    ["load-first long form", "40 lb 14 reps"],
  ])("normalizes %s", (_label, expression) => {
    expect(summary(sets(`Spider Curls\n${expression}`)[0])).toEqual({
      reps: 14,
      unit: "lb",
      weight: 40,
    });
  });

  it("preserves mixed token order and source set order", () => {
    expect(sets("EZ Bar Curls\n70p 13r\n12r 65p\n60 lb 15 reps").map(summary)).toEqual([
      { reps: 13, unit: "lb", weight: 70 },
      { reps: 12, unit: "lb", weight: 65 },
      { reps: 15, unit: "lb", weight: 60 },
    ]);
  });

  it.each([
    ["standalone sets-of", "4 sets of\n14r 40p"],
    ["inline sets-of", "4 sets of 14r 40p"],
    ["compact x", "4x 14r 40p"],
    ["spaced x", "4 x 14r 40p"],
    ["sets colon", "4 sets: 14r 40p"],
  ])("expands %s into distinct ordered sets", (_label, declaration) => {
    expect(sets(`Spider Curls\n${declaration}`).map(summary)).toEqual(
      Array(4).fill({ reps: 14, unit: "lb", weight: 40 })
    );
  });

  it("does not leak repetition into another set or exercise", () => {
    const parsed = parseStrengthTrainingText(
      "Spider Curls\n4 sets of\n14r 40p\n13r 35p\nEZ Bar Curls\n12r 65p"
    );
    expect(parsed.map((exercise) => exercise.sets.length)).toEqual([5, 1]);
  });

  it.each(["0 sets of\n14r 40p", "-2 sets of\n14r 40p", "2.5 sets of\n14r 40p", "999 sets of\n14r 40p"])(
    "rejects unreasonable or malformed repeat declaration %s",
    (declaration) => {
      expect(sets(`Spider Curls\n${declaration}`)).toHaveLength(0);
    }
  );

  it("resolves only the recognized EZ Bar typo alias", () => {
    expect(resolveTrainingExerciseIdentity("Ez bar carls")).toMatchObject({
      canonicalExerciseId: "ez_bar_curl",
      canonicalExerciseName: "EZ Bar Curls",
      exercise: { primary_muscle_groups: ["Biceps"] },
      resolutionStatus: "resolved_high_confidence",
    });
    expect(resolveTrainingExerciseIdentity("carls")).toMatchObject({
      resolutionStatus: "unrecognized",
    });
  });

  it("recovers duplicate rep markers only from consistent adjacent load context", () => {
    expect(
      sets("Forearm Curls\n30r 80p\n28r 80r\n25r 80p").map(summary)
    ).toEqual([
      { reps: 30, unit: "lb", weight: 80 },
      { reps: 28, unit: "lb", weight: 80 },
      { reps: 25, unit: "lb", weight: 80 },
    ]);
    expect(sets("Forearm Curls\n28r 80r")).toHaveLength(0);
    expect(sets("Forearm Curls\n30r 80p\n28r 80r\n25r 70p").map(summary)).toEqual([
      { reps: 30, unit: "lb", weight: 80 },
      { reps: 25, unit: "lb", weight: 70 },
    ]);
  });

  it("parses the complete Founder Jul 25 workout exactly", () => {
    const parsed = parseStrengthTrainingText(JUL_25_STRENGTH_NOTE);
    expect(parsed.map((exercise) => exercise.name)).toEqual([
      "Spider Curls",
      "EZ Bar Curls",
      "Cable Rope Pushdowns",
      "Straight Bar Cable Pushdowns",
      "Forearm Curls",
    ]);
    expect(parsed.map((exercise) => exercise.sets.length)).toEqual([4, 4, 4, 4, 4]);
    expect(parsed.flatMap((exercise) => exercise.sets)).toHaveLength(20);
    expect(parsed.map((exercise) => exercise.sets.map(summary))).toEqual([
      Array(4).fill({ reps: 14, unit: "lb", weight: 40 }),
      [
        { reps: 13, unit: "lb", weight: 70 },
        { reps: 12, unit: "lb", weight: 70 },
        { reps: 15, unit: "lb", weight: 65 },
        { reps: 15, unit: "lb", weight: 65 },
      ],
      Array(4).fill({ reps: 14, unit: "lb", weight: 110 }),
      Array(4).fill({ reps: 14, unit: "lb", weight: 120 }),
      [
        { reps: 30, unit: "lb", weight: 80 },
        { reps: 28, unit: "lb", weight: 80 },
        { reps: 25, unit: "lb", weight: 80 },
        { reps: 26, unit: "lb", weight: 80 },
      ],
    ]);
  });
});
