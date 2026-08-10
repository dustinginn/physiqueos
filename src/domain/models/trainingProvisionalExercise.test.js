import { afterEach, describe, expect, it } from "vitest";
import {
  createTrainingSessionEvidenceFromText,
  getContextualStrengthSetParseDiagnostics,
} from "./trainingSessionEvidence";
import { mergeTypedEvidenceIntoTrainingObjects } from "../interpreters/ScreenshotInterpreterService";
import { registerRuntimeTrainingExercises } from "./trainingExerciseIdentity";

afterEach(() => registerRuntimeTrainingExercises([]));

const incident = `Spider curls
4 sets of
12r 45p

Bicep Curl Machine
18r 75p
18r 75p
18r 75p
18r 75p

Cable rope pushdowns
14r 110p x4

Straight bar cable pushdowns
14r 120p x4`;

describe("provisional typed training exercises", () => {
  it("preserves all 21 explicit sets in the exact lower-body incident", () => {
    const exercises = parse(`Seated hip adductions
15r 80p
15r 90p
15r 100p
15r 100p

Sumo squat machine
12r 135p
180p 12r
225p 10r
225p 15r

Smith machine hip thrusts
15r 90p
12r 140p
15r 160p
12r 160p
12r 90p

Leg press high and narrow feet
180p 15r
225p 12r
270p 10r
270 10r

Lying leg curls
4 sets of
12r 75p`);
    expect(exercises.map((exercise) => [exercise.name, exercise.sets.length]))
      .toEqual([
        ["Seated Hip Adductions", 4],
        ["Sumo Squat Machine", 4],
        ["Smith Machine Hip Thrusts", 5],
        ["Leg Press High And Narrow Feet", 4],
        ["Lying Leg Curls", 4],
      ]);
    expect(exercises.reduce((total, exercise) => total + exercise.sets.length, 0))
      .toBe(21);
    expect(exercises[3].sets[3]).toMatchObject({
      reps: 10,
      weight: 270,
      weight_unit: "lb",
      unit_inference: {
        code: "contextual_pound_unit",
        source_line: 24,
      },
    });
    expect(exercises.filter((exercise) => exercise.provisionalExercise))
      .toHaveLength(3);
    expect(exercises[0].canonicalExerciseId).toBe("seated_hip_adductions");
    expect(exercises[4].canonicalExerciseId).toBe("lying_leg_curl");
  });

  it.each([
    ["Sumo Squat Machine", "sumo_squat_machine"],
    ["Leg Press High And Narrow Feet", "leg_press_high_narrow"],
  ])("retains the true canonical ID when %s exists app-wide", (name, id) => {
    registerRuntimeTrainingExercises([{
      id,
      name,
      aliases: [],
      equipment: "machine",
      body_region: "Lower Body",
      primary_muscle_groups: ["Glutes"],
      secondary_muscle_groups: [],
      movement_pattern: "Squat / Press",
    }]);
    const [exercise] = parse(`${name}\n10r 100p`);
    expect(exercise).toMatchObject({
      canonicalExerciseId: id,
      provisionalExercise: null,
    });
  });

  it.each([
    "Bicep curl machine",
    "Bicep curls machine",
    "Machine bicep curl",
    "Machine bicep curls",
  ])("preserves the registered Bicep Curl Machine identity for %s", (heading) => {
    registerBicepCurlMachine();
    const [exercise] = parse(`${heading}\n15r 105p`);
    expect(exercise).toMatchObject({
      id: expect.stringMatching(/^exercise_occurrence_[a-f0-9]+$/),
      name: "Bicep Curl Machine",
      canonicalExerciseId: "bicep_curl_machine",
      resolutionStatus: "resolved",
      provisionalExercise: null,
      sets: [expect.objectContaining({ reps: 15, weight: 105 })],
    });
  });

  it("does not promote ordinary curl headings to the machine identity", () => {
    registerBicepCurlMachine();
    expect(parse("Bicep curl\n15r 35p")[0]).toMatchObject({
      name: "Bicep Curl",
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
    });
    expect(parse("curl\n15r 35p")[0]).toMatchObject({
      name: "curl",
      canonicalExerciseId: null,
    });
  });

  it("preserves every identity and set in the current four-exercise workout", () => {
    registerBicepCurlMachine();
    const exercises = parse(`Spider Curls (Static Hold)
35p 13r
35p 10r
35p 10r
35p 10r

Bicep curl machine
15r 105p
14r 105p
12r 105p
14r 105p

Cable rope pushdowns
15r 110p
15r 110p
14r 110p
15r 110p

Skull crushers
17r 60p
13r 60p
13r 60p
14r 60p`);

    expect(exercises.map((exercise) => ({
      name: exercise.name,
      canonicalExerciseId: exercise.canonicalExerciseId,
      variant: exercise.executionVariant?.key ?? null,
      sets: exercise.sets.map((set) => [set.reps, set.weight]),
    }))).toEqual([
      { name: "Spider Curls", canonicalExerciseId: "spider_curl", variant: "static_hold", sets: [[13, 35], [10, 35], [10, 35], [10, 35]] },
      { name: "Bicep Curl Machine", canonicalExerciseId: "bicep_curl_machine", variant: null, sets: [[15, 105], [14, 105], [12, 105], [14, 105]] },
      { name: "Cable Rope Pushdowns", canonicalExerciseId: "cable_pushdown", variant: null, sets: [[15, 110], [15, 110], [14, 110], [15, 110]] },
      { name: "Skull Crushers", canonicalExerciseId: "skull_crushers", variant: null, sets: [[17, 60], [13, 60], [13, 60], [14, 60]] },
    ]);
  });

  it("preserves the exact incident as four independent blocks", () => {
    const exercises = parse(incident);
    expect(exercises.map((item) => item.name)).toEqual([
      "Spider Curls",
      "Bicep Curl Machine",
      "Cable Rope Pushdowns",
      "Straight Bar Cable Pushdowns",
    ]);
    expect(exercises.map((item) => item.sets.map((set) => [set.reps, set.weight]))).toEqual([
      Array(4).fill([12, 45]),
      Array(4).fill([18, 75]),
      Array(4).fill([14, 110]),
      Array(4).fill([14, 120]),
    ]);
    expect(exercises[1]).toMatchObject({
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
      provisionalExercise: {
        rawSubmittedName: "Bicep Curl Machine",
        normalizedDisplayName: "Bicep Curl Machine",
        resolutionStatus: "unresolved",
        suggestedPrimaryMuscleGroup: "Biceps",
        suggestedPrimaryMuscleGroupId: "biceps",
        suggestedPrimaryMuscleGroupConfidence: "high",
        suggestedMovementPattern: "Elbow Flexion",
        suggestedEquipment: "Machine",
        suggestedLaterality: "Bilateral",
      },
    });
  });

  it("suggests canonical Glutes for Smith Machine Hip Thrusts without resolving it", () => {
    const [exercise] = parse("Smith Machine Hip Thrusts\n10r 100p");
    expect(exercise).toMatchObject({
      canonicalExerciseId: null,
      provisionalExercise: {
        suggestedPrimaryMuscleGroup: "Glutes",
        suggestedPrimaryMuscleGroupId: "glutes",
        suggestedPrimaryMuscleGroupConfidence: "high",
        resolutionStatus: "unresolved",
      },
    });
  });

  it("does not preselect a low-confidence muscle group", () => {
    const [exercise] = parse("Unknown Rotation Machine\n10r 100p");
    expect(exercise.provisionalExercise).toMatchObject({
      suggestedPrimaryMuscleGroup: null,
      suggestedPrimaryMuscleGroupId: null,
      suggestedPrimaryMuscleGroupConfidence: "low",
    });
  });

  it.each([
    ["first", `Mystery Press\n10r 20p\nSpider curls\n12r 45p`],
    ["middle", `Spider curls\n12r 45p\nMystery Press\n10r 20p\nCable rope pushdowns\n14r 110p`],
    ["last", `Spider curls\n12r 45p\nMystery Press\n10r 20p`],
  ])("keeps an unknown exercise %s", (_position, text) => {
    const exercises = parse(text);
    expect(exercises.find((item) => item.name === "Mystery Press"))
      .toMatchObject({ resolutionStatus: "unresolved_provisional" });
  });

  it("creates separate stable IDs for multiple unknowns", () => {
    const text = `Mystery Press\n10r 20p\nNovel Curl\n8r 15p`;
    const first = parse(text);
    const second = parse(text);
    expect(first).toHaveLength(2);
    expect(new Set(first.map((item) => item.provisionalExercise.provisionalExerciseId)).size).toBe(2);
    expect(first.map((item) => item.provisionalExercise.provisionalExerciseId))
      .toEqual(second.map((item) => item.provisionalExercise.provisionalExerciseId));
  });

  it("expands a suffix repeat under a provisional heading", () => {
    const [exercise] = parse(`Bicep Curl Machine\n18r 75p x4`);
    expect(exercise.sets).toHaveLength(4);
    expect(exercise.sets.every((set) => set.reps === 18 && set.weight === 75)).toBe(true);
  });

  it("does not promote notes or malformed text into exercises", () => {
    const exercises = parse(`Spider curls\n12r 45p\nNotes\nFelt strong today\nWarmup\nnot a set`);
    expect(exercises).toHaveLength(1);
    expect(exercises[0].name).toBe("Spider Curls");
  });

  it("reports a missing unit without pound context instead of fabricating a set", () => {
    const result = getContextualStrengthSetParseDiagnostics(
      "Leg press\n270 10r"
    );
    expect(result.exercises).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "ambiguous_or_incomplete_strength_set",
        disposition: "incomplete_set",
      }),
    ]);
  });

  it.each([
    ["single number", "270"],
    ["two unlabeled numbers", "270 10"],
    ["multiple numeric roles", "10r 270 30"],
    ["duration suffix", "270s 10r"],
    ["distance suffix", "270m 10r"],
    ["bodyweight", "bodyweight 10r"],
    ["rep only", "10r only"],
  ])("does not infer pounds for %s", (_label, line) => {
    const result = getContextualStrengthSetParseDiagnostics(
      `Leg press\n270p 10r\n\nPlank\n${line}`
    );
    expect(result.exercises.flatMap((exercise) => exercise.sets))
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ unit_inference: expect.anything() }),
      ]));
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ambiguous_or_incomplete_strength_set",
        }),
      ])
    );
  });

  it("survives screenshot-plus-typed reconciliation without duplicating matching sets", () => {
    const typedExercises = parse(incident);
    const screenshotObject = {
      id: "training_screenshot",
      evidence_type: "training",
      observed_at: "2026-07-29",
      metadata: { activity_type: "Traditional Strength Training" },
      source: { modality: "screenshot", source_artifact_refs: ["workout.png"] },
      provenance: { source_artifact_refs: ["workout.png"] },
      exercises: typedExercises.filter((exercise) => exercise.name !== "Bicep Curl Machine"),
    };
    const [merged] = mergeTypedEvidenceIntoTrainingObjects({
      evidenceObjects: [screenshotObject],
      typedEvidence: incident,
    });
    expect(merged.exercises).toHaveLength(4);
    expect(merged.exercises.find((exercise) => exercise.name === "Bicep Curl Machine"))
      .toMatchObject({
        resolutionStatus: "unresolved_provisional",
        sets: expect.arrayContaining([
          expect.objectContaining({ reps: 18, weight: 75 }),
        ]),
      });
    expect(merged.exercises.find((exercise) => exercise.name === "Spider Curls")?.sets)
      .toHaveLength(4);
  });

  it("rejects an unvalidated screenshot canonical ID in favor of typed provisional identity", () => {
    const typedEvidence = "Smith Machine Hip Thrusts\n10r 100p";
    const screenshotObject = {
      id: "training_screenshot",
      evidence_type: "training",
      metadata: { activity_type: "Traditional Strength Training" },
      source: { modality: "screenshot", source_artifact_refs: ["workout.png"] },
      provenance: { source_artifact_refs: ["workout.png"] },
      exercises: [{
        id: "stale_hip_thrust",
        name: "Smith Machine Hip Thrusts",
        canonicalExerciseId: "stale_hip_thrust",
        resolutionStatus: "resolved",
        sets: [{ reps: 10, weight: 100, weight_unit: "lb", provenance_ref: "workout.png" }],
      }],
    };
    const [merged] = mergeTypedEvidenceIntoTrainingObjects({
      evidenceObjects: [screenshotObject],
      typedEvidence,
    });
    expect(merged.exercises).toHaveLength(1);
    expect(merged.exercises[0]).toMatchObject({
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
      provisionalExercise: {
        resolutionStatus: "unresolved",
      },
    });
    expect(merged.exercises[0].sets).toHaveLength(1);
  });
});

function parse(text) {
  return createTrainingSessionEvidenceFromText({
    id: "training_fixture",
    observedAt: "2026-07-29T12:00:00.000Z",
    provenanceRef: "typed_fixture",
    text,
  }).exercises;
}

function registerBicepCurlMachine() {
  registerRuntimeTrainingExercises([
    {
      id: "bicep_curl_machine",
      name: "Bicep Curl Machine",
      aliases: ["Machine Bicep Curl", "Biceps Curl Machine"],
      equipment: "Machine",
      body_region: "upper_body",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: "Elbow Flexion",
    },
    {
      id: "skull_crushers",
      name: "Skull Crushers",
      aliases: [],
      equipment: null,
      body_region: "upper_body",
      primary_muscle_groups: ["Triceps"],
      movement_pattern: null,
    },
  ]);
}
