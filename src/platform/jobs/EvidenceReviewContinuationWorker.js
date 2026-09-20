import {
  EVIDENCE_REVIEW_CONTINUATION_PAYLOAD_VERSION,
} from "../../domain/services/EvidenceReviewBackgroundContinuation.js";
import { WorkerMessageError } from "./DurableOutboxWorker.js";

export function createEvidenceReviewContinuationWorkerHandler({ continueReview, abandonReview = null }) {
  if (typeof continueReview !== "function") {
    throw new Error("Evidence Review continuation worker requires a continuation function.");
  }
  const handler = async ({ messageId, payloadVersion, payload, assertLease = null }) => {
    if (payloadVersion !== EVIDENCE_REVIEW_CONTINUATION_PAYLOAD_VERSION) {
      throw new WorkerMessageError(
        "EVIDENCE_REVIEW_CONTINUATION_VERSION_UNSUPPORTED",
        "Evidence Review continuation payload version is unsupported."
      );
    }
    const reviewId = String(payload?.reviewId ?? "").trim();
    const continuationKey = String(payload?.continuationKey ?? "").trim();
    if (!reviewId || !continuationKey) {
      throw new WorkerMessageError(
        "EVIDENCE_REVIEW_CONTINUATION_INVALID",
        "Evidence Review continuation payload is incomplete."
      );
    }
    return continueReview({ reviewId, continuationKey, messageId, assertLease });
  };
  // Invoked by the worker after this message is dead-lettered so the review does
  // not stay `committing` with no message left to advance it.
  handler.onDead = async ({ messageId, payload, errorCode }) => {
    if (typeof abandonReview !== "function") return null;
    const reviewId = String(payload?.reviewId ?? "").trim();
    if (!reviewId) return null;
    return abandonReview({ reviewId, messageId, errorCode });
  };
  return handler;
}
