import { describe, expect, it } from "vitest";
import { createEvidenceReviewService } from "./EvidenceReviewService";
import { canonicalJson } from "../../contracts/v1/canonicalJson";
import { listCanonicalTrainingExerciseIdentities } from "../models/trainingExerciseIdentity";

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

  it("persists an existing built-in mapping once and rejects a stale replay", async () => {
    const state = reviewFixture();
    const expectedUpdatedAt = state.review.updatedAt;
    const canonicalBefore = structuredClone(
      listCanonicalTrainingExerciseIdentities().find(
        (candidate) => candidate.id === "lateral_raise_machine"
      )
    );
    const service = createEvidenceReviewService({
      repositories: repositories(state),
      now: () => new Date("2026-07-29T20:00:00.000Z"),
    });

    await service.resolveProvisionalExercise(state.review.id, {
      expectedUpdatedAt,
      provisionalExerciseId: "provisional_1",
      mode: "existing",
      canonicalExerciseId: "lateral_raise_machine",
      updatedBy: "founder",
    });

    const exercise = state.review.interpretedEvidence.evidence_objects[0]
      .exercises[0];
    expect(exercise).toMatchObject({
      canonicalExerciseId: "lateral_raise_machine",
      laterality: null,
      name: "Lateral Raises Machine",
      resolutionStatus: "resolved_existing_canonical",
    });
    expect(() => canonicalJson(state.review)).not.toThrow();
    expect(state.reviewUpdateCount).toBe(1);
    expect(exercise.provisionalExercise.confirmedDefinition).toBeNull();
    expect(canonicalBefore.aliases).not.toContain("Lateral Machine Raises");
    expect(listCanonicalTrainingExerciseIdentities().find(
      (candidate) => candidate.id === "lateral_raise_machine"
    )).toEqual(canonicalBefore);

    await expect(service.resolveProvisionalExercise(state.review.id, {
      expectedUpdatedAt,
      provisionalExerciseId: "provisional_1",
      mode: "existing",
      canonicalExerciseId: "lateral_raise_machine",
      updatedBy: "founder",
    })).rejects.toMatchObject({ code: "REVIEW_STALE" });
    expect(state.reviewUpdateCount).toBe(1);
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

  it("persists the authoritative prepared package before resumable work begins", async () => {
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
    expect(state.review.interpretedEvidence).toEqual(preparedEvidence);
    expect(state.review.interpretedEvidence).not.toEqual(originalEvidence);
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

  it("blocks commit until a malformed Superset is resolved or removed", async () => {
    const state = relationshipReviewFixture();
    const service = createEvidenceReviewService({ repositories: repositories(state) });

    await expect(service.beginCommit(state.review.id)).rejects.toMatchObject({
      code: "TRAINING_STRUCTURE_REVIEW_REQUIRED",
    });
    expect(state.review.status).toBe("pending");
  });

  it("saves an ordered Superset correction and clears its review blocker", async () => {
    const state = relationshipReviewFixture();
    const service = createEvidenceReviewService({
      repositories: repositories(state),
      now: () => new Date("2026-07-29T20:00:00.000Z"),
    });

    await service.updateTrainingExerciseRelationship(state.review.id, {
      evidenceObjectId: "training_1",
      expectedUpdatedAt: state.review.updatedAt,
      memberExerciseIds: ["press_1", "fly_1"],
      mode: "save",
      structuralIssueId: "issue_1",
      updatedBy: "founder",
    });
    const workout = state.review.interpretedEvidence.evidence_objects[0];
    expect(workout.structuralReviewIssues).toEqual([]);
    expect(workout.exerciseRelationshipGroups).toEqual([
      expect.objectContaining({
        relationshipType: "superset",
        memberExerciseIds: ["press_1", "fly_1"],
      }),
    ]);
    await expect(service.beginCommit(state.review.id)).resolves.toMatchObject({
      status: "committing",
    });
  });

  it("removes a Superset group without removing either exercise occurrence", async () => {
    const state = relationshipReviewFixture();
    const workout = state.review.interpretedEvidence.evidence_objects[0];
    workout.structuralReviewIssues = [];
    workout.exerciseRelationshipGroups = [{
      id: "superset_1",
      relationshipType: "superset",
      memberExerciseIds: ["press_1", "fly_1"],
    }];
    await createEvidenceReviewService({ repositories: repositories(state) })
      .updateTrainingExerciseRelationship(state.review.id, {
        evidenceObjectId: "training_1",
        expectedUpdatedAt: state.review.updatedAt,
        mode: "remove",
        relationshipGroupId: "superset_1",
      });

    expect(workout.exercises).toHaveLength(2);
    expect(state.review.interpretedEvidence.evidence_objects[0].exerciseRelationshipGroups)
      .toEqual([]);
  });
});

describe("EvidenceReviewService photo session metadata", () => {
  it("updates shared Time of Day and Goal relationship once for the session", async () => {
    const state = reviewFixture();
    state.review.interpretedEvidence.evidence_objects[0] = {
      id: "photos_1",
      evidence_type: "photo_session",
      captureMetadata: { status: "needs_review", timeOfDay: null },
      goalRelationship: {
        status: "needs_review",
        options: [{ id: "goal_build", title: "Build Lean Mass" }],
      },
      photos: [{ id: "front", view: "front", pose: "relaxed" }, { id: "rear", view: "back", pose: "relaxed" }],
    };
    await createEvidenceReviewService({ repositories: repositories(state) })
      .setPhotoSessionMetadata(state.review.id, {
        evidenceObjectId: "photos_1",
        expectedUpdatedAt: state.review.updatedAt,
        goalId: "goal_build",
        timeOfDay: "afternoon",
        updatedBy: "founder",
      });
    const session = state.review.interpretedEvidence.evidence_objects[0];
    expect(session.captureMetadata).toMatchObject({ status: "reviewed", timeOfDay: "afternoon" });
    expect(session.goalRelationship).toMatchObject({ status: "resolved", goalIds: ["goal_build"], source: "user_session_review" });
    expect(session.photos).toEqual([{ id: "front", view: "front", pose: "relaxed" }, { id: "rear", view: "back", pose: "relaxed" }]);
  });
});

describe("EvidenceReviewService DEXA correction", () => {
  it("persists corrected measurements with optimistic concurrency", async () => {
    const state = reviewFixture();
    state.review.interpretedEvidence.evidence_objects[0] = {
      id: "dexa_candidate",
      evidence_type: "dexa_scan",
      measuredAt: "2026-08-15",
      observed_at: "2026-08-15",
      sourceFileId: "private/founder/dexa/uploads/report.pdf",
      provenance: { extraction_engine: "pdfjs-dist", fixture: false, source_artifact_refs: ["private/founder/dexa/uploads/report.pdf"] },
    };
    await createEvidenceReviewService({ repositories: repositories(state) })
      .setDexaMeasurements(state.review.id, {
        evidenceObjectId: "dexa_candidate",
        expectedUpdatedAt: state.review.updatedAt,
        measurements: {
          measuredAt: "2026-08-15",
          totalMass: "168.3",
          bodyFatPercentage: "7.6",
          fatMass: "12.8",
          leanMass: "148.3",
          boneMineralContent: "7.2",
        },
        updatedBy: "founder",
      });
    expect(state.review.interpretedEvidence.evidence_objects[0]).toMatchObject({
      totalMass: { value: 168.3, unit: "lb" },
      bodyFatPercentage: 7.6,
      boneMineralContent: { value: 7.2, unit: "lb" },
      parser_confidence: "user_corrected",
    });
  });

  it("rejects a stale DEXA edit without mutation", async () => {
    const state = reviewFixture();
    state.review.interpretedEvidence.evidence_objects[0] = { id: "dexa_candidate", evidence_type: "dexa_scan" };
    const before = structuredClone(state.review);
    await expect(createEvidenceReviewService({ repositories: repositories(state) })
      .setDexaMeasurements(state.review.id, {
        evidenceObjectId: "dexa_candidate",
        expectedUpdatedAt: "stale",
        measurements: {},
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
        state.reviewUpdateCount = (state.reviewUpdateCount ?? 0) + 1;
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

function relationshipReviewFixture() {
  const state = reviewFixture();
  state.review.interpretedEvidence.evidence_objects[0] = {
    id: "training_1",
    evidence_type: "training",
    provenance: { source_artifact_refs: ["typed_evidence_0"] },
    exercises: [
      {
        id: "press_1",
        name: "Chest Press Machine",
        canonicalExerciseId: "chest_press_machine",
        sets: [{ reps: 8, weight: 100 }],
      },
      {
        id: "fly_1",
        name: "Chest Fly Machine",
        canonicalExerciseId: "chest_fly_machine",
        sets: [{ reps: 10, weight: 70 }],
      },
    ],
    structuralReviewIssues: [{
      id: "issue_1",
      code: "INCOMPLETE_SUPERSET",
      message: "Choose a second exercise occurrence for this Superset.",
    }],
  };
  return state;
}
