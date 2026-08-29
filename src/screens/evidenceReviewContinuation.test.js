import { describe, expect, it, vi } from "vitest";
import { POST_CONFIRMATION_STEP_ORDER } from "../domain/services/PostConfirmationOrchestrator";
import {
  createEvidenceReviewContinuationKey,
  submitEvidenceReviewContinuation,
} from "./evidenceReviewContinuation";

function completedProgress(steps) {
  return Object.fromEntries(
    steps.map((step) => [step, { status: "completed", attempts: 1 }])
  );
}

describe("Evidence Review client continuation checkpoints", () => {
  it("submits each durable checkpoint once without requiring a component remount", () => {
    const form = { requestSubmit: vi.fn() };
    const submittedCheckpointRef = { current: null };
    const review = {
      id: "review_1",
      status: "committing",
      commitProgress: completedProgress(POST_CONFIRMATION_STEP_ORDER.slice(0, 3)),
    };

    const analysisKey = createEvidenceReviewContinuationKey(review);
    expect(analysisKey).toContain(":analysis:not_started:0");
    expect(submitEvidenceReviewContinuation({
      continuationKey: analysisKey,
      form,
      submittedCheckpointRef,
    })).toBe(true);
    expect(submitEvidenceReviewContinuation({
      continuationKey: analysisKey,
      form,
      submittedCheckpointRef,
    })).toBe(false);

    review.commitProgress.analysis = { status: "completed", attempts: 1 };
    const trainingEventsKey = createEvidenceReviewContinuationKey(review);
    expect(trainingEventsKey).toContain(":training_performance_events:not_started:0");
    expect(trainingEventsKey).not.toBe(analysisKey);
    expect(submitEvidenceReviewContinuation({
      continuationKey: trainingEventsKey,
      form,
      submittedCheckpointRef,
    })).toBe(true);
    expect(form.requestSubmit).toHaveBeenCalledTimes(2);
  });

  it("keeps completed steps out of the continuation key and advances to final confirmation", () => {
    const progress = completedProgress(POST_CONFIRMATION_STEP_ORDER);
    const review = {
      id: "review_2",
      status: "committing",
      commitProgress: progress,
    };

    const key = createEvidenceReviewContinuationKey(review);
    expect(key).toContain(":final_confirmation:not_started:0");

    review.status = "confirmed";
    review.confirmation = { confirmedAt: "2026-08-29T22:30:00.000Z" };
    expect(createEvidenceReviewContinuationKey(review)).toBeNull();
  });

  it("uses step status and attempts to distinguish source-owned recovery checkpoints", () => {
    const review = {
      id: "review_3",
      status: "committing",
      commitProgress: {
        ...completedProgress(POST_CONFIRMATION_STEP_ORDER.slice(0, 4)),
        training_performance_events: { status: "started", attempts: 1 },
      },
    };

    const startedKey = createEvidenceReviewContinuationKey(review);
    review.commitProgress.training_performance_events = { status: "started", attempts: 2 };
    const recoveredKey = createEvidenceReviewContinuationKey(review);

    expect(startedKey).toContain(":training_performance_events:started:1");
    expect(recoveredKey).toContain(":training_performance_events:started:2");
    expect(recoveredKey).not.toBe(startedKey);
  });

  it("does not submit an absent or already-submitted checkpoint", () => {
    const form = { requestSubmit: vi.fn() };
    const submittedCheckpointRef = { current: "review_4:key" };

    expect(submitEvidenceReviewContinuation({
      continuationKey: null,
      form,
      submittedCheckpointRef,
    })).toBe(false);
    expect(submitEvidenceReviewContinuation({
      continuationKey: "review_4:key",
      form,
      submittedCheckpointRef,
    })).toBe(false);
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });
});
