import { describe, expect, it } from "vitest";
import { createAppleActivityOCRPackage } from "./EvidenceIntakeService.js";

describe("Apple Activity deterministic OCR fast path", () => {
  const artifact = {
    id: "artifact-activity-one",
    uploadedAt: "2026-09-16T05:42:00.000Z",
  };

  it("creates one canonical ActivityDay without a model call when all ring rows are proven", () => {
    const result = createAppleActivityOCRPackage({
      artifacts: [artifact],
      evidenceDate: "2026-09-15",
      expectedEvidenceType: "activity_day",
      submissionId: "evidence_submission_activity_images",
      typedEvidence: [
        "Activity", "Move", "948/700 CAL", "Exercise", "67/30 MIN",
        "Stand", "13/12 HRS", "Total Calories 2,431 CAL",
      ].join("\n"),
    });

    expect(result?.interpreter).toMatchObject({ provider: "apple_vision_ocr", model: null });
    expect(result?.evidence_objects).toHaveLength(1);
    expect(result.evidence_objects[0]).toMatchObject({
      evidence_type: "activity_day",
      observed_at: "2026-09-15",
      daily_activity: {
        move_calories: 948,
        move_goal: 700,
        exercise_minutes: 67,
        exercise_goal: 30,
        stand_hours: 13,
        stand_goal: 12,
        total_calories_burned: 2431,
      },
      source: {
        modality: "screenshot",
        application: "Apple Fitness",
        source_artifact_refs: [artifact.id],
      },
    });
  });

  it("fails closed to the existing general interpreter when any ring row is incomplete", () => {
    expect(createAppleActivityOCRPackage({
      artifacts: [artifact],
      evidenceDate: "2026-09-15",
      expectedEvidenceType: "activity_day",
      submissionId: "evidence_submission_activity_images",
      typedEvidence: "Move\n948/700 CAL\nExercise\n67/30 MIN",
    })).toBeNull();
  });

  it("never applies the Activity shortcut to another explicit evidence context", () => {
    expect(createAppleActivityOCRPackage({
      artifacts: [artifact],
      evidenceDate: "2026-09-15",
      expectedEvidenceType: "nutrition",
      submissionId: "evidence_submission_nutrition_images",
      typedEvidence: "Move 948/700 CAL Exercise 67/30 MIN Stand 13/12 HRS",
    })).toBeNull();
  });
});
