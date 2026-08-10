import { describe, expect, it } from "vitest";
import { createEvidenceReviewPresentation } from "../services/EvidenceReviewPresentationService";
import { assessTypedStrengthParseCompleteness, mergeTypedEvidenceIntoTrainingObjects } from "./ScreenshotInterpreterService";
import { parseStrengthTrainingText } from "../models/trainingSessionEvidence";
import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
  resolveTrainingExerciseIdentity,
} from "../models/trainingExerciseIdentity";
import { JUL_14_STRENGTH_NOTE } from "../../fixtures/jul14StrengthEvidenceFixture";

const MACHINE_LATERAL_RAISE_WORKOUT = [
  "Shoulder press machine",
  "11r 150p",
  "11r 150p",
  "10r 150p",
  "10r 150p",
  "",
  "Lateral raises machine",
  "12r 80p x4",
  "",
  "Cable machine front raises",
  "12r 130p x4",
].join("\n");

const AUG_9_MIXED_WORKOUT = [
  "Pull ups",
  "13r bw",
  "13r bw",
  "13r bw",
  "13r bw",
  "",
  "Hanging leg raises",
  "17r bw",
  "17r bw",
  "17r bw",
  "17r bw",
  "",
  "ISO lateral high rows",
  "140p 18r x4",
  "",
  "Wide Grip Seated Cable Rows",
  "12r 100p",
  "12r 100p",
  "12r 100p",
  "12r 100p",
].join("\n");

const SPECIALIZED_LEG_PRESS_IDS = [
  "leg_press_feet_middle",
  "leg_press_feet_high",
  "leg_press_feet_low",
  "leg_press_sumo_stance",
];
const SPECIALIZED_LEG_PRESS_CASES = FOUNDER_ALPHA_TRAINING_EXERCISES
  .filter((exercise) => SPECIALIZED_LEG_PRESS_IDS.includes(exercise.id))
  .flatMap((exercise) =>
    [exercise.name, ...exercise.aliases].map((heading) => [
      heading,
      exercise.id,
    ])
  );

function strengthObject(exercises = parseStrengthTrainingText(JUL_14_STRENGTH_NOTE)) {
  return {
    id: "training_2026-07-14_traditional-strength-training_1702-1801",
    evidence_type: "training",
    observed_at: "2026-07-14",
    metadata: { activity_type: "Traditional Strength Training", active_calories: 494, duration_seconds: 3547 },
    source: { modality: "screenshot", source_artifact_refs: ["IMG_1475.png", "typed_evidence_0"] },
    provenance: { source_artifact_refs: ["IMG_1475.png", "typed_evidence_0"] },
    exercises,
  };
}

describe("typed strength reconciliation completeness", () => {
  it("enriches an empty screenshot shell with the exact mixed Aug 9 workout", () => {
    const screenshotSession = strengthObject([]);
    screenshotSession.observed_at = "2026-08-09";
    screenshotSession.metadata = {
      activity_type: "Traditional Strength Training",
      active_calories: 508,
      duration_seconds: 4355,
      average_heart_rate: 120,
    };
    const parsedExercises = parseStrengthTrainingText(AUG_9_MIXED_WORKOUT);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence: AUG_9_MIXED_WORKOUT,
    });
    const [result] = mergeTypedEvidenceIntoTrainingObjects({
      evidenceObjects: [screenshotSession],
      typedEvidence: AUG_9_MIXED_WORKOUT,
    });

    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      parsedIdentities: [
        "pull_up",
        "hanging_leg_raise",
        "iso_lateral_high_row",
        "wide_grip_seated_cable_rows",
      ],
      recognizedIdentities: [
        "pull_up",
        "hanging_leg_raise",
        "seated_cable_row",
      ],
      status: "complete",
    });
    expect(result.metadata).toMatchObject(screenshotSession.metadata);
    expect(result.exercises.map((exercise) => exercise.name)).toEqual([
      "Pull-Ups",
      "Hanging Leg Raises",
      "Iso-Lateral High Rows",
      "Wide Grip Seated Cable Rows",
    ]);
    expect(result.exercises.map((exercise) => exercise.canonicalExerciseId)).toEqual([
      "pull_up",
      "hanging_leg_raise",
      "iso_lateral_high_row",
      null,
    ]);
    expect(result.exercises.map((exercise) => exercise.sets.length)).toEqual([4, 4, 4, 4]);
    expect(result.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(16);
    expect(result.exercises[0].sets).toEqual(
      Array(4).fill(expect.objectContaining({ reps: 13, load_type: "bodyweight", weight: null }))
    );
    expect(result.exercises[1].sets).toEqual(
      Array(4).fill(expect.objectContaining({ reps: 17, load_type: "bodyweight", weight: null }))
    );
    expect(result.exercises[2].sets).toEqual(
      Array(4).fill(expect.objectContaining({ reps: 18, weight: 140, weight_unit: "lb" }))
    );
    expect(result.exercises[3]).toMatchObject({
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
      provisionalExercise: {
        resolutionStatus: "unresolved",
      },
    });
    expect(result.exercises[3].sets).toEqual(
      Array(4).fill(expect.objectContaining({ reps: 12, weight: 100, weight_unit: "lb" }))
    );

    const presentation = createEvidenceReviewPresentation({
      evidencePackage: {
        evidence_objects: [result],
        provenance: {
          source_artifacts: [
            { id: "IMG_1843.png", kind: "image" },
            { id: "typed_evidence_0", kind: "typed_evidence", text: AUG_9_MIXED_WORKOUT },
          ],
        },
      },
    });
    expect(presentation.items).toHaveLength(1);
    expect(presentation.items[0].exercises.map((exercise) => exercise.name)).toEqual([
      "Pull-Ups",
      "Hanging Leg Raises",
      "Iso-Lateral High Rows",
      "Wide Grip Seated Cable Rows",
    ]);
    expect(presentation.items[0].exercises.slice(0, 3).every((exercise) => !exercise.provisionalExerciseId)).toBe(true);
    expect(presentation.items[0].exercises[3].provisionalExerciseId).toMatch(/^provisional_exercise_/);
  });

  it("merges the exact machine lateral-raise workout into an empty screenshot session", () => {
    const emptyScreenshotSession = strengthObject([]);
    const parsedExercises = parseStrengthTrainingText(MACHINE_LATERAL_RAISE_WORKOUT);
    const completeness = assessTypedStrengthParseCompleteness({
      existingExercises: [],
      parsedExercises,
      typedEvidence: MACHINE_LATERAL_RAISE_WORKOUT,
    });
    const [result] = mergeTypedEvidenceIntoTrainingObjects({
      evidenceObjects: [emptyScreenshotSession],
      typedEvidence: MACHINE_LATERAL_RAISE_WORKOUT,
    });

    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      recognizedIdentities: [
        "shoulder_press_machine",
        "lateral_raise_machine",
      ],
      status: "complete",
    });
    expect(result.exercises.map((exercise) => exercise.name)).toEqual([
      "Shoulder Press Machine",
      "Lateral Raises Machine",
      "Cable Machine Front Raises",
    ]);
    expect(result.exercises.map((exercise) => exercise.sets.length)).toEqual([
      4, 4, 4,
    ]);
    expect(
      result.exercises.map((exercise) =>
        exercise.sets.map(({ reps, weight }) => [reps, weight])
      )
    ).toEqual([
      [[11, 150], [11, 150], [10, 150], [10, 150]],
      Array(4).fill([12, 80]),
      Array(4).fill([12, 130]),
    ]);
    expect(result.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(12);
    expect(result.reconciliation.typed_parse).toMatchObject({
      complete: true,
      missingIdentities: [],
      status: "complete",
    });
    expect(result.reconciliation).toMatchObject({
      match_confidence: "high",
      matched_sources: ["IMG_1475.png", "typed_evidence_0"],
    });
  });

  it.each([
    "Lateral raise machine",
    "Lateral raises machine",
    "Machine lateral raise",
    "Machine lateral raises",
  ])("recognizes the machine-specific identity for %s", (heading) => {
    const typedEvidence = `${heading}\n12r 80p x4`;
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(parsedExercises).toHaveLength(1);
    expect(parsedExercises[0]).toMatchObject({
      canonicalExerciseId: "lateral_raise_machine",
      name: "Lateral Raises Machine",
    });
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      recognizedIdentities: ["lateral_raise_machine"],
      status: "complete",
    });
  });

  it.each([
    "Machine lateral raise",
    "Machine lateral raises",
  ])("preserves the machine-specific identity for one-set %s", (heading) => {
    const typedEvidence = `${heading}\n12r 80p`;
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(resolveTrainingExerciseIdentity(heading).canonicalExerciseId)
      .toBe("lateral_raise_machine");
    expect(parsedExercises).toEqual([
      expect.objectContaining({
        canonicalExerciseId: "lateral_raise_machine",
        name: "Lateral Raises Machine",
        sets: [expect.objectContaining({ reps: 12, weight: 80 })],
      }),
    ]);
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      parsedIdentities: ["lateral_raise_machine"],
      recognizedIdentities: ["lateral_raise_machine"],
      status: "complete",
    });
  });

  it("keeps non-machine lateral raises on the existing lateral_raise identity", () => {
    const typedEvidence = "Lateral raises\n12r 80p x4";
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(parsedExercises).toHaveLength(1);
    expect(parsedExercises[0]).toMatchObject({
      canonicalExerciseId: "lateral_raise",
      name: "Lateral Raise",
    });
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      recognizedIdentities: ["lateral_raise"],
      status: "complete",
    });
  });

  it("keeps a one-set ordinary lateral raise on the broad identity", () => {
    const typedEvidence = "Lateral raise\n12r 80p";
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(resolveTrainingExerciseIdentity("Lateral raise").canonicalExerciseId)
      .toBe("lateral_raise");
    expect(parsedExercises).toEqual([
      expect.objectContaining({
        canonicalExerciseId: "lateral_raise",
        name: "Lateral Raise",
        sets: [expect.objectContaining({ reps: 12, weight: 80 })],
      }),
    ]);
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      recognizedIdentities: ["lateral_raise"],
      status: "complete",
    });
  });

  it.each(SPECIALIZED_LEG_PRESS_CASES)(
    "aligns resolver, parser, and diagnostics for registered leg-press form %s",
    (heading, canonicalExerciseId) => {
      const typedEvidence = `${heading}\n12r 180p`;
      const parsedExercises = parseStrengthTrainingText(typedEvidence);
      const completeness = assessTypedStrengthParseCompleteness({
        parsedExercises,
        typedEvidence,
      });

      expect(resolveTrainingExerciseIdentity(heading).canonicalExerciseId)
        .toBe(canonicalExerciseId);
      expect(parsedExercises).toEqual([
        expect.objectContaining({
          canonicalExerciseId,
          sets: [expect.objectContaining({ reps: 12, weight: 180 })],
        }),
      ]);
      expect(completeness).toMatchObject({
        complete: true,
        missingIdentities: [],
        parsedIdentities: [canonicalExerciseId],
        recognizedIdentities: [canonicalExerciseId],
        status: "complete",
      });
    }
  );

  it("keeps ordinary Leg Press on the generic identity", () => {
    const typedEvidence = "Leg Press\n12r 180p";
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(resolveTrainingExerciseIdentity("Leg Press").canonicalExerciseId)
      .toBe("leg_press");
    expect(parsedExercises).toEqual([
      expect.objectContaining({
        canonicalExerciseId: "leg_press",
        sets: [expect.objectContaining({ reps: 12, weight: 180 })],
      }),
    ]);
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      parsedIdentities: ["leg_press"],
      recognizedIdentities: ["leg_press"],
      status: "complete",
    });
  });

  it.each([
    "Bulgarian split squat smith machine",
    "Bulgarian split squat (smith machine)",
    "Smith machine Bulgarian split squat",
    "Smith Bulgarian split squat",
  ])("keeps Smith-machine Bulgarian split squat diagnostics aligned for %s", (
    heading
  ) => {
    const typedEvidence = `${heading}\n10r 40p x4`;
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(parsedExercises).toHaveLength(1);
    expect(parsedExercises[0]).toMatchObject({
      canonicalExerciseId: "bulgarian_split_squat_smith_machine",
      name: "Bulgarian Split Squat (Smith Machine)",
    });
    expect(parsedExercises[0].sets).toHaveLength(4);
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      parsedIdentities: ["bulgarian_split_squat_smith_machine"],
      recognizedIdentities: ["bulgarian_split_squat_smith_machine"],
      status: "complete",
    });
    expect(completeness.missingIdentities).not.toContain(
      "bulgarian_split_squat"
    );
  });

  it("keeps ordinary Bulgarian split squats on the non-machine identity", () => {
    const typedEvidence = "Bulgarian split squat\n10r 40p x4";
    const parsedExercises = parseStrengthTrainingText(typedEvidence);
    const completeness = assessTypedStrengthParseCompleteness({
      parsedExercises,
      typedEvidence,
    });

    expect(parsedExercises).toHaveLength(1);
    expect(parsedExercises[0]).toMatchObject({
      canonicalExerciseId: "bulgarian_split_squat",
      name: "Bulgarian Split Squat",
    });
    expect(completeness).toMatchObject({
      complete: true,
      missingIdentities: [],
      parsedIdentities: ["bulgarian_split_squat"],
      recognizedIdentities: ["bulgarian_split_squat"],
      status: "complete",
    });
  });

  it("normally reconciles a complete four-exercise parse without duplicates", () => {
    const sourceArtifacts = [{ id: "typed_evidence_0", kind: "typed_evidence", text: JUL_14_STRENGTH_NOTE }];
    const before = JSON.stringify(sourceArtifacts);
    const [result] = mergeTypedEvidenceIntoTrainingObjects({ evidenceObjects: [strengthObject()], typedEvidence: JUL_14_STRENGTH_NOTE });
    expect(result.exercises).toHaveLength(4);
    expect(result.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(13);
    expect(new Set(result.exercises.map((exercise) => exercise.id)).size).toBe(4);
    expect(result.metadata).toMatchObject({ active_calories: 494, duration_seconds: 3547 });
    expect(result.source.source_artifact_refs).toEqual(["IMG_1475.png", "typed_evidence_0"]);
    expect(JSON.stringify(sourceArtifacts)).toBe(before);
    const presentation = createEvidenceReviewPresentation({ evidencePackage: { evidence_objects: [result], provenance: { source_artifacts: sourceArtifacts } } });
    expect(presentation.items[0].exercises.map((exercise) => exercise.name)).toEqual([
      "Bulgarian Split Squat (Smith Machine)", "Pendulum Squat Machine", "Leg Extensions", "Leg Press (Feet Middle)",
    ]);
  });

  it("rejects a lower-cardinality parse and counts bodyweight-only identities", () => {
    const existing = strengthObject().exercises;
    const incomplete = [{ ...existing.at(-1), sets: existing.slice(1).flatMap((exercise) => exercise.sets) }];
    const assessment = assessTypedStrengthParseCompleteness({ existingExercises: existing, parsedExercises: incomplete, typedEvidence: JUL_14_STRENGTH_NOTE });
    expect(assessment).toMatchObject({ complete: false, status: "incomplete_preserved_existing" });
    expect(assessment.existingTypedIdentities).toContain("bulgarian_split_squat_smith_machine");
    expect(assessment.missingIdentities).toEqual(expect.arrayContaining(["bulgarian_split_squat_smith_machine", "pendulum_squat_machine", "leg_extension"]));
  });

  it("preserves a usable four-exercise interpreter result when deterministic parsing is incomplete", () => {
    const existing = strengthObject();
    const incompleteText = `Bulgarian Split Squat (Smith Machine)\nSet details unavailable\nPendulum Squat Machine\nSet 1: 10 reps @ 35 lb\nLeg Extension\nSet details unavailable\nLeg Press (Feet Middle)\nSet details unavailable`;
    const [result] = mergeTypedEvidenceIntoTrainingObjects({ evidenceObjects: [existing], typedEvidence: incompleteText });
    expect(result.exercises).toEqual(existing.exercises);
    expect(result.reconciliation.typed_parse).toMatchObject({ complete: false, status: "incomplete_preserved_existing" });
    expect(result.metadata).toEqual(existing.metadata);
    expect(result.source.source_artifact_refs).toEqual(existing.source.source_artifact_refs);
  });
});
