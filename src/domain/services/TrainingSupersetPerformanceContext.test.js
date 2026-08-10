import { describe, expect, it } from "vitest";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";

describe("Superset performance context", () => {
  it("does not use a standalone session as a Superset trend comparison", () => {
    const report = createTrainingPerformanceIntelligenceReport({
      now: "2026-08-10T12:00:00.000Z",
      trainingSessions: [
        session({ date: "2026-08-01", id: "standalone", pressWeight: 100 }),
        session({ date: "2026-08-10", id: "superset", pressWeight: 100, superset: true }),
      ],
    });
    const press = report.exerciseObservations.find(
      (observation) => observation.exercise.key === "chest_press_machine"
    );

    expect(press.status).toBe("insufficient_data");
    expect(press.explanation_data.previous_comparable_session).toBeNull();
    expect(press.explanation_data.comparison_context).toMatchObject({
      comparable_session_count: 1,
      relationship: {
        relationship_type: "superset",
        ordered_partners: [
          expect.objectContaining({ canonical_exercise_id: "chest_fly_machine" }),
        ],
      },
    });
  });

  it("compares trends when the Superset partner context matches", () => {
    const report = createTrainingPerformanceIntelligenceReport({
      now: "2026-08-10T12:00:00.000Z",
      trainingSessions: [
        session({ date: "2026-08-01", id: "first", pressWeight: 90, superset: true }),
        session({ date: "2026-08-10", id: "second", pressWeight: 100, superset: true }),
      ],
    });
    const press = report.exerciseObservations.find(
      (observation) => observation.exercise.key === "chest_press_machine"
    );

    expect(press.status).toBe("improving");
    expect(press.explanation_data.previous_comparable_session.session_id).toBe("first");
    expect(press.explanation_data.comparison_context.comparable_session_count).toBe(2);
    expect(press.explanation_data.pr_detection.detected).toBe(true);
  });

  it("does not compare Superset PRs against a standalone pool", () => {
    const report = createTrainingPerformanceIntelligenceReport({
      now: "2026-08-10T12:00:00.000Z",
      trainingSessions: [
        session({ date: "2026-08-01", id: "standalone", pressWeight: 90 }),
        session({ date: "2026-08-10", id: "superset", pressWeight: 100, superset: true }),
      ],
    });
    const press = report.exerciseObservations.find(
      (observation) => observation.exercise.key === "chest_press_machine"
    );

    expect(press.id).toBe("performance|exercise|chest_press_machine");
    expect(press.explanation_data.pr_detection).toMatchObject({
      detected: false,
      prs: [],
    });
    expect(report.exerciseObservations.filter(
      (observation) => observation.exercise.key === "chest_press_machine"
    )).toHaveLength(1);
  });
});

function session({ date, id, pressWeight, superset = false }) {
  const exercises = [
    exercise("press", "Chest Press Machine", "chest_press_machine", pressWeight),
    exercise("fly", "Chest Fly Machine", "chest_fly_machine", 70),
  ];
  return {
    id,
    evidence_type: "training",
    observed_at: date,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises,
    ...(superset
      ? {
          exerciseRelationshipGroups: [{
            id: `${id}_superset`,
            relationshipType: "superset",
            memberExerciseIds: exercises.map((item) => item.id),
            provenance_ref: "typed_evidence_0",
          }],
        }
      : {}),
  };
}

function exercise(id, name, canonicalExerciseId, weight) {
  return {
    id,
    name,
    canonicalExerciseId,
    sets: [{ set_number: 1, reps: 10, weight, weight_unit: "lb" }],
  };
}
