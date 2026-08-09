import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository";

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
