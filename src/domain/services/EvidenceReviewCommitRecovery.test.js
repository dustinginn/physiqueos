import { describe, expect, it } from "vitest";
import { createEvidenceReviewRepository } from "../../data/repositories/EvidenceReviewRepository";
import { createEvidenceReviewService } from "./EvidenceReviewService";
import { POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator";

describe("Evidence Review confirmation recovery", () => {
  it("claims a legitimate stranded review once and preserves completed progress", async () => {
    const review = incidentReview();
    const repository = createEvidenceReviewRepository([review]);
    const clock = { value: new Date("2026-08-28T21:30:00.000Z") };
    const service = createEvidenceReviewService({
      repositories: { evidenceReviews: repository },
      now: () => clock.value,
    });

    await expect(service.beginCommit(review.id, { operationId: "recovery-one" }))
      .resolves.toMatchObject({
        status: "committing",
        commitClaim: { operationId: "recovery-one", status: "in_progress" },
      });
    await expect(service.beginCommit(review.id, { operationId: "recovery-two" }))
      .rejects.toMatchObject({ code: "COMMIT_IN_PROGRESS" });
    expect(Object.keys(review.commitProgress)).toEqual(POST_CONFIRMATION_STEP_ORDER.slice(0, 5));

    await service.recordCommitProgress(review.id, "goal_evaluation", {
      status: "completed",
      result: { status: "completed" },
    }, { operationId: "recovery-one" });
    await service.pauseCommit(review.id, { operationId: "recovery-one" });
    clock.value = new Date("2026-08-28T21:31:00.000Z");
    await expect(service.beginCommit(review.id, { operationId: "recovery-two" }))
      .resolves.toMatchObject({
        commitProgress: { goal_evaluation: { status: "completed" } },
        commitClaim: { operationId: "recovery-two", status: "in_progress" },
      });
  });

  it("rejects a committing review without a valid contiguous durable prefix", async () => {
    const review = incidentReview();
    review.commitProgress = {
      canonical_commit: { status: "completed" },
      analysis: { status: "completed" },
    };
    const service = createEvidenceReviewService({
      repositories: { evidenceReviews: createEvidenceReviewRepository([review]) },
    });
    await expect(service.beginCommit(review.id, { operationId: "invalid" }))
      .rejects.toMatchObject({ code: "COMMIT_PROGRESS_INVALID" });
  });

  it("allows restart recovery after an abandoned claim expires and completes exactly once", async () => {
    const review = incidentReview();
    review.commitClaim = {
      operationId: "crashed-process",
      status: "in_progress",
      claimedAt: "2026-08-28T21:00:00.000Z",
      leaseExpiresAt: "2026-08-28T21:02:00.000Z",
    };
    const repository = createEvidenceReviewRepository([review]);
    const service = createEvidenceReviewService({
      repositories: { evidenceReviews: repository },
      now: () => new Date("2026-08-28T21:30:00.000Z"),
    });
    await service.beginCommit(review.id, { operationId: "replacement" });
    for (const step of POST_CONFIRMATION_STEP_ORDER.slice(5)) {
      await service.recordCommitProgress(review.id, step, {
        status: "completed",
        result: { status: "completed" },
      }, { operationId: "replacement" });
    }
    await expect(service.confirm(review.id, {
      operationId: "replacement",
      confirmedBy: "founder",
    })).resolves.toMatchObject({ status: "confirmed" });
    await expect(service.beginCommit(review.id, { operationId: "duplicate" }))
      .rejects.toThrow("cannot be committed");
  });

  it("turns a handled resumed-step failure into a recoverable partial state", async () => {
    const review = incidentReview();
    const repository = createEvidenceReviewRepository([review]);
    const service = createEvidenceReviewService({
      repositories: { evidenceReviews: repository },
      now: () => new Date("2026-08-28T21:30:00.000Z"),
    });
    await service.beginCommit(review.id, { operationId: "failure" });
    await service.recordCommitProgress(review.id, "goal_evaluation", {
      status: "failed",
      error: "temporary",
      retryable: true,
    }, { operationId: "failure" });
    await expect(service.failCommit(review.id, new Error("temporary"), {
      operationId: "failure",
    })).resolves.toMatchObject({
      status: "partially_committed",
      commitClaim: { status: "failed" },
      commitProgress: { goal_evaluation: { status: "failed" } },
    });
  });
});

function incidentReview() {
  return {
    id: "evidence_review_20260828202245970",
    userId: "founder",
    status: "committing",
    updatedAt: "2026-08-28T21:16:00.000Z",
    interpretedEvidence: {
      package_id: "training_logger_submission_training_logger_92945e07-d3d2-42f2-b34a-3220116068ee",
      evidence_objects: [{ id: "training", evidence_type: "training", exercises: [] }],
    },
    confirmation: null,
    commitProgress: Object.fromEntries(
      POST_CONFIRMATION_STEP_ORDER.slice(0, 5).map((step) => [
        step,
        { status: "completed", attempts: 1, result: { status: "completed" } },
      ])
    ),
  };
}
