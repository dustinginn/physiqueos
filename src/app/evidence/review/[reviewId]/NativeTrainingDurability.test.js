import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTrainingLoggerEvidencePackage } from "../../../../domain/services/TrainingLoggerAppleHealthService.js";
import { createCoreNavigationReadService } from "../../../../application/core/CoreNavigationReadService.js";
import { createRepositoryCoreNavigationReadStore } from "../../../../platform/database/PostgresCoreNavigationReadStore.js";

const state = vi.hoisted(() => ({ review: null, canonical: [], commits: 0, barrier: null, failure: null, started: null }));
vi.mock("next/cache", () => ({ revalidatePath() {} }));
vi.mock("next/navigation", () => ({ redirect() {} }));
vi.mock("../../../../application/runtime/ApplicationCanonicalRuntime", () => ({
  loadApplicationCanonicalCommitBindings: async () => ({}),
}));
vi.mock("../../../../data/repositories/founderRepositories", () => ({
  FounderRepositories: {
    users: { getCurrentUser: async () => ({ id: "build33-test-owner" }) },
    evidenceReviews: {
      getReviewById: async () => state.review,
      claimEvidenceReviewCommit() {},
    },
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => state.canonical },
  },
}));
vi.mock("../../../../domain/services/EvidenceReviewService", () => ({
  createEvidenceReviewService: () => ({
    beginCommit: async () => {
      state.review.status = "committing";
      return state.review;
    },
    pauseCommit: async () => state.review,
    recordCommitProgress: async (_, step, progress) => {
      state.review.commitProgress[step] = progress;
    },
    failCommit: async () => { state.review.status = "commit_failed"; },
  }),
}));
vi.mock("../../../../domain/services/CanonicalEvidenceConfirmationCommitService", async () => {
  const { reconcileConfirmedEvidencePackage } = await vi.importActual("../../../../domain/services/CanonicalEvidenceService.js");
  return {
    createCanonicalEvidenceConfirmationCommitService: () => ({
      commitConfirmedEvidencePackage: async (evidencePackage, userId) => {
        state.commits += 1;
        state.started?.();
        if (state.barrier) await state.barrier;
        if (state.failure) throw state.failure;
        const result = reconcileConfirmedEvidencePackage({ evidencePackage, userId, existingCanonicalObjects: state.canonical });
        const byId = new Map(state.canonical.map((item) => [item.canonicalId, item]));
        for (const item of result.changedObjects) byId.set(item.canonicalId, structuredClone(item));
        state.canonical = [...byId.values()];
        return {
          committed: result.changedObjects.length > 0,
          outcome: result.changedObjects.length ? "source_committed_work_matched" : "source_matched",
          canonicalEvidenceObjects: state.canonical,
          report: result.report, scope: result.scope,
        };
      },
    }),
  };
});

import { beginNativeEvidenceReviewConfirmation } from "./actions.js";

beforeEach(() => {
  state.canonical = [];
  state.commits = 0;
  state.barrier = null;
  state.failure = null;
  state.started = null;
  state.review = {
    id: "build33-training-review", userId: "build33-test-owner", status: "pending",
    commitProgress: {}, itemDecisions: {},
    interpretedEvidence: buildTrainingLoggerEvidencePackage({
      userId: "build33-test-owner",
      draft: {
        draftId: "build33-durable-workout", mode: "retrospective", workoutDate: "2026-09-15",
        reconciliation: { normalizedEvidence: [], selectedStrengthSourceId: null, continueWithoutStrength: true, additionalEvidenceActions: [], finalized: true },
        exercises: [{ id: "spider-occurrence", canonicalExerciseId: "spider_curl", name: "Spider Curl", bodyRegion: "Arms", equipment: "dumbbell", sets: [{ id: "set-one", reps: 12, load: 35, unit: "lb", confirmed: true }] }],
        exerciseRelationshipGroups: [],
      },
    }),
  };
});

describe("Build 33 Native confirmation durability without private Founder fixtures", () => {
  const confirm = () => beginNativeEvidenceReviewConfirmation({
    reviewId: state.review.id, confirmedBy: "build33-test-owner", operationId: "build33-test-confirmation",
  });

  it("does not return before TrainingSession persistence and immediately feeds the actual Log summary projection", async () => {
    let release;
    state.barrier = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { state.started = resolve; });
    let returned = false;
    const request = confirm().then((value) => { returned = true; return value; });
    await Promise.race([started, request]);
    expect(returned).toBe(false);
    expect(state.canonical).toHaveLength(0);
    release();
    expect(await request).toMatchObject({ state: "processing", completedStep: "canonical_commit", trainingSessionDurable: true });
    expect(state.canonical).toHaveLength(1);
    expect(state.canonical[0].payload.exercises[0].sets).toHaveLength(1);
    expect(Object.keys(state.review.commitProgress)).toEqual(["canonical_commit"]);
    expect(state.review.commitProgress.canonical_commit.status).toBe("completed");
    const log = await createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => ({
        user: { id: "build33-test-owner", timeZone: "America/Los_Angeles" },
        canonicalEvidenceObjects: state.canonical, evidenceReviews: [state.review],
      }) }),
      now: () => new Date("2026-09-15T19:00:00.000Z"),
    }).getLog();
    expect(log.loggedToday.rows.find((row) => row.id === "training"))
      .toMatchObject({ summary: "Strength Training logged", recordId: state.canonical[0].canonicalId });
    await confirm();
    expect(state.commits).toBe(1);
    expect(state.canonical).toHaveLength(1);
  });

  it("rejects a failed canonical commit instead of acknowledging a logged workout", async () => {
    state.failure = new Error("Task-owned simulated persistence failure");
    await expect(confirm()).rejects.toThrow("canonical_commit failed");
    expect(state.canonical).toHaveLength(0);
    expect(state.review.commitProgress.canonical_commit.status).toBe("failed");
  });

  it("retains zero synchronous canonical steps for non-Training evidence", async () => {
    state.review.interpretedEvidence.evidence_objects = [{ id: "nutrition-test", evidence_type: "nutrition" }];
    expect(await confirm()).toMatchObject({ state: "processing", accepted: true });
    expect(state.commits).toBe(0);
    expect(state.review.commitProgress).toEqual({});
  });

  it("does not make excluded Training evidence change another evidence type's confirmation boundary", async () => {
    const training = state.review.interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "training");
    state.review.itemDecisions[training.id] = { included: false };
    state.review.interpretedEvidence.evidence_objects.push({ id: "nutrition-test", evidence_type: "nutrition" });
    expect(await confirm()).toMatchObject({ state: "processing", accepted: true });
    expect(state.commits).toBe(0);
    expect(state.review.commitProgress).toEqual({});
  });
});
