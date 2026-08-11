import { describe, expect, it } from "vitest";
import {
  buildTrainingLoggerEvidencePackage,
  createProductionAppleHealthReconciliation,
} from "./TrainingLoggerAppleHealthService";
import { createEvidenceReviewPresentation } from "./EvidenceReviewPresentationService";

describe("TrainingLoggerAppleHealthService", () => {
  it("normalizes a batch, selects one strength match, keeps cardio separate, and excludes Walking by default", () => {
    const reconciliation = createProductionAppleHealthReconciliation({
      batchId: "batch_1",
      evidenceObjects: [
        appleWorkout("strength", "Traditional Strength Training", { duration_seconds: 3600 }),
        appleWorkout("stairs", "Stair Stepper", { duration_seconds: 1200 }),
        appleWorkout("walk", "Walking", { duration_seconds: 600 }),
      ],
      workoutDate: "2026-08-10",
    });
    expect(reconciliation.matchState).toBe("strong_match");
    expect(reconciliation.selectedStrengthSourceId).toBeTruthy();
    expect(reconciliation.additionalEvidenceActions).toEqual([
      expect.objectContaining({ canonicalOwnerType: "cardio_workout", included: true }),
      expect.objectContaining({ canonicalOwnerType: "activity_record", included: false }),
    ]);
  });

  it("requires explicit selection for multiple matches and supports no-match continuation", () => {
    const multiple = createProductionAppleHealthReconciliation({
      evidenceObjects: [
        appleWorkout("strength_a", "Traditional Strength Training"),
        appleWorkout("strength_b", "Functional Strength Training"),
      ],
      workoutDate: "2026-08-10",
    });
    const none = createProductionAppleHealthReconciliation({
      evidenceObjects: [appleWorkout("stairs", "Stair Stepper")],
      workoutDate: "2026-08-10",
    });
    expect(multiple).toMatchObject({
      matchState: "multiple_matches",
      selectedStrengthSourceId: null,
    });
    expect(none.matchState).toBe("no_match");
  });

  it("filters already-consumed source workouts before candidate presentation", () => {
    const source = appleWorkout("strength", "Traditional Strength Training");
    const first = createProductionAppleHealthReconciliation({
      evidenceObjects: [source],
      workoutDate: "2026-08-10",
    });
    const sourceWorkoutId = first.normalizedEvidence[0].sourceWorkoutId;
    const reconciliation = createProductionAppleHealthReconciliation({
      canonicalObjects: [{
        evidence_type: "training",
        payload: {
          evidence_type: "training",
          reconciliation: { source_workout_id: sourceWorkoutId },
        },
      }],
      evidenceObjects: [source],
      workoutDate: "2026-08-10",
    });
    expect(reconciliation.strengthCandidateIds).toEqual([]);
    expect(reconciliation.normalizedEvidence[0].consumption.state).toBe("consumed");
  });

  it("derives stable duplicate identity across separate uploads of the same evidenced workout", () => {
    const metrics = {
      active_calories: 400,
      duration_seconds: 3600,
      start_time: "4:00 PM",
      end_time: "5:00 PM",
    };
    const first = appleWorkout("first_upload", "Traditional Strength Training", metrics);
    const second = {
      ...appleWorkout("second_upload", "Traditional Strength Training", metrics),
      source: { application: "Apple Fitness", source_artifact_refs: ["different_artifact"] },
      provenance: { source_artifact_refs: ["different_artifact"] },
    };
    const firstReconciliation = createProductionAppleHealthReconciliation({
      evidenceObjects: [first],
      workoutDate: "2026-08-10",
    });
    const sourceWorkoutId = firstReconciliation.selectedStrengthSourceId;
    const secondReconciliation = createProductionAppleHealthReconciliation({
      canonicalObjects: [{ payload: first }],
      evidenceObjects: [second],
      workoutDate: "2026-08-10",
    });

    expect(sourceWorkoutId).toMatch(/^apple_workout_/);
    expect(secondReconciliation.normalizedEvidence[0].sourceWorkoutId).toBe(sourceWorkoutId);
    expect(secondReconciliation.strengthCandidateIds).toEqual([]);
    expect(secondReconciliation.normalizedEvidence[0].consumption.state).toBe("consumed");
  });

  it("builds one detailed TrainingSession with Variant, Superset, Apple provenance, and a separate cardio record", () => {
    const sourcePackage = {
      package_id: "batch_1",
      userId: "user_1",
      provenance: { source_artifacts: [{ id: "artifact_strength" }, { id: "artifact_stairs" }] },
      evidence_objects: [
        appleWorkout("strength", "Traditional Strength Training", {
          active_calories: 400,
          duration_seconds: 3600,
          start_time: "4:00 PM",
          end_time: "5:00 PM",
        }),
        appleWorkout("stairs", "Stair Stepper", { duration_seconds: 1200 }),
      ],
    };
    let reconciliation = createProductionAppleHealthReconciliation({
      batchId: "batch_1",
      evidenceObjects: sourcePackage.evidence_objects,
      workoutDate: "2026-08-10",
    });
    reconciliation = { ...reconciliation, finalized: true };
    const evidencePackage = buildTrainingLoggerEvidencePackage({
      draft: draft(reconciliation),
      sourcePackage,
      userId: "user_1",
    });
    const detailed = evidencePackage.evidence_objects[0];
    expect(evidencePackage.evidence_objects).toHaveLength(2);
    expect(detailed.exercises[0].executionVariant.label).toBe("Static Hold");
    expect(detailed.exerciseRelationshipGroups[0].memberExerciseIds).toEqual(["occ_spider", "occ_pushdown"]);
    expect(detailed.metadata).toMatchObject({
      start_time: "4:00 PM",
      end_time: "5:00 PM",
      active_calories: 400,
    });
    expect(detailed.provenance.source_artifact_refs).toContain("artifact_strength");
    expect(detailed.provenance.source_artifact_refs).not.toContain("artifact_stairs");
    expect(detailed.reconciliation.source_workout_id).toBeTruthy();
    expect(evidencePackage.evidence_objects[1].metadata.activity_type).toBe("Stair Stepper");
    expect(evidencePackage.evidence_objects[1].provenance.source_artifact_refs).toEqual([
      "artifact_stairs",
    ]);
    const reviewItem = createEvidenceReviewPresentation({ evidencePackage }).items[0];
    expect(reviewItem.title).toBe("Detailed strength workout");
    expect(reviewItem.exercises).toEqual([]);
    expect(reviewItem.metrics).toEqual(expect.arrayContaining([
      { label: "Exercises", value: "2" },
      { label: "Sets", value: "2" },
      { label: "Apple link", value: "Linked" },
    ]));
  });

  it("keeps retrospective time unknown without Apple evidence and rejects duplicate source consumption", () => {
    const noApple = buildTrainingLoggerEvidencePackage({
      draft: draft({
        normalizedEvidence: [],
        selectedStrengthSourceId: null,
        continueWithoutStrength: true,
        additionalEvidenceActions: [],
        finalized: true,
      }),
      userId: "user_1",
    });
    expect(noApple.evidence_objects[0].metadata.start_time).toBeNull();
    expect(noApple.evidence_objects[0].metadata.end_time).toBeNull();

    const source = appleWorkout("strength", "Traditional Strength Training");
    const reconciliation = createProductionAppleHealthReconciliation({
      evidenceObjects: [source],
      workoutDate: "2026-08-10",
    });
    const sourceWorkoutId = reconciliation.selectedStrengthSourceId;
    expect(() => buildTrainingLoggerEvidencePackage({
      canonicalObjects: [{ payload: { reconciliation: { source_workout_id: sourceWorkoutId } } }],
      draft: draft({ ...reconciliation, finalized: true }),
      sourcePackage: { evidence_objects: [source], provenance: { source_artifacts: [] } },
      userId: "user_1",
    })).toThrowError(/already been consumed/i);
  });

  it("uses measured logger timing only for a live session", () => {
    const live = buildTrainingLoggerEvidencePackage({
      draft: {
        ...draft({
          normalizedEvidence: [],
          selectedStrengthSourceId: null,
          continueWithoutStrength: true,
          additionalEvidenceActions: [],
          finalized: true,
        }),
        mode: "live",
        startedAt: "2026-08-10T16:00:00.000Z",
        finishedAt: "2026-08-10T17:15:00.000Z",
      },
      userId: "user_1",
    });

    expect(live.evidence_objects[0].metadata).toMatchObject({
      start_time: "2026-08-10T16:00:00.000Z",
      end_time: "2026-08-10T17:15:00.000Z",
      duration_seconds: 4500,
    });
  });
});

function appleWorkout(id, activityType, metadata = {}) {
  return {
    id,
    evidence_type: "training",
    observed_at: "2026-08-10",
    source: { application: "Apple Fitness", source_artifact_refs: [`artifact_${id}`] },
    provenance: { source_artifact_refs: [`artifact_${id}`] },
    metadata: { activity_type: activityType, active_calories: 200, ...metadata },
    exercises: [],
  };
}

function draft(reconciliation) {
  return {
    draftId: "draft_1",
    mode: "retrospective",
    workoutDate: "2026-08-10",
    reconciliation,
    exercises: [
      {
        id: "occ_spider",
        canonicalExerciseId: "spider_curl",
        name: "Spider Curls",
        bodyRegion: "Arms",
        equipment: "dumbbell",
        executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" },
        sets: [{ id: "set_1", reps: 12, load: 35, unit: "lb", confirmed: true }],
      },
      {
        id: "occ_pushdown",
        canonicalExerciseId: "cable_pushdown",
        name: "Cable Rope Pushdowns",
        bodyRegion: "Arms",
        equipment: "cable",
        sets: [{ id: "set_2", reps: 12, load: 50, unit: "lb", confirmed: true }],
      },
    ],
    exerciseRelationshipGroups: [{
      id: "group_1",
      relationshipType: "superset",
      memberExerciseIds: ["occ_spider", "occ_pushdown"],
      provenance_ref: "training_logger_draft",
    }],
  };
}
