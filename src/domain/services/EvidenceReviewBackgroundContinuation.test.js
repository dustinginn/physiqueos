import { describe, expect, it } from "vitest";
import { POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator";
import {
  createEvidenceReviewContinuationKey,
  createEvidenceReviewContinuationMessage,
  isEvidenceReviewCanonicalSaveComplete,
  nextEvidenceReviewContinuationStep,
} from "./EvidenceReviewBackgroundContinuation";

function reviewWithCompletedSteps(count) {
  return {
    id: "review-one",
    userId: "founder-one",
    status: "committing",
    confirmation: null,
    commitProgress: Object.fromEntries(
      POST_CONFIRMATION_STEP_ORDER.slice(0, count).map((step) => [
        step,
        { status: "completed", attempts: 1 },
      ])
    ),
  };
}

describe("Evidence Review background continuation contract", () => {
  it("treats canonical commit completion as the durable user boundary", () => {
    expect(isEvidenceReviewCanonicalSaveComplete(reviewWithCompletedSteps(0))).toBe(false);
    expect(isEvidenceReviewCanonicalSaveComplete(reviewWithCompletedSteps(1))).toBe(true);
  });

  it("creates one deterministic checkpoint identity per unfinished step", () => {
    const review = reviewWithCompletedSteps(1);
    expect(nextEvidenceReviewContinuationStep(review)).toBe("compatibility_writes");
    const first = createEvidenceReviewContinuationKey(review);
    review.commitProgress.compatibility_writes = { status: "completed", attempts: 1 };
    const second = createEvidenceReviewContinuationKey(review);
    expect(first).toContain(":compatibility_writes:not_started:0");
    expect(second).toContain(":scheduled_completion:not_started:0");
    expect(second).not.toBe(first);
  });

  it("enqueues a released durable Native claim before canonical work and not an active claim", () => {
    const released = reviewWithCompletedSteps(0);
    released.interpretedEvidence = { package_id: "package-one" };
    released.commitClaim = { status: "available" };
    expect(createEvidenceReviewContinuationMessage(released, {
      createId: () => "message-one",
    })).toMatchObject({
      dedupeKey: expect.stringContaining(":canonical_commit:not_started:0"),
      payload: { reviewId: "review-one" },
    });
    released.commitClaim.status = "in_progress";
    expect(createEvidenceReviewContinuationMessage(released, {
      createId: () => "message-active",
    })).toBeNull();
  });

  it("does not enqueue after final confirmation", () => {
    const confirmed = reviewWithCompletedSteps(POST_CONFIRMATION_STEP_ORDER.length);
    confirmed.status = "confirmed";
    confirmed.confirmation = { confirmedAt: "2026-08-30T01:00:00.000Z" };
    expect(createEvidenceReviewContinuationMessage(confirmed, {
      createId: () => "message-two",
    })).toBeNull();
  });
});
