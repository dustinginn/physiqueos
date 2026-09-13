import { describe, expect, it, vi } from "vitest";
import {
  createPostConfirmationOrchestrator,
  POST_CONFIRMATION_STEP_ORDER,
} from "./PostConfirmationOrchestrator.js";
import {
  createEvidenceReviewContinuationKey,
  nextEvidenceReviewContinuationStep,
} from "./EvidenceReviewBackgroundContinuation.js";

// Regression coverage for the real production failure of
// evidence_review_44462ABB3969473DA82FBF2B46A504EF (Sep 12 2026 DEXA):
//
//   canonical_commit     -> completed (1 attempt)
//   compatibility_writes -> failed    (3 attempts)
//       "Cannot read properties of null (reading 'find')"
//   seven later steps    -> never ran
//
// canonical_commit ran inline in the web process during the Founder's
// Confirm and assigned the handler closure's `canonical`. The continuation
// then ran in a FRESH worker process where `canonical` is null and
// canonical_commit is skipped as already-completed, so
// commitCompatibilityRepositories' DEXA branch dereferenced null. These
// tests pin the resume semantics the repair depends on.

function progressFrom(completedSteps, failedStep = null, attempts = 0) {
  const progress = {};
  for (const step of completedSteps) {
    progress[step] = { status: "completed", attempts: 1, result: { status: "completed" } };
  }
  if (failedStep) {
    progress[failedStep] = { status: "failed", attempts, error: "Cannot read properties of null (reading 'find')" };
  }
  return progress;
}

/// The exact production commitProgress at the moment of the forensic read.
const PRODUCTION_PROGRESS = progressFrom(["canonical_commit"], "compatibility_writes", 3);

function trackingHandlers(calls, { failing = null } = {}) {
  return Object.fromEntries(POST_CONFIRMATION_STEP_ORDER.map((step) => [
    step,
    async () => {
      calls.push(step);
      if (step === failing) throw new Error("Cannot read properties of null (reading 'find')");
      return { status: "completed" };
    },
  ]));
}

describe("post-confirmation resume after a partially_committed DEXA", () => {
  it("resumes at the first incomplete step and never replays canonical_commit", async () => {
    const calls = [];
    const reviewService = { recordCommitProgress: vi.fn(async () => undefined) };
    const orchestrator = createPostConfirmationOrchestrator({ reviewService, handlers: trackingHandlers(calls) });

    const outcome = await orchestrator.run({ reviewId: "r1", commitProgress: PRODUCTION_PROGRESS });

    expect(calls[0]).toBe("compatibility_writes");
    expect(calls).not.toContain("canonical_commit");
    expect(outcome.skippedSteps).toContain("canonical_commit");
    expect(outcome.complete).toBe(true);
  });

  it("runs every remaining step exactly once — no duplicate downstream work or briefing", async () => {
    const calls = [];
    const reviewService = { recordCommitProgress: vi.fn(async () => undefined) };
    const orchestrator = createPostConfirmationOrchestrator({ reviewService, handlers: trackingHandlers(calls) });

    await orchestrator.run({ reviewId: "r1", commitProgress: PRODUCTION_PROGRESS });

    const expected = POST_CONFIRMATION_STEP_ORDER.filter((step) => step !== "canonical_commit");
    expect(calls).toEqual(expected);
    for (const step of expected) {
      expect(calls.filter((c) => c === step)).toHaveLength(1);
    }
    // The briefing is generated exactly once, and only on this resume.
    expect(calls.filter((c) => c === "briefing")).toHaveLength(1);
  });

  it("a second resume after success is a no-op — every step is skipped", async () => {
    const calls = [];
    const reviewService = { recordCommitProgress: vi.fn(async () => undefined) };
    const orchestrator = createPostConfirmationOrchestrator({ reviewService, handlers: trackingHandlers(calls) });

    const allComplete = progressFrom(POST_CONFIRMATION_STEP_ORDER);
    const outcome = await orchestrator.run({ reviewId: "r1", commitProgress: allComplete });

    expect(calls).toEqual([]);
    expect(outcome.complete).toBe(true);
    expect(outcome.skippedSteps).toEqual(POST_CONFIRMATION_STEP_ORDER);
  });

  it("reproduces the production failure shape: a throwing compatibility_writes stops before every later step", async () => {
    const calls = [];
    const reviewService = { recordCommitProgress: vi.fn(async () => undefined) };
    const orchestrator = createPostConfirmationOrchestrator({
      reviewService,
      handlers: trackingHandlers(calls, { failing: "compatibility_writes" }),
    });

    await expect(orchestrator.run({ reviewId: "r1", commitProgress: progressFrom(["canonical_commit"]) }))
      .rejects.toThrow(/compatibility_writes failed/);

    expect(calls).toEqual(["compatibility_writes"]);
    for (const later of ["scheduled_completion", "analysis", "training_performance_events", "goal_evaluation", "event_eligibility", "briefing", "home_refresh"]) {
      expect(calls).not.toContain(later);
    }
  });

  it("identifies compatibility_writes as the resume point for the exact production progress", () => {
    const review = { id: "evidence_review_44462ABB3969473DA82FBF2B46A504EF", commitProgress: PRODUCTION_PROGRESS };
    expect(nextEvidenceReviewContinuationStep(review)).toBe("compatibility_writes");
  });

  it("the continuation key changes once attempts advance, so a replacement continuation is not deduplicated away", () => {
    const id = "evidence_review_44462ABB3969473DA82FBF2B46A504EF";
    const atEnqueue = createEvidenceReviewContinuationKey({ id, commitProgress: progressFrom(["canonical_commit"]) });
    const afterThreeFailures = createEvidenceReviewContinuationKey({ id, commitProgress: PRODUCTION_PROGRESS });

    expect(atEnqueue).not.toBeNull();
    expect(afterThreeFailures).not.toBeNull();
    expect(afterThreeFailures).not.toBe(atEnqueue);
  });
});
