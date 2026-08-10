import { describe, expect, it } from "vitest";
import { createTrainingSessionCorrectionEvidencePackage } from "./EvidenceCorrectionService";

describe("TrainingSession correction Superset semantics", () => {
  it("preserves existing relationship structure when correction text omits structure syntax", () => {
    const result = createTrainingSessionCorrectionEvidencePackage({
      capturedAt: "2026-08-10T18:00:00.000Z",
      correctionText: [
        "Chest Press Machine",
        "8r 105p",
        "Chest Fly Machine",
        "10r 75p",
      ].join("\n"),
      targetCanonicalObject: target(),
      userId: "founder",
    });
    const workout = result.evidence_objects[0];

    expect(workout.exercises.map((exercise) => exercise.id))
      .toEqual(["press_1", "fly_1"]);
    expect(workout.exerciseRelationshipGroups[0].memberExerciseIds)
      .toEqual(["press_1", "fly_1"]);
    expect(workout.reconciliation.relationship_structure_authoritative)
      .toBeUndefined();
  });

  it("treats explicit corrected structure as authoritative and remaps members to stable occurrences", () => {
    const result = createTrainingSessionCorrectionEvidencePackage({
      capturedAt: "2026-08-10T18:00:00.000Z",
      correctionText: [
        "Superset:",
        "Chest Fly Machine",
        "10r 75p",
        "Chest Press Machine",
        "8r 105p",
        "End Superset",
      ].join("\n"),
      targetCanonicalObject: target(),
      userId: "founder",
    });
    const workout = result.evidence_objects[0];

    expect(workout.exercises.map((exercise) => exercise.id))
      .toEqual(["fly_1", "press_1"]);
    expect(workout.exerciseRelationshipGroups[0].memberExerciseIds)
      .toEqual(["fly_1", "press_1"]);
    expect(workout.reconciliation.relationship_structure_authoritative)
      .toBe(true);
  });

  it("preserves a reviewed occurrence Variant when correction text omits it", () => {
    const canonical = target();
    canonical.payload.exercises[0].executionVariant = {
      key: "static_hold",
      label: "Static Hold",
      rawLabel: "Static Hold",
    };
    const result = createTrainingSessionCorrectionEvidencePackage({
      capturedAt: "2026-08-10T18:00:00.000Z",
      correctionText: [
        "Chest Press Machine",
        "8r 105p",
        "Chest Fly Machine",
        "10r 75p",
      ].join("\n"),
      targetCanonicalObject: canonical,
      userId: "founder",
    });

    expect(result.evidence_objects[0].exercises[0]).toMatchObject({
      id: "press_1",
      executionVariant: {
        key: "static_hold",
        label: "Static Hold",
      },
      sets: [expect.objectContaining({ reps: 8, weight: 105 })],
    });
  });
});

function target() {
  return {
    canonicalId: "training|authoritative|workout",
    payload: {
      id: "training_1",
      evidence_type: "training",
      observed_at: "2026-08-10",
      metadata: { activity_type: "Traditional Strength Training" },
      exercises: [
        {
          id: "press_1",
          name: "Chest Press Machine",
          canonicalExerciseId: "chest_press_machine",
          sets: [{ reps: 8, weight: 100 }],
        },
        {
          id: "fly_1",
          name: "Chest Fly Machine",
          canonicalExerciseId: "chest_fly_machine",
          sets: [{ reps: 10, weight: 70 }],
        },
      ],
      exerciseRelationshipGroups: [{
        id: "superset_1",
        relationshipType: "superset",
        memberExerciseIds: ["press_1", "fly_1"],
        provenance_ref: "typed_evidence_0",
      }],
    },
  };
}
