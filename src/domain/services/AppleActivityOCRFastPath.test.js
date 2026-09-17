import { describe, expect, it } from "vitest";
import { createAppleActivityOCRPackage } from "./EvidenceIntakeService.js";
import { createEvidenceReviewPresentation } from "./EvidenceReviewPresentationService.js";

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
      clientExtractedText: [
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
      clientExtractedText: "Move\n948/700 CAL\nExercise\n67/30 MIN",
    })).toBeNull();
  });

  it("never applies the Activity shortcut to another explicit evidence context", () => {
    expect(createAppleActivityOCRPackage({
      artifacts: [artifact],
      evidenceDate: "2026-09-15",
      expectedEvidenceType: "nutrition",
      submissionId: "evidence_submission_nutrition_images",
      clientExtractedText: "Move 948/700 CAL Exercise 67/30 MIN Stand 13/12 HRS",
    })).toBeNull();
  });

  it("parses the physical Apple Health Summary surface without truncating values", () => {
    const result = createAppleActivityOCRPackage({
      artifacts: [artifact], evidenceDate: "2026-09-16",
      expectedEvidenceType: "activity_day",
      submissionId: "evidence_submission_physical_activity",
      clientExtractedText: [
        "10:57", "Summary", "Pinned", "Activity", "10:29 PM",
        "Move", "841 cal", "Exercise", "111 min", "Stand", "15 hr",
        "Steps", "8,432 steps", "Cardio Fitness", "Above Average",
        "45.5 VO₂ max", "Show All Health Data", "Trends",
      ].join("\n"),
    });

    expect(result?.evidence_objects[0].daily_activity).toMatchObject({
      move_calories: 841, move_goal: null,
      exercise_minutes: 111, exercise_goal: null,
      stand_hours: 15, stand_goal: null,
    });
  });

  it.each([
    [8, 1, 1], [84, 11, 9], [841, 111, 15], [8_432, 123, 24],
  ])("preserves complete numeric tokens for Move %i, Exercise %i, Stand %i", (move, exercise, stand) => {
    const result = createAppleActivityOCRPackage({
      artifacts: [artifact], evidenceDate: "2026-09-16",
      expectedEvidenceType: "activity_day", submissionId: `activity_${move}`,
      clientExtractedText: `Activity\nMove\n${move.toLocaleString("en-US")}\ncal\nExercise\n${exercise}\nmin\nStand\n${stand}\nhr`,
    });
    expect(result?.evidence_objects[0].daily_activity).toMatchObject({
      move_calories: move, exercise_minutes: exercise, stand_hours: stand,
    });
  });

  it("retains explicit actual/goal pairs only when the separator is present", () => {
    const result = createAppleActivityOCRPackage({
      artifacts: [artifact], evidenceDate: "2026-09-16",
      expectedEvidenceType: "activity_day", submissionId: "activity_goals",
      clientExtractedText: "Move 841 cal / 700 cal Exercise 111/30 min Stand 15 of 12 hr",
    });
    expect(result?.evidence_objects[0].daily_activity).toMatchObject({
      move_calories: 841, move_goal: 700,
      exercise_minutes: 111, exercise_goal: 30,
      stand_hours: 15, stand_goal: 12,
    });
  });

  it("fails closed when a labeled ring segment contains competing values", () => {
    expect(createAppleActivityOCRPackage({
      artifacts: [artifact], evidenceDate: "2026-09-16",
      expectedEvidenceType: "activity_day", submissionId: "activity_ambiguous",
      clientExtractedText: "Move 84 cal Total Calories 841 cal Exercise 11 min another 111 min Stand 15 hr",
    })).toBeNull();
  });

  it("keeps device OCR out of typed-evidence provenance and review presentation", () => {
    const result = createAppleActivityOCRPackage({
      artifacts: [artifact], evidenceDate: "2026-09-16",
      expectedEvidenceType: "activity_day", submissionId: "activity_source",
      clientExtractedText: "Move 841 cal Exercise 111 min Stand 15 hr",
    });
    result.provenance.source_artifacts = [{
      id: artifact.id, kind: "screenshot", mime_type: "image/jpeg",
      file_name: "activity.jpg",
    }];
    const item = createEvidenceReviewPresentation({ evidencePackage: result }).items[0];
    expect(item.sourceLabel).toBe("Screenshot");
    expect(item.typedEvidence).toBeNull();
  });
});
