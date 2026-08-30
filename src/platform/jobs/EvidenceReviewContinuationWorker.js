import {
  EVIDENCE_REVIEW_CONTINUATION_PAYLOAD_VERSION,
} from "../../domain/services/EvidenceReviewBackgroundContinuation.js";
import { WorkerMessageError } from "./DurableOutboxWorker.js";

export function createEvidenceReviewContinuationWorkerHandler({ continueReview }) {
  if (typeof continueReview !== "function") {
    throw new Error("Evidence Review continuation worker requires a continuation function.");
  }
  return async ({ messageId, payloadVersion, payload }) => {
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
    return continueReview({ reviewId, continuationKey, messageId });
  };
}
