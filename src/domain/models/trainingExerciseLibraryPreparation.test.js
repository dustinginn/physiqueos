import { describe, expect, it } from "vitest";
import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
  getCanonicalTrainingExerciseLabel,
  resolveTrainingExerciseIdentity,
} from "./trainingExerciseIdentity";
import { parseStrengthTrainingText } from "./trainingSessionEvidence";

const workout = `Hack Squats
12r 45p
12r 90p
10r 135p
5r 180p
Leg Extensions
12r 50p
15r 60p
15r 70p
12r 80p
Sissy Squats
15r bw
15r 22.5p
15r 30p
15r 45p
15r bw
Single-Leg Leg Press
10r 90p
8r 135p
10r 135p
10r 135p
Seated Hip Abductions
15r 120p
15r 130p
15r 150p`;

describe("canonical exercise-library preparation", () => {
  const expected = [
    ["hack_squat", "Hack Squats", "Quads"],
    ["leg_extension", "Leg Extensions", "Quads"],
    ["sissy_squat", "Sissy Squats", "Quads"],
    ["single_leg_leg_press", "Single-Leg Leg Press", "Quads"],
    ["seated_hip_abductions", "Seated Hip Abductions", "Quads"],
  ];
  it.each(expected)("%s exists once as %s under %s", (id, name, category) => {
    expect(FOUNDER_ALPHA_TRAINING_EXERCISES.filter((item) => item.id === id))
      .toEqual([expect.objectContaining({ id, name, body_region: category })]);
  });
  it("retains the corrected adduction stable ID and separates aliases", () => {
    expect(getCanonicalTrainingExerciseLabel("seated_abductions")).toBe("Seated Hip Adductions");
    expect(resolveTrainingExerciseIdentity("seated abductions")).toMatchObject({
      canonicalExerciseId: "seated_hip_abductions",
      canonicalExerciseName: "Seated Hip Abductions",
    });
    expect(resolveTrainingExerciseIdentity("seated adductions")).toMatchObject({
      canonicalExerciseId: "seated_hip_adductions",
      canonicalExerciseName: "Seated Hip Adductions",
    });
    expect(resolveTrainingExerciseIdentity("seated_abductions")).toMatchObject({
      canonicalExerciseId: "seated_hip_adductions",
      matchSignals: ["explicit_legacy_stored_id_remap"],
    });
    expect(FOUNDER_ALPHA_TRAINING_EXERCISES.filter(
      (exercise) => exercise.id === "seated_hip_abductions"
    )).toHaveLength(1);
  });
  it.each([
    ["Hack Squat", "hack_squat", "Hack Squats"],
    ["Leg Extension", "leg_extension", "Leg Extensions"],
    ["Sissy Squat", "sissy_squat", "Sissy Squats"],
    ["Single Leg Press", "single_leg_leg_press", "Single-Leg Leg Press"],
    ["Seated Hip Abduction", "seated_hip_abductions", "Seated Hip Abductions"],
  ])("resolves singular %s to its plural canonical record", (input, id, name) => {
    expect(resolveTrainingExerciseIdentity(input)).toMatchObject({
      canonicalExerciseId: id,
      canonicalExerciseName: name,
    });
  });
  it("parses the supplied isolated workout into five exercises and twenty ordered sets", () => {
    const parsed = parseStrengthTrainingText(workout);
    expect(parsed.map((item) => item.name)).toEqual(expected.map(([, name]) => name));
    expect(parsed.map((item) => item.sets.length)).toEqual([4, 4, 5, 4, 3]);
    expect(parsed.flatMap((item) => item.sets)).toHaveLength(20);
    expect(parsed[2].sets.map((set) => [set.reps, set.weight, set.load_type]))
      .toEqual([
        [15, null, "bodyweight"],
        [15, 22.5, "external_load"],
        [15, 30, "external_load"],
        [15, 45, "external_load"],
        [15, null, "bodyweight"],
      ]);
  });
  it("keeps precise aliases distinct from generic movements", () => {
    expect(resolveTrainingExerciseIdentity("Single-Leg Leg Press").canonicalExerciseId)
      .not.toBe("leg_press");
    expect(resolveTrainingExerciseIdentity("Hack Squats").canonicalExerciseId).not.toBe("squat");
    expect(resolveTrainingExerciseIdentity("Sissy Squats").canonicalExerciseId).not.toBe("squat");
  });
  it.each([
    ["Iso-Lateral High Row", "iso_lateral_high_row", "Iso-Lateral High Rows"],
    ["Pull-Up", "pull_up", "Pull-Ups"],
    ["Seated Cable Row", "seated_cable_row", "Seated Cable Rows"],
    ["Cable Machine Front Raise", "cable_machine_front_raise", "Cable Machine Front Raises"],
    ["EZ Bar Curl", "ez_bar_curl", "EZ Bar Curls"],
    ["Spider Curl", "spider_curl", "Spider Curls"],
    ["Straight Bar Cable Pushdown", "straight_bar_cable_pushdown", "Straight Bar Cable Pushdowns"],
    ["Cable Crunch", "cable_crunch", "Cable Crunches"],
    ["Hanging Leg Raise", "hanging_leg_raise", "Hanging Leg Raises"],
    ["Plank", "plank", "Planks"],
    ["Lying Leg Curl", "lying_leg_curl", "Lying Leg Curls"],
  ])("resolves %s to the explicit plural identity", (input, id, name) => {
    expect(resolveTrainingExerciseIdentity(input)).toMatchObject({
      canonicalExerciseId: id,
      canonicalExerciseName: name,
    });
    expect(FOUNDER_ALPHA_TRAINING_EXERCISES.filter((item) => item.id === id))
      .toEqual([expect.objectContaining({ id, name })]);
  });
});
