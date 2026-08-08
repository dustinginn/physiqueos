import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { mergeTypedEvidenceIntoTrainingObjects } from "../interpreters/ScreenshotInterpreterService";
import {
  createCanonicalExerciseDefinition,
  resolveProvisionalExerciseInPackage,
} from "../services/CanonicalExerciseLibraryService";
import { createCanonicalExerciseWorkoutCommitService } from "../services/CanonicalExerciseWorkoutCommitService";
import { createEvidenceReviewPresentation } from "../services/EvidenceReviewPresentationService";
import { produceTrainingPerformanceEvents } from "../services/TrainingPerformanceEventProducer";
import { registerRuntimeTrainingExercises } from "./trainingExerciseIdentity";
import {
  createTrainingSessionEvidenceFromText,
  getContextualStrengthSetParseDiagnostics,
} from "./trainingSessionEvidence";

const directories = [];

afterEach(() => {
  registerRuntimeTrainingExercises([]);
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

const exactWorkout = `Pull ups
13r bw x4

Hanging leg raises
17r bw x4

ISO-lateral high rows
140p 18r
140p 18r
140p 18r
140p 18r

Reverse Fly Machine
17r 50p
17r 70p
90p 10r
80p 11r

Cable crunches
120p 25r x4`;

describe("mixed workout syntax intake stabilization", () => {
  it("parses the exact upload as five ordered exercises and twenty sets", () => {
    const exercises = parse(exactWorkout);

    expect(exercises.map((exercise) => [
      exercise.name,
      exercise.canonicalExerciseId,
      exercise.sets.length,
    ])).toEqual([
      ["Pull-Ups", "pull_up", 4],
      ["Hanging Leg Raises", "hanging_leg_raise", 4],
      ["Iso-Lateral High Rows", "iso_lateral_high_row", 4],
      ["Reverse Fly Machine", null, 4],
      ["Cable Crunches", "cable_crunch", 4],
    ]);
    expect(exercises.flatMap((exercise) => exercise.sets)).toHaveLength(20);
    expect(exercises[0].sets).toEqual(
      expect.arrayContaining(Array(4).fill(expect.objectContaining({
        load_type: "bodyweight",
        reps: 13,
        weight: null,
        weight_unit: "bodyweight",
      })))
    );
    expect(exercises[1].sets.every((set) =>
      set.reps === 17 && set.load_type === "bodyweight"
    )).toBe(true);
    expect(exercises[2].sets.map((set) => [set.reps, set.weight]))
      .toEqual(Array(4).fill([18, 140]));
    expect(exercises[3]).toMatchObject({
      name: "Reverse Fly Machine",
      resolutionStatus: "unresolved_provisional",
      provisionalExercise: {
        normalizedDisplayName: "Reverse Fly Machine",
        resolutionStatus: "unresolved",
      },
    });
    expect(exercises[3].sets.map((set) => [set.reps, set.weight]))
      .toEqual([[17, 50], [17, 70], [10, 90], [11, 80]]);
    expect(exercises[4].sets.map((set) => [set.reps, set.weight]))
      .toEqual(Array(4).fill([25, 120]));
  });

  it.each(["x4", "x 4", "×4", "× 4"])(
    "expands reps-first bodyweight suffix repeat %s exactly four times",
    (repeat) => {
      const [exercise] = parse(`Pull ups\n13r bw ${repeat}`);
      expect(exercise.sets).toHaveLength(4);
      expect(exercise.sets.every((set) =>
        set.reps === 13 &&
        set.load_type === "bodyweight" &&
        set.weight === null
      )).toBe(true);
    }
  );

  it("normalizes pound tokens in either order within one exercise", () => {
    const [exercise] = parse(`ISO-lateral high rows
140p 18r
17r 50p
120p 25r x4`);
    expect(exercise.sets.map((set) => [set.reps, set.weight, set.weight_unit]))
      .toEqual([
        [18, 140, "lb"],
        [17, 50, "lb"],
        ...Array(4).fill([25, 120, "lb"]),
      ]);
  });

  it("keeps an unknown block between known blocks without set leakage", () => {
    const exercises = parse(`Pull ups
13r bw

Reverse Fly Machine
17r 50p
17r 70p
90p 10r
80p 11r

Cable crunches
120p 25r`);
    expect(exercises.map((exercise) => [exercise.name, exercise.sets.length]))
      .toEqual([
        ["Pull-Ups", 1],
        ["Reverse Fly Machine", 4],
        ["Cable Crunches", 1],
      ]);
    expect(exercises[1].resolutionStatus).toBe("unresolved_provisional");
    expect(exercises[2].sets[0]).toMatchObject({ reps: 25, weight: 120 });
  });

  it("surfaces one malformed set locally without dropping valid exercises or sets", () => {
    const result = getContextualStrengthSetParseDiagnostics(`Pull ups
13r bw
12r only

Cable crunches
120p 25r`);
    expect(result.exercises.map((exercise) => [exercise.name, exercise.sets.length]))
      .toEqual([["Pull-Ups", 1], ["Cable Crunches", 1]]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "ambiguous_or_incomplete_strength_set",
        raw_text: "12r only",
        source_line: 3,
      }),
    ]);
  });

  it("does not reinterpret unrelated words containing p as pound tokens", () => {
    const result = getContextualStrengthSetParseDiagnostics(`Pull ups
13r bw
Pump improved sharply

Cable crunches
120p 25r`);
    expect(result.issues).toEqual([]);
    expect(result.exercises.map((exercise) => [exercise.name, exercise.sets.length]))
      .toEqual([["Pull-Ups", 1], ["Cable Crunches", 1]]);
  });

  it("merges the full typed workout into the screenshot session and projects new-exercise review", () => {
    const [merged] = mergeExactWorkout();
    const presentation = createEvidenceReviewPresentation({
      evidencePackage: {
        artifacts: [{ id: "workout.png", filename: "workout.png" }],
        evidence_objects: [merged],
        typed_evidence: exactWorkout,
      },
    });

    expect(merged.reconciliation).toMatchObject({
      match_confidence: "high",
      matched_sources: expect.arrayContaining(["workout.png", "typed_evidence_0"]),
    });
    expect(presentation.items).toHaveLength(1);
    expect(presentation.items[0]).toMatchObject({
      title: "Traditional Strength Training",
      exercises: expect.arrayContaining([
        expect.objectContaining({ name: "Pull-Ups", sets: expect.any(Array) }),
        expect.objectContaining({
          name: "Reverse Fly Machine",
          provisionalExerciseId: expect.stringMatching(/^provisional_exercise_/),
          sets: [
            "17 reps @ 50 lb",
            "17 reps @ 70 lb",
            "10 reps @ 90 lb",
            "11 reps @ 80 lb",
          ],
        }),
      ]),
    });
    expect(presentation.items[0].exercises).toHaveLength(5);
    expect(presentation.items[0].exercises.flatMap((exercise) => exercise.sets))
      .toHaveLength(20);
    expect(presentation.items[0].exercises[0].sets)
      .toEqual(Array(4).fill("13 reps · Bodyweight"));
  });

  it("saves all twenty sets in isolation after resolving the new movement", async () => {
    const [training] = mergeExactWorkout();
    const provisional = training.exercises[3].provisionalExercise;
    const evidencePackage = resolveProvisionalExerciseInPackage(
      {
        package_id: "mixed_workout_fixture",
        evidence_objects: [training],
      },
      provisional.provisionalExerciseId,
      {
        mode: "new",
        canonical: createCanonicalExerciseDefinition({
          canonicalName: "Reverse Fly Machine",
          primaryMuscleGroupId: "shoulders",
          equipment: "Machine",
        }),
      }
    );
    const { filePath, liveStore } = isolatedStore();
    const result = await createCanonicalExerciseWorkoutCommitService({
      runtimeStorePath: filePath,
      liveStore,
      now: () => new Date("2026-08-03T04:00:00.000Z"),
      createUnitOfWork: (options) => createFounderStoreUnitOfWork({
        ...options,
        createCommitId: () => "mixed_workout_commit",
        createTransactionId: () => "mixed_workout_transaction",
      }),
    }).commit(evidencePackage, "fixture_user");

    expect(result).toMatchObject({ committed: true, commitId: "mixed_workout_commit" });
    expect(liveStore.canonicalExerciseLibrary.map((exercise) => exercise.name))
      .toEqual(["Reverse Fly Machine"]);
    const saved = liveStore.canonicalEvidenceObjects[0];
    expect(saved.payload.exercises.map((exercise) => exercise.name)).toEqual([
      "Pull-Ups",
      "Hanging Leg Raises",
      "Iso-Lateral High Rows",
      "Reverse Fly Machine",
      "Cable Crunches",
    ]);
    expect(saved.payload.exercises.flatMap((exercise) => exercise.sets))
      .toHaveLength(20);
    expect(saved.payload.exercises[0].sets).toHaveLength(4);
    expect(saved.payload.exercises[0].sets.every((set) =>
      set.load_type === "bodyweight" && set.weight === null
    )).toBe(true);
    expect(saved.payload.exercises[3].sets.map((set) => [set.reps, set.weight]))
      .toEqual([[17, 50], [17, 70], [10, 90], [11, 80]]);

    const prEvents = produceTrainingPerformanceEvents({
      canonicalTrainingSession: saved,
      trainingAnalysis: {
        id: "mixed_workout_analysis",
        metadata: {
          trainingPerformance: {
            exerciseObservations: [{
              exercise: { key: "iso_lateral_high_row", name: "Iso-Lateral High Rows" },
              explanation_data: {
                last_session: {
                  date: "2026-08-02",
                  session_id: saved.payload.id,
                  total_volume: 10080,
                },
                pr_detection: {
                  detected: true,
                  prs: [
                    { type: "reps_at_load", value: 18, previous_best: 17, load: 140, load_unit: "lb" },
                    { type: "reps_at_load", value: 18, previous_best: 17, load: 140, load_unit: "lb" },
                  ],
                },
              },
            }],
          },
        },
      },
      sourceReviewId: "mixed_workout_review",
      sourceEvidencePackageId: "mixed_workout_fixture",
      now: () => new Date("2026-08-03T04:01:00.000Z"),
    });
    expect(prEvents).toHaveLength(1);
    expect(prEvents[0]).toMatchObject({
      canonicalExerciseId: "iso_lateral_high_row",
      eventType: "reps_at_load_pr",
      reps: 18,
      load: 140,
    });
  });
});

function parse(text) {
  return createTrainingSessionEvidenceFromText({
    id: "mixed_workout_training",
    observedAt: "2026-08-02T12:00:00.000Z",
    provenanceRef: "typed_evidence_0",
    text,
  }).exercises;
}

function mergeExactWorkout() {
  return mergeTypedEvidenceIntoTrainingObjects({
    typedEvidence: exactWorkout,
    evidenceObjects: [{
      id: "mixed_workout_training",
      evidence_type: "training",
      observed_at: "2026-08-02T12:00:00.000Z",
      metadata: {
        activity_type: "Traditional Strength Training",
        active_calories: 527,
        duration_seconds: 6108,
      },
      source: { modality: "screenshot", source_artifact_refs: ["workout.png"] },
      provenance: { source_artifact_refs: ["workout.png"] },
      exercises: [],
    }],
  });
}

function isolatedStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mixed-workout-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    revision: 0,
    lastCommitId: null,
    canonicalExerciseLibrary: [],
    canonicalEvidenceObjects: [],
  };
  fs.writeFileSync(filePath, JSON.stringify(liveStore));
  return { filePath, liveStore };
}
