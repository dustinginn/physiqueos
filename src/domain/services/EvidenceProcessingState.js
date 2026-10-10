import { POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator.js";

export const EvidenceProcessingState = Object.freeze({
  ACCEPTED: "accepted",
  QUEUED: "queued",
  PROCESSING: "processing",
  RETRYING: "retrying",
  READY: "ready",
  FAILED: "failed",
});

export function projectEvidenceProcessingState(review) {
  const progress = review?.commitProgress ?? {};
  const completedSteps = POST_CONFIRMATION_STEP_ORDER.filter(
    (step) => progress[step]?.status === "completed"
  );
  const nextStep = POST_CONFIRMATION_STEP_ORDER.find(
    (step) => progress[step]?.status !== "completed"
  ) ?? null;
  const failedStep = POST_CONFIRMATION_STEP_ORDER.find(
    (step) => progress[step]?.status === "failed"
  ) ?? null;
  let state;
  if (review?.status === "confirmed") state = EvidenceProcessingState.READY;
  else if (["commit_failed", "partially_committed"].includes(review?.status)) state = EvidenceProcessingState.FAILED;
  else if (review?.status !== "committing") state = EvidenceProcessingState.READY;
  else if (failedStep || review.commitClaim?.status === "failed") state = EvidenceProcessingState.RETRYING;
  else if (review.commitClaim?.status === "available") state = EvidenceProcessingState.QUEUED;
  else if (review.commitClaim?.status === "in_progress") state = EvidenceProcessingState.PROCESSING;
  else state = EvidenceProcessingState.ACCEPTED;

  return Object.freeze({
    state,
    completedSteps: completedSteps.length,
    totalSteps: POST_CONFIRMATION_STEP_ORDER.length,
    nextStep,
    canonicalStateDurable: progress.canonical_commit?.status === "completed",
    actionRequired: state === EvidenceProcessingState.FAILED,
    message: messageFor(state, completedSteps.length, POST_CONFIRMATION_STEP_ORDER.length),
  });
}

function messageFor(state, completed, total) {
  if (state === EvidenceProcessingState.ACCEPTED) return "Confirmation saved · Waiting for secure processing";
  if (state === EvidenceProcessingState.QUEUED) return "Confirmation saved · Queued for secure processing";
  if (state === EvidenceProcessingState.PROCESSING) return `Confirmation saved · Finishing ${completed} of ${total}`;
  if (state === EvidenceProcessingState.RETRYING) return "Confirmation saved · Retrying safely";
  if (state === EvidenceProcessingState.FAILED) return "Processing needs attention · Your confirmation is saved";
  return "Ready";
}
