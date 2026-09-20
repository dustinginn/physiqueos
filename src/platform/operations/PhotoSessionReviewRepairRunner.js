import { assertEvidenceCanonicalCommitReady } from "../../domain/services/EvidenceCanonicalCommitReadinessService.js";
import { planPhotoSessionReviewRepair } from "../../domain/services/PhotoSessionReviewRepair.js";

/**
 * Loads exactly the records the plan needs, plans the repair, proves the
 * repaired review passes the confirmation readiness gate, and (only in
 * `apply` mode) persists it with the review's own version as the optimistic
 * concurrency fence. `records` is the application's canonical record store, so
 * the write has exactly the semantics of every other canonical write and can
 * never overwrite a review that changed after it was inspected.
 *
 * Dry-run performs no write of any kind. Re-running after a successful apply
 * is an idempotent no-op that reports `already_applied`.
 */
export async function runPhotoSessionReviewRepair({ records, authorization, apply = false, now = () => new Date() } = {}) {
  const { ownerUserId, reviewId } = authorization;
  // Apply follows the canonical write discipline: take the owner's runtime
  // lock before reading so nothing can interleave, and advance the runtime
  // revision after a write so stale composite editors are fenced exactly as
  // they are for every other canonical mutation.
  const runtimeBefore = apply ? await records.getRuntimeMetadata({ ownerUserId, lock: true }) : null;
  const mutationsBefore = apply ? records.getMutationCount() : 0;
  const review = await records.get({ ownerUserId, collection: "evidenceReviews", recordId: reviewId });
  const goals = await records.list({ ownerUserId, collection: "goals" });
  const executionItems = await records.list({ ownerUserId, collection: "executionItems" });
  const plan = planPhotoSessionReviewRepair({ review, authorization, goals, executionItems, now });
  if (plan.outcome === "already_applied") {
    return Object.freeze({ outcome: "already_applied", reviewId, version: Number(review.version), changedPaths: [] });
  }
  assertEvidenceCanonicalCommitReady(plan.updatedReview.interpretedEvidence, { itemDecisions: plan.updatedReview.itemDecisions ?? {} });
  const summary = { reviewId, versionBefore: Number(review.version), changedPaths: plan.changedPaths, readinessAfterRepair: "passes", statusAfterRepair: plan.updatedReview.status };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });
  const saved = await records.put({
    ownerUserId,
    collection: "evidenceReviews",
    recordId: reviewId,
    payload: plan.updatedReview,
    expectedVersion: Number(review.version),
  });
  if (runtimeBefore && records.getMutationCount() > mutationsBefore) {
    const runtimeAfter = await records.getRuntimeMetadata({ ownerUserId });
    if (runtimeAfter.revision === runtimeBefore.revision) {
      await records.advanceRuntimeMetadata({ ownerUserId, expectedRevision: runtimeBefore.revision, commandId: authorization.repairId, at: now() });
    }
  }
  return Object.freeze({ outcome: "applied", ...summary, versionAfter: Number(saved.version) });
}
