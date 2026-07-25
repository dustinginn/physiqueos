import { describe, expect, it } from "vitest";
import {
  formatTrainingLoad,
  formatTrainingSetGlance,
  getTrainingDaySummary,
  normalizeTrainingSetsForPresentation,
} from "./trainingPresentation";

describe("Training presentation formatting", () => {
  it("normalizes every bodyweight semantic shape to BW", () => {
    [
      { weight: 0, weight_unit: "bodyweight" },
      { weight: 0, load_type: "bodyweight", weight_unit: "lb" },
      { weight: 0, measurement_type: "bodyweight_reps", weight_unit: "lb" },
      { weight: 0, set_type: "bodyweight_reps", weight_unit: "lb" },
    ].forEach((set) => expect(formatTrainingLoad(set)).toBe("BW"));
  });

  it("renders bodyweight glances without exercise-name special cases", () => {
    expect(
      formatTrainingSetGlance({
        reps: 15,
        weight: 0,
        load_type: "bodyweight",
        weight_unit: "lb",
      })
    ).toBe("15 x BW");
  });

  it("preserves genuine external loads", () => {
    expect(
      formatTrainingLoad({
        reps: 8,
        weight: 10,
        load_type: "external_load",
        weight_unit: "lb",
      })
    ).toBe("10 lb");
  });

  it("normalizes an all-zero exercise set collection without naming the exercise", () => {
    const [set] = normalizeTrainingSetsForPresentation([
      { reps: 12, weight: 0, weight_unit: "lb" },
    ]);
    expect(formatTrainingSetGlance(set)).toBe("12 x BW");
    expect(
      normalizeTrainingSetsForPresentation([
        { reps: 8, weight: 10, weight_unit: "lb" },
      ])[0]
    ).toEqual({ reps: 8, weight: 10, weight_unit: "lb" });
  });

  it("shares deterministic day classification with safe fallback", () => {
    expect(
      getTrainingDaySummary([
        {
          label: "Strength Training",
          exercises: [{ name: "Bench Press" }, { name: "Incline Bench Press" }],
        },
        { label: "Stair Stepper", exercises: [] },
        { label: "Outdoor Walk", exercises: [] },
      ])
    ).toBe("Chest · Cardio");
    expect(getTrainingDaySummary([{ label: "Unknown", exercises: [] }], "1 session")).toBe(
      "1 session"
    );
  });

  it("returns the complete deduplicated classification list", () => {
    expect(
      getTrainingDaySummary([
        {
          label: "Strength Training",
          exercises: [
            { name: "Hanging Leg Raise" },
            { name: "Lying Leg Curl" },
            { name: "Hip Thrust" },
            { name: "Hanging Leg Raise" },
          ],
        },
        { label: "Stair Stepper" },
      ])
    ).toBe("Core · Hamstrings · Glutes · Cardio");
  });
});
