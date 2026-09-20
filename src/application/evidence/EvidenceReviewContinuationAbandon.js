// Deliberately NOT part of the "use server" actions module: it is a worker-side
// operation, and every export of a server-actions file becomes a callable action.

// Called by the worker when a continuation message is dead-lettered, either
// because its handler kept failing or because the worker process kept dying
// while it held the message. Without this the review would stay `committing`
// (and Native would keep saying "Processing") with no message left to advance
// it. Failing the claim turns the review into `partially_committed`, which is
// observable and resumes through the existing idempotent path: completed steps
// are skipped and the first incomplete step runs again.
//
// Only the operation that owns the active claim can fail it. If the review has
// already moved on (another message advanced it, it was confirmed, or the claim
// was released) the claim assertion rejects and this is a no-op, so a stale
// dead-letter can never fail a healthy review.
export async function abandonEvidenceReviewContinuation({
  repositories,
  reviewId,
  messageId,
  errorCode = "OUTBOX_DEAD_LETTERED",
  now = () => new Date(),
}) {
  const operationId = `evidence-review-background:${String(messageId ?? "")}`;
  try {
    await repositories.evidenceReviews.failEvidenceReviewCommit(String(reviewId ?? ""), {
      operationId,
      error: `Evidence review processing stopped after repeated interruptions (${errorCode}). ` +
        "It resumes from the first incomplete step without repeating completed work.",
      failedAt: now().toISOString(),
    });
    return Object.freeze({ state: "failed_observable", reviewId });
  } catch (error) {
    if (["COMMIT_CLAIM_LOST", "REVIEW_NOT_COMMITTING", "REVIEW_NOT_FOUND"].includes(error?.code)) {
      return Object.freeze({ state: "not_applicable", reviewId, code: error.code });
    }
    throw error;
  }
}
