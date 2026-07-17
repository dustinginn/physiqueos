import { describe, expect, it } from "vitest";
import { createEvidenceReviewPresentation } from "../services/EvidenceReviewPresentationService";
import { assessTypedStrengthParseCompleteness, mergeTypedEvidenceIntoTrainingObjects } from "./ScreenshotInterpreterService";
import { parseStrengthTrainingText } from "../models/trainingSessionEvidence";
import { JUL_14_STRENGTH_NOTE } from "../../fixtures/jul14StrengthEvidenceFixture";

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
      "Bulgarian Split Squat (Smith Machine)", "Pendulum Squat Machine", "Leg Extension", "Leg Press (Feet Middle)",
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
