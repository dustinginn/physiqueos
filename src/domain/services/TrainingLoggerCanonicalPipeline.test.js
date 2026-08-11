import { describe, expect, it } from "vitest";
import { reconcileEvidencePackageIntoCanonicalHistory } from "./CanonicalEvidenceService";
import { buildTrainingLoggerEvidencePackage } from "./TrainingLoggerAppleHealthService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { adaptTrainingPerformanceReportToPIObservations } from "./TrainingPIObservationAdapter";

describe("Training Logger canonical pipeline continuity", () => {
  it("enters canonical Training history and downstream Training PI without a Logger-specific universe", () => {
    const evidencePackage = buildTrainingLoggerEvidencePackage({
      draft: {
        draftId: "pipeline_draft",
        mode: "retrospective",
        workoutDate: "2026-08-10",
        reconciliation: {
          normalizedEvidence: [],
          selectedStrengthSourceId: null,
          continueWithoutStrength: true,
          additionalEvidenceActions: [],
          finalized: true,
        },
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
          id: "superset_1",
          relationshipType: "superset",
          memberExerciseIds: ["occ_spider", "occ_pushdown"],
          provenance_ref: "training_logger_draft_pipeline",
        }],
      },
      userId: "user_1",
    });
    const canonical = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage,
      existingCanonicalObjects: [],
      userId: "user_1",
    });
    expect(canonical).toHaveLength(1);
    expect(canonical[0].payload).toMatchObject({
      evidence_type: "training",
      metadata: { logger_origin: "training_logger" },
      exercises: [
        expect.objectContaining({ canonicalExerciseId: "spider_curl" }),
        expect.objectContaining({ canonicalExerciseId: "cable_pushdown" }),
      ],
      exerciseRelationshipGroups: [expect.objectContaining({ relationshipType: "superset" })],
    });
    expect(canonical[0].payload.exercises[0].executionVariant.label).toBe("Static Hold");

    const report = createTrainingPerformanceIntelligenceReport({
      canonicalObjects: canonical,
      now: new Date("2026-08-11T12:00:00Z"),
    });
    expect(report.exerciseObservations.map((item) => item.exercise.key)).toEqual(
      expect.arrayContaining(["spider_curl", "cable_pushdown"])
    );
    const piObservations = adaptTrainingPerformanceReportToPIObservations(report);
    expect(piObservations.every((item) => item.domain === "training")).toBe(true);
    expect(piObservations.some((item) => item.provenance.sourceEvidenceIds.length > 0)).toBe(true);
  });
});
