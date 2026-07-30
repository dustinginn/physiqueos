import { describe, expect, it } from "vitest";
import { createTrainingSessionEvidenceFromText } from "./trainingSessionEvidence";
import { mergeTypedEvidenceIntoTrainingObjects } from "../interpreters/ScreenshotInterpreterService";

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
        suggestedMovementPattern: "Elbow Flexion",
        suggestedEquipment: "Machine",
        suggestedLaterality: "Bilateral",
      },
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
});

function parse(text) {
  return createTrainingSessionEvidenceFromText({
    id: "training_fixture",
    observedAt: "2026-07-29T12:00:00.000Z",
    provenanceRef: "typed_fixture",
    text,
  }).exercises;
}
