import { describe, expect, it, vi } from "vitest";
import { createConfirmedPhotoEventRecoveryService } from "./ConfirmedPhotoEventRecoveryService";

function fixture() {
  const review = {
    id: "review",
    userId: "user",
    status: "partially_committed",
    interpretedEvidence: {
      package_id: "package",
      evidence_objects: [{ evidence_type: "photo_session", observed_at: "2026-07-18" }],
    },
    commitProgress: Object.fromEntries(
      ["canonical_commit", "compatibility_writes", "scheduled_completion", "analysis", "goal_evaluation", "event_eligibility"]
        .map((step) => [step, { status: "completed" }])
    ),
  };
  const state = { review };
  const repositories = {
    evidenceReviews: {
      getReviewById: vi.fn(async () => state.review),
      updateReview: vi.fn(async (_id, patch) => (state.review = { ...state.review, ...patch })),
    },
    dailyBriefings: { listDailyBriefings: vi.fn(async () => []) },
  };
  return { repositories, state };
}

describe("ConfirmedPhotoEventRecoveryService", () => {
  it("blocks before briefing when a prerequisite is incomplete", async () => {
    const { repositories, state } = fixture();
    state.review.commitProgress.analysis = { status: "failed" };
    const result = await createConfirmedPhotoEventRecoveryService({ repositories }).inspect({ reviewId: "review", userId: "user" });
    expect(result).toMatchObject({ status: "blocked", code: "prerequisite_incomplete" });
  });

  it("identifies briefing as the first incomplete stage without writing", async () => {
    const { repositories } = fixture();
    const result = await createConfirmedPhotoEventRecoveryService({ repositories }).inspect({ reviewId: "review", userId: "user" });
    expect(result).toMatchObject({
      status: "ready",
      firstIncompleteStep: "briefing",
      sessionId: "photo_session_user_2026-07-18",
    });
    expect(repositories.evidenceReviews.updateReview).not.toHaveBeenCalled();
  });
});
