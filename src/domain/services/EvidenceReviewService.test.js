import { describe, expect, it } from "vitest";
import { createEvidenceReviewService } from "./EvidenceReviewService";

describe("EvidenceReviewService provisional exercise safety", () => {
  it("blocks beginCommit while a provisional exercise is unresolved", async () => {
    const state = reviewFixture();
    const service = createEvidenceReviewService({ repositories: repositories(state) });
    await expect(service.beginCommit(state.review.id)).rejects.toMatchObject({
      code: "UNRESOLVED_PROVISIONAL_EXERCISE",
    });
    expect(state.review.status).toBe("pending");
  });

  it("resolves a new exercise with optimistic concurrency and permits commit", async () => {
    const state = reviewFixture();
    const service = createEvidenceReviewService({
      repositories: repositories(state),
      now: () => new Date("2026-07-29T20:00:00.000Z"),
    });
    await service.resolveProvisionalExercise(state.review.id, {
      expectedUpdatedAt: state.review.updatedAt,
      provisionalExerciseId: "provisional_1",
      mode: "new",
      definition: {
        canonicalName: "Bicep Curl Machine",
        primaryMuscleGroup: "Biceps",
        movementPattern: "Elbow Flexion",
        equipment: "Machine",
        laterality: "Bilateral",
        aliases: "Machine Bicep Curl",
      },
      updatedBy: "founder",
    });
    expect(state.review.interpretedEvidence.evidence_objects[0].exercises[0])
      .toMatchObject({
        canonicalExerciseId: "bicep_curl_machine",
        resolutionStatus: "resolved_new_canonical",
      });
    await expect(service.beginCommit(state.review.id)).resolves.toMatchObject({
      status: "committing",
    });
  });
});

function repositories(state) {
  return {
    evidenceReviews: {
      getReviewById: async () => structuredClone(state.review),
      updateReview: async (_id, patch) => {
        state.review = { ...state.review, ...structuredClone(patch) };
        return structuredClone(state.review);
      },
      updateReviewIfCurrent: async (_id, expectedUpdatedAt, patch) => {
        if (state.review.updatedAt !== expectedUpdatedAt) throw new Error("stale");
        state.review = {
          ...state.review,
          ...structuredClone(patch),
          updatedAt: "2026-07-29T20:00:00.000Z",
        };
        return structuredClone(state.review);
      },
    },
  };
}

function reviewFixture() {
  return {
    review: {
      id: "review_1",
      userId: "founder",
      status: "pending",
      updatedAt: "2026-07-29T19:00:00.000Z",
      interpretedEvidence: {
        evidence_objects: [{
          id: "training_1",
          evidence_type: "training",
          exercises: [{
            id: "provisional_1",
            name: "Bicep Curl Machine",
            sets: Array.from({ length: 4 }, () => ({ reps: 18, weight: 75 })),
            resolutionStatus: "unresolved_provisional",
            provisionalExercise: {
              provisionalExerciseId: "provisional_1",
              resolutionStatus: "unresolved",
            },
          }],
        }],
      },
    },
  };
}
