import { describe, expect, it, vi } from "vitest";
import { createConfirmedPhotoEventRecoveryService } from "./ConfirmedPhotoEventRecoveryService";

function fixture() {
  const review = {
    id: "review",
    userId: "user",
    status: "partially_committed",
    interpretedEvidence: {
      package_id: "package",
      evidence_objects: [{ id: "interpreted-photo-session", evidence_type: "photo_session", observed_at: "2026-07-18" }],
    },
    commitProgress: Object.fromEntries(
      ["canonical_commit", "compatibility_writes", "scheduled_completion", "analysis", "goal_evaluation", "event_eligibility"]
        .map((step) => [step, { status: "completed" }])
    ),
  };
  const state = { review };
  const repositories = {
    canonicalEvidence: {
      listCanonicalEvidenceObjects: vi.fn(async () => [{
        canonicalId: "canonical-session-without-date-shaped-id",
        evidence_type: "photo_session",
        payload: { sessionId: "canonical-session-without-date-shaped-id" },
        provenance: {
          evidence_package_ids: ["package"],
          contributing_evidence_object_ids: ["interpreted-photo-session"],
        },
        quality: { status: "active" },
      }]),
    },
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
      sessionId: "canonical-session-without-date-shaped-id",
    });
    expect(repositories.evidenceReviews.updateReview).not.toHaveBeenCalled();
  });

  it("repairs a missing artifact even when the confirmed review markers are complete", async () => {
    const { repositories, state } = fixture();
    state.review = {
      ...state.review,
      status: "confirmed",
      commitProgress: {
        ...state.review.commitProgress,
        briefing: { status: "completed", attempts: 1 },
        home_refresh: { status: "completed", attempts: 1 },
      },
    };

    const result = await createConfirmedPhotoEventRecoveryService({
      repositories,
    }).inspect({ reviewId: "review", userId: "user" });

    expect(result).toMatchObject({
      status: "ready",
      existingArtifact: null,
      firstIncompleteStep: "briefing",
      artifactId:
        "event_briefing_progress_photo_canonical-session-without-date-shaped-id",
    });
  });
});
