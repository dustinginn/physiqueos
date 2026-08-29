import { POST_CONFIRMATION_STEP_ORDER } from "../domain/services/PostConfirmationOrchestrator";

export function createEvidenceReviewContinuationKey(review) {
  if (!review || review.status !== "committing" || review.confirmation) return null;

  const progress = review.commitProgress ?? {};
  const nextStep = POST_CONFIRMATION_STEP_ORDER.find(
    (step) => progress[step]?.status !== "completed"
  ) ?? "final_confirmation";
  const nextProgress = progress[nextStep] ?? {};
  const completedSteps = POST_CONFIRMATION_STEP_ORDER.filter(
    (step) => progress[step]?.status === "completed"
  );

  return [
    review.id,
    completedSteps.join(","),
    nextStep,
    nextProgress.status ?? "not_started",
    nextProgress.attempts ?? 0,
  ].join(":");
}

export function submitEvidenceReviewContinuation({
  continuationKey,
  form,
  submittedCheckpointRef,
}) {
  if (
    !continuationKey ||
    submittedCheckpointRef.current === continuationKey
  ) {
    return false;
  }

  submittedCheckpointRef.current = continuationKey;
  form?.requestSubmit();
  return true;
}
