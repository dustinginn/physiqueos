import { describe, expect, it } from "vitest";
import { createAppleActivityOCRPackage } from "./EvidenceIntakeService.js";
import { createEvidenceReviewService } from "./EvidenceReviewService.js";
import { createEvidenceReviewPresentation } from "./EvidenceReviewPresentationService.js";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService.js";

const OWNER = "user_founder_001";
const DATE = "2026-09-16";
const PREDECESSOR = "3F820AF9-F53D-46B1-BB4F-6F57816BB957";
const REPLACEMENT = "02999999-9999-7999-8999-999999999999";

describe("dismissed Evidence replacement production regression", () => {
  it("keeps the dismissed review auditable and confirms one corrected Activity Day", async () => {
    const predecessor = Object.freeze({
      id: "evidence_review_3F820AF9F53D46B1BB4F6F57816BB957",
      status: "discarded",
      disposition: Object.freeze({
        discardedAt: "2026-09-17T20:56:54.382Z",
        discardedBy: OWNER,
      }),
      interpretedEvidence: Object.freeze({ package_id: "bad-build38-activity" }),
    });
    const predecessorSnapshot = JSON.stringify(predecessor);
    const artifact = {
      id: `artifact_${REPLACEMENT.replaceAll("-", "")}_1`,
      uploadedAt: "2026-09-17T22:00:00.000Z",
    };
    const replacementPackage = createAppleActivityOCRPackage({
      artifacts: [artifact],
      evidenceDate: DATE,
      expectedEvidenceType: "activity_day",
      submissionId: `evidence_submission_${REPLACEMENT.replaceAll("-", "")}`,
      clientExtractedText: [
        "Summary", "Pinned", "Activity", "Move", "841 cal",
        "Exercise", "111 min", "Stand", "15 hr", "Steps", "8,432 steps",
        "Cardio Fitness", "Above Average", "45.5 VO₂ max",
      ].join("\n"),
    });
    replacementPackage.provenance.source_artifacts = [{
      id: artifact.id,
      kind: "screenshot",
      mime_type: "image/jpeg",
      file_name: "activity.jpg",
    }];
    replacementPackage.review_metadata = {
      recoveryContext: {
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: PREDECESSOR,
      },
      intakeReceiptId: `evidence_intake_${REPLACEMENT}`,
    };

    const reviews = new Map([[predecessor.id, predecessor]]);
    const service = createEvidenceReviewService({
      repositories: {
        evidenceReviews: {
          async createReview(review) { reviews.set(review.id, structuredClone(review)); return review; },
          async getReviewById(id) { return reviews.get(id) ?? null; },
          async updateReview(id, patchValue) {
            const updated = { ...reviews.get(id), ...structuredClone(patchValue) };
            reviews.set(id, updated);
            return updated;
          },
        },
      },
      now: () => new Date("2026-09-17T22:01:00.000Z"),
    });
    const review = await service.stage({
      userId: OWNER,
      evidencePackage: replacementPackage,
      source: "historical_universal_intake",
      reviewId: `evidence_review_${REPLACEMENT.replaceAll("-", "")}`,
      intakeReceiptId: `evidence_intake_${REPLACEMENT}`,
      createdAt: "2026-09-17T22:00:00.000Z",
    });
    expect(review).toMatchObject({
      status: "pending",
      interpretedEvidence: {
        review_metadata: {
          recoveryContext: {
            kind: "dismissed_evidence_replacement",
            predecessorSubmissionIdentity: PREDECESSOR,
          },
        },
      },
    });
    const presentation = createEvidenceReviewPresentation({ evidencePackage: review.interpretedEvidence });
    expect(presentation.items[0]).toMatchObject({ sourceLabel: "Screenshot", typedEvidence: null });
    expect(review.interpretedEvidence.evidence_objects[0].daily_activity).toMatchObject({
      move_calories: 841,
      exercise_minutes: 111,
      stand_hours: 15,
    });

    const committed = reconcileConfirmedEvidencePackage({
      evidencePackage: review.interpretedEvidence,
      existingCanonicalObjects: [],
      userId: OWNER,
    });
    expect(committed.changedObjects).toHaveLength(1);
    expect(committed.changedObjects[0]).toMatchObject({
      canonicalId: `activity_day|${DATE}`,
      quality: { status: "active" },
      payload: {
        evidence_type: "activity_day",
        observed_at: DATE,
        daily_activity: { move_calories: 841, exercise_minutes: 111, stand_hours: 15 },
      },
    });
    const confirmed = await service.confirm(review.id, {
      evidencePackage: review.interpretedEvidence,
      confirmedBy: OWNER,
    });
    expect(confirmed.status).toBe("confirmed");
    await expect(service.confirm(review.id, {
      evidencePackage: review.interpretedEvidence,
      confirmedBy: OWNER,
    })).rejects.toThrow("no longer pending");

    const replay = reconcileConfirmedEvidencePackage({
      evidencePackage: review.interpretedEvidence,
      existingCanonicalObjects: committed.changedObjects,
      userId: OWNER,
    });
    expect(replay.changedObjects).toHaveLength(0);
    expect(committed.changedObjects.filter((item) =>
      item.quality?.status !== "superseded" && item.payload?.evidence_type === "activity_day"
    )).toHaveLength(1);
    expect(JSON.stringify(reviews.get(predecessor.id))).toBe(predecessorSnapshot);
  });
});
