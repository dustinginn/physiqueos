import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository";
import { createTrainingSessionEvidenceFromText } from "../models/trainingSessionEvidence";

describe("canonical Training execution variants", () => {
  it("persists and reads back ordinary and Static Hold occurrences separately under one canonical movement", async () => {
    const repository = createCanonicalEvidenceRepository([], { onChange: vi.fn() });
    const result = await repository.reconcileConfirmedEvidencePackage({
        package_id: "variant-package",
        userId: "founder",
        evidence_objects: [{
          id: "training-variant",
          evidence_type: "training",
          observed_at: "2026-08-08",
          metadata: { activity_type: "Traditional Strength Training" },
          exercises: [
            exercise("ordinary", null, 10),
            exercise("static", { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" }, 13),
          ],
        }],
      }, "founder");
    const readback = await repository.listCanonicalEvidenceObjects("founder");
    const exercises = readback[0].payload.exercises;
    expect(result.report.addedCanonicalIds).toHaveLength(1);
    expect(exercises).toHaveLength(2);
    expect(exercises.map((item) => item.canonicalExerciseId)).toEqual([
      "spider_curl", "spider_curl",
    ]);
    expect(exercises.map((item) => item.sets[0].reps)).toEqual([10, 13]);
    expect(exercises[1].executionVariant.key).toBe("static_hold");
  });

  it("round-trips ordered Superset occurrence references without creating a new namespace", async () => {
    const repository = createCanonicalEvidenceRepository([], { onChange: vi.fn() });
    const exercises = [
      {
        id: "press_1",
        name: "Chest Press Machine",
        canonicalExerciseId: "chest_press_machine",
        sets: [{ set_number: 1, reps: 8, weight: 100, weight_unit: "lb" }],
      },
      {
        id: "fly_1",
        name: "Chest Fly Machine",
        canonicalExerciseId: "chest_fly_machine",
        sets: [{ set_number: 1, reps: 10, weight: 70, weight_unit: "lb" }],
      },
    ];
    await repository.reconcileConfirmedEvidencePackage({
      package_id: "superset-package",
      userId: "founder",
      evidence_objects: [{
        id: "training-superset",
        evidence_type: "training",
        observed_at: "2026-08-10",
        metadata: { activity_type: "Traditional Strength Training" },
        exercises,
        exerciseRelationshipGroups: [{
          id: "superset_1",
          relationshipType: "superset",
          memberExerciseIds: ["press_1", "fly_1"],
          provenance_ref: "typed_evidence_0",
          provenance: { source_artifact_refs: ["typed_evidence_0"] },
        }],
      }],
    }, "founder");
    const [canonical] = await repository.listCanonicalEvidenceObjects("founder");

    expect(canonical.payload.exercises.map((item) => item.id))
      .toEqual(["press_1", "fly_1"]);
    expect(canonical.payload.exerciseRelationshipGroups).toEqual([
      expect.objectContaining({
        relationshipType: "superset",
        memberExerciseIds: ["press_1", "fly_1"],
      }),
    ]);
  });

  it("keeps repeated same-movement occurrences distinct in canonical history", async () => {
    const repository = createCanonicalEvidenceRepository([], { onChange: vi.fn() });
    const workout = createTrainingSessionEvidenceFromText({
      id: "same-movement",
      observedAt: "2026-08-10",
      text: [
        "Superset:",
        "Leg Extensions",
        "Variant: Partial Reps",
        "12r 60p",
        "Leg Extensions",
        "Variant: Partial Reps",
        "15r 45p",
        "End Superset",
      ].join("\n"),
    });
    await repository.reconcileConfirmedEvidencePackage({
      package_id: "same-movement-package",
      userId: "founder",
      evidence_objects: [workout],
    }, "founder");
    const [canonical] = await repository.listCanonicalEvidenceObjects("founder");

    expect(canonical.payload.exercises).toHaveLength(2);
    expect(new Set(canonical.payload.exercises.map((item) => item.id)).size).toBe(2);
    expect(canonical.payload.exerciseRelationshipGroups[0].memberExerciseIds)
      .toEqual(canonical.payload.exercises.map((item) => item.id));
  });
});

function exercise(id, executionVariant, reps) {
  return {
    id,
    name: "Spider Curls",
    canonicalExerciseId: "spider_curl",
    ...(executionVariant ? { executionVariant } : {}),
    sets: [{ set_number: 1, reps, weight: 35, weight_unit: "lb" }],
  };
}
