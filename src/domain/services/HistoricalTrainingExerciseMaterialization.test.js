import { afterEach, describe, expect, it } from "vitest";
import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
  listCanonicalTrainingExerciseIdentities,
  registerRuntimeTrainingExercises,
  resolveTrainingExerciseIdentity,
} from "../models/trainingExerciseIdentity";
import { parseStrengthTrainingText } from "../models/trainingSessionEvidence";
import {
  getCurrentExerciseBenchmark,
  getExercisesForFlatTrainingGroup,
  getTrainingLibraryExercisePresentation,
} from "../../screens/TrainingKnowledgeScreen";
import { searchCanonicalExerciseOptions } from "./CanonicalExerciseLibraryService";
import { getResistanceBreakdown } from "./ProgressReportingService";

const smithMachineHipThrust = {
  id: "smith_machine_hip_thrust",
  name: "Smith Machine Hip Thrusts",
  aliases: [],
  equipment: "Machine",
  body_region: "full_body",
  primary_muscle_groups: ["Glutes"],
  secondary_muscle_groups: [],
  movement_pattern: null,
  source: "evidence_review_user_confirmed",
};

afterEach(() => registerRuntimeTrainingExercises([]));

describe("historical training exercise canonical materialization", () => {
  it("registers the three established historical identities with compatible taxonomy", () => {
    expect(canonical("hip_thrusts")).toMatchObject({
      name: "Hip Thrusts",
      equipment: null,
      body_region: "Lower Body",
      primary_muscle_groups: ["Glutes"],
      secondary_muscle_groups: ["Hamstrings"],
      movement_pattern: "Hip Thrust",
    });
    expect(canonical("barbell_front_raises")).toMatchObject({
      name: "Barbell Front Raises",
      equipment: "barbell",
      body_region: "Shoulders",
      primary_muscle_groups: ["Front Delts"],
      movement_pattern: "Front Raise",
    });
    expect(canonical("chest_press_machine")).toMatchObject({
      name: "Chest Press Machine",
      equipment: "machine",
      body_region: "Chest",
      primary_muscle_groups: ["Chest"],
      secondary_muscle_groups: ["Shoulders", "Triceps"],
      movement_pattern: "Horizontal Press",
    });
  });

  it.each([
    [
      "Hip Thrusts",
      "hip_thrusts",
      `Hip Thrusts
12r 70p
12r 70p
12r 100p`,
      [[12, 70], [12, 70], [12, 100]],
    ],
    [
      "Barbell Front Raises",
      "barbell_front_raises",
      `Barbell Front Raises
10r 80p x4`,
      [[10, 80], [10, 80], [10, 80], [10, 80]],
    ],
    [
      "Chest Press Machine",
      "chest_press_machine",
      `Chest Press Machine
15r 55p
12r 60p
9r 65p`,
      [[15, 55], [12, 60], [9, 65]],
    ],
  ])("resolves and parses historical heading %s without a provisional identity", (
    heading,
    canonicalExerciseId,
    workout,
    expectedSets
  ) => {
    expect(resolveTrainingExerciseIdentity(heading)).toMatchObject({
      canonicalExerciseId,
      resolutionStatus: "resolved_high_confidence",
    });

    const exercises = parseStrengthTrainingText(workout);

    expect(exercises).toHaveLength(1);
    expect(exercises[0]).toMatchObject({
      canonicalExerciseId,
      resolutionStatus: "resolved",
      provisionalExercise: null,
    });
    expect(exercises[0].sets.map((set) => [set.reps, set.weight]))
      .toEqual(expectedSets);
  });

  it("keeps standard and Smith Machine Hip Thrusts distinct and selectable", () => {
    registerRuntimeTrainingExercises([smithMachineHipThrust]);
    const identities = listCanonicalTrainingExerciseIdentities();
    const hipThrusts = identities.filter((exercise) =>
      ["hip_thrusts", "smith_machine_hip_thrust"].includes(exercise.id)
    );

    expect(hipThrusts.map((exercise) => exercise.id)).toEqual([
      "hip_thrusts",
      "smith_machine_hip_thrust",
    ]);
    expect(searchCanonicalExerciseOptions(identities, "Hip").map(({ id }) => id))
      .toEqual(expect.arrayContaining([
        "hip_thrusts",
        "smith_machine_hip_thrust",
      ]));
    expect(resolveTrainingExerciseIdentity("Hip Thrusts").canonicalExerciseId)
      .toBe("hip_thrusts");
    expect(
      resolveTrainingExerciseIdentity("Smith Machine Hip Thrusts")
        .canonicalExerciseId
    ).toBe("smith_machine_hip_thrust");
  });

  it("exposes every materialized identity through the normal selector source", () => {
    const identities = listCanonicalTrainingExerciseIdentities();

    expect(searchCanonicalExerciseOptions(identities, "Barbell Front").map(({ id }) => id))
      .toContain("barbell_front_raises");
    expect(searchCanonicalExerciseOptions(identities, "Chest Press Machine").map(({ id }) => id))
      .toContain("chest_press_machine");
  });

  it("preserves July 7 Hip Thrusts history while resolving its report identity", () => {
    const historicalExercise = {
      id: "hip_thrusts",
      name: "Hip Thrusts",
      equipment: null,
      body_region: "Legs",
      primary_muscle_groups: ["Glutes"],
      secondary_muscle_groups: ["Hamstrings"],
      movement_pattern: "Hip Thrust",
      sets: [
        { set_number: 1, reps: 15, weight: 20, weight_unit: "lb", volume: 300 },
        { set_number: 2, reps: 12, weight: 20, weight_unit: "lb", volume: 240 },
        { set_number: 3, reps: 12, weight: 20, weight_unit: "lb", volume: 240 },
        { set_number: 4, reps: 12, weight: 20, weight_unit: "lb", volume: 240 },
      ],
    };
    const historicalSession = {
      id: "training|2026-07-07|traditional strength training|||3623||284",
      date: "2026-07-07",
      metadata: { activity_type: "Traditional Strength Training" },
      exercises: [historicalExercise],
    };
    const originalSession = structuredClone(historicalSession);
    const resistance = getResistanceBreakdown([historicalSession]);
    const reportedExercise = resistance
      .flatMap((region) => region.movementFamilies)
      .flatMap((family) => family.exercises)
      .find((exercise) => exercise.canonicalExerciseId === "hip_thrusts");
    const report = {
      trainingBreakdowns: { resistance },
      trainingDays: [{ sessions: [historicalSession] }],
    };

    expect(historicalSession).toEqual(originalSession);
    expect(reportedExercise).toMatchObject({
      canonicalExerciseId: "hip_thrusts",
      canonicalIdentityStatus: "canonical",
      id: "hip_thrusts",
      label: "Hip Thrusts",
      sets: ["1 x 15 @ 20 lb", "3 x 12 @ 20 lb"],
    });
    expect(getExercisesForFlatTrainingGroup({ groupSlug: "glutes", report }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          canonicalExerciseId: "hip_thrusts",
          label: "Hip Thrusts",
        }),
      ]));
    expect(getTrainingLibraryExercisePresentation({
      exerciseSlug: "hip_thrusts",
      report,
    })).toMatchObject({
      canonicalExerciseId: "hip_thrusts",
      displayName: "Hip Thrusts",
      historicalOnly: false,
    });
    expect(getCurrentExerciseBenchmark([{
      exercise: historicalExercise,
      session: historicalSession,
    }])).toMatchObject({
      bestSet: "15 x 20 lb",
      lastSession: "Jul 7",
      workingWeight: "20 lb",
    });
  });
});

function canonical(id) {
  return FOUNDER_ALPHA_TRAINING_EXERCISES.find((exercise) => exercise.id === id);
}
