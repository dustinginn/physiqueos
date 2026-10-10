import { describe, expect, it } from "vitest";
import { createEvidenceReviewRepository } from "./EvidenceReviewRepository.js";

function review(overrides = {}) {
  return {
    id: "review-1",
    userId: "owner",
    status: "committing",
    updatedAt: "2026-10-10T11:00:00.000Z",
    commitProgress: { canonical_commit: { status: "completed" } },
    commitClaim: {
      status: "in_progress",
      operationId: "crashed-operation",
      leaseExpiresAt: "2026-10-10T11:01:00.000Z",
    },
    ...overrides,
  };
}

describe("evidence review stranded recovery", () => {
  it("releases an expired claim for an idempotent continuation and records the recovery", async () => {
    const repository = createEvidenceReviewRepository([review()]);
    await expect(repository.recoverStrandedEvidenceReviewCommit("review-1", {
      observedAt: "2026-10-10T12:00:00.000Z",
      recoveryId: "recovery-1",
      maximumAutoResumes: 2,
    })).resolves.toMatchObject({
      status: "committing",
      commitClaim: { status: "available" },
      processingReliability: { autoResumeCount: 1, state: "auto_resumed" },
    });
  });

  it("does not steal a live claim", async () => {
    const repository = createEvidenceReviewRepository([review({
      commitClaim: { status: "in_progress", operationId: "live", leaseExpiresAt: "2026-10-10T12:01:00.000Z" },
    })]);
    await expect(repository.recoverStrandedEvidenceReviewCommit("review-1", {
      observedAt: "2026-10-10T12:00:00.000Z",
      recoveryId: "recovery-1",
    })).rejects.toMatchObject({ code: "COMMIT_NOT_STRANDED" });
  });

  it("stops automatic recovery after two attempts and makes the review actionable", async () => {
    const repository = createEvidenceReviewRepository([review({
      commitClaim: { status: "available", operationId: "old", leaseExpiresAt: "2026-10-10T11:01:00.000Z" },
      processingReliability: { autoResumeCount: 2 },
    })]);
    await expect(repository.recoverStrandedEvidenceReviewCommit("review-1", {
      observedAt: "2026-10-10T12:00:00.000Z",
      recoveryId: "recovery-3",
      maximumAutoResumes: 2,
    })).resolves.toMatchObject({
      status: "partially_committed",
      commitClaim: { status: "failed" },
      processingReliability: { state: "operator_attention" },
    });
  });
});
