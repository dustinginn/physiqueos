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
        primaryMuscleGroupId: "biceps",
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
        primary_muscle_group_id: "biceps",
        primary_muscle_groups: ["Biceps"],
        resolutionStatus: "resolved_new_canonical",
      });
    await expect(service.beginCommit(state.review.id)).resolves.toMatchObject({
      status: "committing",
    });
  });

  it.each(["", "Glute Muscles", "removed_group"])(
    "rejects invalid canonical muscle-group selection %j without updating the review",
    async (primaryMuscleGroupId) => {
      const state = reviewFixture();
      const before = structuredClone(state.review);
      const service = createEvidenceReviewService({
        repositories: repositories(state),
      });
      await expect(service.resolveProvisionalExercise(state.review.id, {
        expectedUpdatedAt: state.review.updatedAt,
        provisionalExerciseId: "provisional_1",
        mode: "new",
        definition: {
          canonicalName: "Bicep Curl Machine",
          primaryMuscleGroupId,
        },
        updatedBy: "founder",
      })).rejects.toMatchObject({
        code: "CANONICAL_EXERCISE_MUSCLE_GROUP_INVALID",
      });
      expect(state.review).toEqual(before);
    }
  );

  it("validates the authoritative prepared package without rewriting the pending review", async () => {
    const state = reviewFixture();
    const originalEvidence = structuredClone(state.review.interpretedEvidence);
    const service = createEvidenceReviewService({ repositories: repositories(state) });
    const preparedEvidence = {
      evidence_objects: [{
        id: "training_1",
        evidence_type: "training",
        exercises: [{
          id: "bench_press",
          name: "Bench Press",
          canonicalExerciseId: "bench_press",
          resolutionStatus: "resolved",
          provisionalExercise: null,
          sets: [{ reps: 10, weight: 135 }],
        }],
      }],
    };
    await expect(service.beginCommit(state.review.id, {
      evidencePackage: preparedEvidence,
    })).resolves.toMatchObject({ status: "committing" });
    expect(state.review.interpretedEvidence).toEqual(originalEvidence);
  });
});

describe("EvidenceReviewService execution variant editing", () => {
  it("adds and removes a normalized variant with optimistic concurrency", async () => {
    const state = reviewFixture();
    state.review.interpretedEvidence.evidence_objects[0].exercises[0] = {
      id: "spider_curls",
      name: "Spider Curls",
      canonicalExerciseId: "spider_curl",
      sets: [{ reps: 13, weight: 35 }],
    };
    const service = createEvidenceReviewService({
      repositories: repositories(state),
      now: () => new Date("2026-07-29T20:00:00.000Z"),
    });

    await service.updateTrainingExecutionVariant(state.review.id, {
      evidenceObjectId: "training_1",
      exerciseIndex: 0,
      expectedUpdatedAt: state.review.updatedAt,
      mode: "save",
      rawLabel: " static-holds ",
      updatedBy: "founder",
    });
    expect(state.review.interpretedEvidence.evidence_objects[0].exercises[0]
      .executionVariant).toEqual({
        key: "static_hold",
        label: "Static Hold",
        rawLabel: "static-holds",
      });

    await service.updateTrainingExecutionVariant(state.review.id, {
      evidenceObjectId: "training_1",
      exerciseIndex: 0,
      expectedUpdatedAt: state.review.updatedAt,
      mode: "remove",
      updatedBy: "founder",
    });
    expect(state.review.interpretedEvidence.evidence_objects[0].exercises[0]
      .executionVariant).toBeUndefined();
  });

  it("rejects a stale variant edit without mutation", async () => {
    const state = reviewFixture();
    state.review.interpretedEvidence.evidence_objects[0].exercises[0]
      .canonicalExerciseId = "spider_curl";
    const before = structuredClone(state.review);
    await expect(createEvidenceReviewService({ repositories: repositories(state) })
      .updateTrainingExecutionVariant(state.review.id, {
        evidenceObjectId: "training_1",
        exerciseIndex: 0,
        expectedUpdatedAt: "stale",
        mode: "save",
        rawLabel: "Static Hold",
      })).rejects.toMatchObject({ code: "REVIEW_STALE" });
    expect(state.review).toEqual(before);
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
