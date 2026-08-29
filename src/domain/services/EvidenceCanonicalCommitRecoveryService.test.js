import { describe, expect, it } from "vitest";
import {
  reconcileConfirmedEvidencePackage,
} from "./CanonicalEvidenceService";
import {
  assertCanonicalCommitRecoveryProof,
  CanonicalCommitRecoveryDisposition,
  inspectEvidenceCanonicalCommitRecovery,
} from "./EvidenceCanonicalCommitRecoveryService";

describe("Evidence canonical commit recovery", () => {
  it("proves an expired pre-first-step review has zero source side effects", () => {
    const review = incidentReview();
    const result = inspectEvidenceCanonicalCommitRecovery({
      review,
      canonicalEvidenceObjects: [],
      now: new Date("2026-08-29T06:40:00.000Z"),
    });
    expect(result).toMatchObject({
      disposition: CanonicalCommitRecoveryDisposition.ZERO_SIDE_EFFECTS,
      reviewId: review.id,
      packageId: review.interpretedEvidence.package_id,
      expectedEvidenceObjectCount: 1,
      priorClaim: { operationId: "expired-operation" },
    });
    expect(() => assertCanonicalCommitRecoveryProof(result, review))
      .not.toThrow();
  });

  it("recognizes an atomic commit that landed before progress persistence", () => {
    const review = incidentReview({ progressStatus: "started" });
    const committed = reconcileConfirmedEvidencePackage({
      evidencePackage: review.interpretedEvidence,
      existingCanonicalObjects: [],
      userId: review.userId,
    }).changedObjects;

    const result = inspectEvidenceCanonicalCommitRecovery({
      review,
      canonicalEvidenceObjects: committed,
      now: new Date("2026-08-29T06:40:00.000Z"),
    });

    expect(result.reason).toBeUndefined();
    expect(result).toMatchObject({
      disposition:
        CanonicalCommitRecoveryDisposition.COMMITTED_WITHOUT_PROGRESS,
      canonicalEvidenceIds: [committed[0].canonicalId],
    });
  });

  it("fails closed for partial source side effects or an active claim", () => {
    const review = incidentReview();
    review.interpretedEvidence.evidence_objects.push({
      id: "activity-object",
      evidence_type: "activity_day",
      observed_at: "2026-08-26",
      daily_activity: { move_calories: 500 },
      provenance: { source_artifact_refs: ["activity.png"] },
    });
    const firstOnly = reconcileConfirmedEvidencePackage({
      evidencePackage: {
        ...review.interpretedEvidence,
        evidence_objects: [review.interpretedEvidence.evidence_objects[0]],
      },
      existingCanonicalObjects: [],
      userId: review.userId,
    }).changedObjects;
    expect(inspectEvidenceCanonicalCommitRecovery({
      review,
      canonicalEvidenceObjects: firstOnly,
      now: new Date("2026-08-29T06:40:00.000Z"),
    })).toMatchObject({
      disposition: CanonicalCommitRecoveryDisposition.AMBIGUOUS,
      reason: "COMMIT_RECOVERY_SIDE_EFFECTS_PARTIAL",
    });

    review.commitClaim.leaseExpiresAt = "2026-08-29T06:50:00.000Z";
    expect(inspectEvidenceCanonicalCommitRecovery({
      review,
      canonicalEvidenceObjects: [],
      now: new Date("2026-08-29T06:40:00.000Z"),
    })).toMatchObject({
      disposition: CanonicalCommitRecoveryDisposition.AMBIGUOUS,
      reason: "COMMIT_RECOVERY_CLAIM_ACTIVE",
    });
  });

  it("rejects a recovery proof tied to another persisted claim", () => {
    const review = incidentReview();
    const proof = inspectEvidenceCanonicalCommitRecovery({
      review,
      canonicalEvidenceObjects: [],
      now: new Date("2026-08-29T06:40:00.000Z"),
    });
    review.commitClaim.operationId = "different-operation";
    expect(() => assertCanonicalCommitRecoveryProof(proof, review))
      .toThrow(/cannot be recovered safely/i);
  });
});

function incidentReview({ progressStatus = null } = {}) {
  return {
    id: "evidence_review_20260829062229233",
    userId: "founder",
    status: "committing",
    confirmation: null,
    interpretedEvidence: {
      package_id: "evidence_submission_20260829062048593_images",
      review_metadata: {
        sourceReviewId: "evidence_review_20260829062229233",
        confirmedAt: "2026-08-29T06:23:20.000Z",
      },
      evidence_objects: [{
        id: "training-aug-26",
        evidence_type: "training",
        observed_at: "2026-08-26",
        activity_type: "Traditional Strength Training",
        duration_seconds: 4703,
        active_calories: 406,
        exercises: [{
          name: "Bench Press",
          canonicalExerciseId: "bench_press",
          sets: [{ reps: 10, load: 135, unit: "lb" }],
        }],
        provenance: { source_artifact_refs: ["strength.png"] },
      }],
    },
    commitProgress: progressStatus
      ? { canonical_commit: { status: progressStatus, attempts: 1 } }
      : {},
    commitClaim: {
      operationId: "expired-operation",
      status: "in_progress",
      claimedAt: "2026-08-29T06:23:20.000Z",
      leaseExpiresAt: "2026-08-29T06:33:20.000Z",
    },
  };
}
