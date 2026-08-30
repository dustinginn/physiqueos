import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewContinuationWorkerHandler } from "./EvidenceReviewContinuationWorker";

describe("Evidence Review continuation worker", () => {
  it("passes one exact durable checkpoint to the source-owned continuation", async () => {
    const continueReview = vi.fn(async () => ({ state: "processing" }));
    const handler = createEvidenceReviewContinuationWorkerHandler({ continueReview });
    await expect(handler({
      messageId: "message-one",
      payloadVersion: "1",
      payload: { reviewId: "review-one", continuationKey: "review-one:canonical_commit:analysis:not_started:0" },
    })).resolves.toEqual({ state: "processing" });
    expect(continueReview).toHaveBeenCalledWith({
      messageId: "message-one",
      reviewId: "review-one",
      continuationKey: "review-one:canonical_commit:analysis:not_started:0",
    });
  });

  it("fails closed for unsupported or incomplete messages", async () => {
    const handler = createEvidenceReviewContinuationWorkerHandler({ continueReview: vi.fn() });
    await expect(handler({ messageId: "one", payloadVersion: "2", payload: {} }))
      .rejects.toMatchObject({ code: "EVIDENCE_REVIEW_CONTINUATION_VERSION_UNSUPPORTED" });
    await expect(handler({ messageId: "one", payloadVersion: "1", payload: {} }))
      .rejects.toMatchObject({ code: "EVIDENCE_REVIEW_CONTINUATION_INVALID" });
  });
});
