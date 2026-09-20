import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewContinuationWorkerHandler } from "./EvidenceReviewContinuationWorker";

describe("Evidence Review continuation worker", () => {
  it("passes one exact durable checkpoint to the source-owned continuation", async () => {
    const continueReview = vi.fn(async () => ({ state: "processing" }));
    const handler = createEvidenceReviewContinuationWorkerHandler({ continueReview });
    const assertLease = vi.fn();
    await expect(handler({
      messageId: "message-one",
      payloadVersion: "1",
      payload: { reviewId: "review-one", continuationKey: "review-one:canonical_commit:analysis:not_started:0" },
      assertLease,
    })).resolves.toEqual({ state: "processing" });
    expect(continueReview).toHaveBeenCalledWith({
      messageId: "message-one",
      reviewId: "review-one",
      continuationKey: "review-one:canonical_commit:analysis:not_started:0",
      assertLease,
    });
  });

  it("tells the review owner when its message is dead-lettered, and only then", async () => {
    const abandonReview = vi.fn(async () => ({ state: "failed_observable" }));
    const handler = createEvidenceReviewContinuationWorkerHandler({ continueReview: vi.fn(), abandonReview });
    await handler.onDead({
      messageId: "message-one",
      payload: { reviewId: "review-one", continuationKey: "k" },
      errorCode: "OUTBOX_ATTEMPTS_EXHAUSTED",
    });
    expect(abandonReview).toHaveBeenCalledWith({
      reviewId: "review-one", messageId: "message-one", errorCode: "OUTBOX_ATTEMPTS_EXHAUSTED",
    });
    await expect(handler.onDead({ messageId: "m", payload: {}, errorCode: "X" })).resolves.toBeNull();
    expect(abandonReview).toHaveBeenCalledOnce();
  });

  it("has no dead-letter behavior unless an owner is wired in", async () => {
    const handler = createEvidenceReviewContinuationWorkerHandler({ continueReview: vi.fn() });
    await expect(handler.onDead({ messageId: "m", payload: { reviewId: "r" }, errorCode: "X" })).resolves.toBeNull();
  });

  it("fails closed for unsupported or incomplete messages", async () => {
    const handler = createEvidenceReviewContinuationWorkerHandler({ continueReview: vi.fn() });
    await expect(handler({ messageId: "one", payloadVersion: "2", payload: {} }))
      .rejects.toMatchObject({ code: "EVIDENCE_REVIEW_CONTINUATION_VERSION_UNSUPPORTED" });
    await expect(handler({ messageId: "one", payloadVersion: "1", payload: {} }))
      .rejects.toMatchObject({ code: "EVIDENCE_REVIEW_CONTINUATION_INVALID" });
  });
});
