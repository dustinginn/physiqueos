import { POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator.js";

export const EVIDENCE_REVIEW_CONTINUATION_TOPIC = "evidence.review.continue";
export const EVIDENCE_REVIEW_CONTINUATION_PAYLOAD_VERSION = "1";

export function isEvidenceReviewCanonicalSaveComplete(review) {
  return review?.commitProgress?.canonical_commit?.status === "completed";
}

export function nextEvidenceReviewContinuationStep(review) {
  if (!review || review.confirmation || review.status === "confirmed") return null;
  return POST_CONFIRMATION_STEP_ORDER.find(
    (step) => review.commitProgress?.[step]?.status !== "completed"
  ) ?? "final_confirmation";
}

export function createEvidenceReviewContinuationKey(review) {
  if (!isEvidenceReviewCanonicalSaveComplete(review)) return null;
  const nextStep = nextEvidenceReviewContinuationStep(review);
  if (!nextStep) return null;
  const progress = review.commitProgress ?? {};
  const checkpoint = progress[nextStep] ?? {};
  const completedSteps = POST_CONFIRMATION_STEP_ORDER.filter(
    (step) => progress[step]?.status === "completed"
  );
  return [
    review.id,
    completedSteps.join(","),
    nextStep,
    checkpoint.status ?? "not_started",
    checkpoint.attempts ?? 0,
  ].join(":");
}

export function createEvidenceReviewContinuationMessage(review, { createId }) {
  const continuationKey = createEvidenceReviewContinuationKey(review);
  if (!continuationKey) return null;
  return Object.freeze({
    id: createId(),
    userId: review.userId,
    operationId: null,
    topic: EVIDENCE_REVIEW_CONTINUATION_TOPIC,
    dedupeKey: continuationKey,
    payloadVersion: EVIDENCE_REVIEW_CONTINUATION_PAYLOAD_VERSION,
    payload: Object.freeze({ reviewId: review.id, continuationKey }),
  });
}
