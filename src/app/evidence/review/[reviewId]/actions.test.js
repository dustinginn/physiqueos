import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeStore = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "private/founder/runtime-store.json"), "utf8")
);

const redirect = vi.fn();
const revalidatePath = vi.fn();
const mockState = vi.hoisted(() => ({ value: null }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

vi.mock("../../../../data/repositories/founderRepositories", async () => {
  const { reconcileConfirmedEvidencePackage } = await vi.importActual(
    "../../../../domain/services/CanonicalEvidenceService"
  );

  const getState = () => mockState.value;

  return {
    FounderRepositories: {
      users: {
        async getCurrentUser() {
          return getState().user;
        },
      },
      evidenceReviews: {
        async getReviewById(reviewId) {
          return getState().evidenceReviews.find((review) => review.id === reviewId) ?? null;
        },
        async updateReview(reviewId, changes) {
          const state = getState();
          const index = state.evidenceReviews.findIndex((review) => review.id === reviewId);
          if (index < 0) return null;
          state.evidenceReviews[index] = {
            ...state.evidenceReviews[index],
            ...structuredClone(changes),
            updatedAt: "2026-07-27T17:00:00.000Z",
          };
          return state.evidenceReviews[index];
        },
      },
      canonicalEvidence: {
        async listCanonicalEvidenceObjects() {
          return structuredClone(getState().canonicalEvidenceObjects);
        },
        async upsertCanonicalEvidenceObjects(canonicalObjects) {
          getState().canonicalEvidenceObjects = structuredClone(canonicalObjects);
          return getState().canonicalEvidenceObjects;
        },
        async reconcileConfirmedEvidencePackage(evidencePackage, userId) {
          const state = getState();
          const reconciliation = reconcileConfirmedEvidencePackage({
            evidencePackage,
            existingCanonicalObjects: state.canonicalEvidenceObjects,
            userId,
          });
          const byId = new Map(state.canonicalEvidenceObjects.map((item) => [item.canonicalId, item]));
          reconciliation.changedObjects.forEach((item) => byId.set(item.canonicalId, structuredClone(item)));
          state.canonicalEvidenceObjects = [...byId.values()];
          return reconciliation;
        },
      },
      analyses: {
        async createAnalysis(analysis) {
          getState().analyses.push(structuredClone(analysis));
          return analysis;
        },
        async getAnalysisById(analysisId) {
          const existing = getState().analyses.find((analysis) => analysis.id === analysisId);
          if (existing) return existing;
          if (String(analysisId).startsWith("analysis_training_evidence_submission_20260727161048228_images")) {
            return {
              id: analysisId,
              createdAt: "2026-07-27T16:10:48.228Z",
              metadata: { trainingPerformance: { exerciseObservations: [] } },
            };
          }
          return null;
        },
      },
      weights: { async listWeightEntries() { return []; } },
      progressPhotos: {
        async listPhotos() { return []; },
        async getPhotosByDate() { return []; },
        async upsertPhoto() { return null; },
      },
      dexaScans: { async listDEXAScans() { return []; }, async upsertDEXAScan() { return null; }, async addDEXAScan() { return null; } },
      goals: { async listGoals() { return []; } },
      protocols: { async listProtocols() { return []; } },
      nutritionContext: { async getNutritionContext() { return null; } },
      reminders: { async completeReminderFromEvidence() { return null; } },
      executionItems: { async getExecutionItemById() { return null; }, async saveExecutionItem() { return null; } },
    },
  };
});

vi.mock("../../../../domain/services/PILowerLevelConfidenceWorkEnqueueService", () => ({
  createPILowerLevelConfidenceWorkEnqueueService: () => ({
    stageTrainingFinalization() {},
    stageEnergySourceChange() {},
  }),
  isPIEnergyConfidenceEnqueueEnabled: () => false,
  isPITrainingConfidenceEnqueueEnabled: () => false,
}));

vi.mock("../../../../domain/services/PendingEvidenceReviewReprocessingService", () => ({
  createPendingEvidenceReviewReprocessingService: () => ({
    async reprocessPendingReviewInPlace() {
      return null;
    },
  }),
}));

vi.mock("../../../../domain/services/GoalEvaluationService", () => ({
  GoalEvaluationService: {
    getGoalEvaluations: () => [],
  },
}));

vi.mock("../../../../domain/services/DEXAEventNarrativeService", () => ({
  createFounderDEXAEventNarrativeService: () => ({
    async generate() {
      return { artifactId: null, id: null };
    },
  }),
}));

vi.mock("../../../../domain/services/PhotoEventNarrativeService", () => ({
  createFounderPhotoEventNarrativeService: () => ({
    async getOrCreateResult() {
      return { status: "completed", artifactId: null, sessionId: null };
    },
  }),
}));

vi.mock("../../../../domain/services/TrainingPerformanceEventPersistenceService", () => ({
  createTrainingPerformanceEventPersistenceService: () => ({
    async persistEventBatch() {
      return { outcome: "no_events", newEvents: [], existingEvents: [], batch: null };
    },
  }),
  TrainingPerformanceEventPersistenceOutcome: {
    COLLISION: "collision",
    CONCURRENCY_CONFLICT: "concurrency_conflict",
    PERSISTENCE_FAILURE: "persistence_failure",
    COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
    NO_EVENTS: "no_events",
  },
}));

vi.mock("../../../../domain/services/TrainingPerformanceIntelligenceService", () => ({
  createTrainingPerformanceIntelligenceReport: () => ({ summary: "ok", exerciseObservations: [] }),
}));

const { confirmEvidenceReview } = await import("./actions.js");

function createIsolatedReviewState(store) {
  const review = structuredClone(
    store.evidenceReviews.find((item) => item.id === "evidence_review_20260727161133407")
  );
  review.status = "partially_committed";
  review.commitProgress.home_refresh = {
    ...review.commitProgress.home_refresh,
    status: "failed",
    attempts: 1,
    completedAt: null,
    result: null,
  };
  const confirmedSecondWalk = structuredClone(
    store.canonicalEvidenceObjects.find(
      (item) =>
        item.evidence_type === "training" &&
        String(item.canonicalId) === "training|authoritative|IMG_1686.png"
    )
  );
  const confirmedStrengthSession = structuredClone(
    store.canonicalEvidenceObjects.find(
      (item) =>
        item.evidence_type === "training" &&
        String(item.canonicalId) === "training|authoritative|IMG_1688.png|typed_evidence_0"
    )
  );

  return {
    user: structuredClone(store.user),
    evidenceReviews: [review],
    canonicalEvidenceObjects: [
      ...(confirmedSecondWalk ? [confirmedSecondWalk] : []),
      ...(confirmedStrengthSession ? [confirmedStrengthSession] : []),
    ],
    analyses: [],
  };
}

describe("confirmEvidenceReview", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    redirect.mockClear();
    mockState.value = createIsolatedReviewState(runtimeStore);
  });

  it("resumes the failed review through the real action boundary without a ReferenceError", async () => {
    const review = structuredClone(runtimeStore.evidenceReviews.find((item) => item.id === "evidence_review_20260727161133407"));
    const formData = {
      get(key) {
        if (key === "reviewId") return review.id;
        if (key === "evidenceJson") return JSON.stringify(review.interpretedEvidence);
        if (key === "itemDecisionsJson") return JSON.stringify(review.itemDecisions ?? {});
        return null;
      },
    };

    await expect(confirmEvidenceReview(formData)).resolves.toBeUndefined();

    const committedReview = mockState.value.evidenceReviews[0];
    const canonicalEvidenceObjects = mockState.value.canonicalEvidenceObjects;

    expect(committedReview.status).toBe("confirmed");
    expect(committedReview.commitProgress.canonical_commit.status).toBe("completed");
    expect(committedReview.commitProgress.canonical_commit.attempts).toBe(4);
    expect(Object.values(committedReview.commitProgress).every((step) => step.status === "completed")).toBe(true);

    const canonicalStrengthSession = canonicalEvidenceObjects.find(
      (item) => item.canonicalId === "training|authoritative|IMG_1688.png|typed_evidence_0"
    );
    expect(canonicalStrengthSession?.quality?.status).toBe("active");
    expect(canonicalStrengthSession?.provenance?.contributing_evidence_object_ids).toContain(
      "training_2026-07-27_07-09_StrengthTraining"
    );

    expect(redirect).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/briefing/daily");
  });

  it("completes the durable review when route invalidation reports a missing request store", async () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing in revalidatePath /");
    });

    const review = structuredClone(runtimeStore.evidenceReviews.find((item) => item.id === "evidence_review_20260727161133407"));
    const formData = {
      get(key) {
        if (key === "reviewId") return review.id;
        if (key === "evidenceJson") return JSON.stringify(review.interpretedEvidence);
        if (key === "itemDecisionsJson") return JSON.stringify(review.itemDecisions ?? {});
        return null;
      },
    };

    await expect(confirmEvidenceReview(formData)).resolves.toBeUndefined();

    const committedReview = mockState.value.evidenceReviews[0];
    expect(committedReview.status).toBe("confirmed");
    expect(committedReview.commitProgress.home_refresh.status).toBe("completed");
    expect(committedReview.commitProgress.home_refresh.result.pathsToRevalidate).toEqual(
      expect.arrayContaining(["/", "/briefing/daily", "/progress", "/progress/photos", "/progress/dexa", "/progress/training", "/timeline"])
    );
    expect(committedReview.commitProgress.training_performance_events.status).toBe("completed");
  });

  it("commits the fresh July 27 Strength Training review once under its screenshot identity", async () => {
    const freshReview = structuredClone(
      runtimeStore.evidenceReviews.find(
        (item) => item.id === "evidence_review_20260727234945923"
      )
    );
    freshReview.status = "pending";
    freshReview.confirmation = null;
    freshReview.commitProgress = {};
    freshReview.commitError = null;
    const oldReview = runtimeStore.evidenceReviews.find(
      (item) => item.id === "evidence_review_20260727161133407"
    );
    const priorStrengthIds = new Set(
      oldReview.commitProgress.canonical_commit.result.supersededCanonicalIds
    );
    const cleanCanonicalHistory = runtimeStore.canonicalEvidenceObjects
      .filter(
        (item) =>
          item.canonicalId !==
          "training|authoritative|IMG_1688.png|typed_evidence_0"
      )
      .map((item) =>
        priorStrengthIds.has(item.canonicalId)
          ? { ...structuredClone(item), quality: { status: "active" } }
          : structuredClone(item)
      );
    mockState.value = {
      user: structuredClone(runtimeStore.user),
      evidenceReviews: [freshReview],
      canonicalEvidenceObjects: cleanCanonicalHistory,
      analyses: [],
    };
    const formData = {
      get(key) {
        if (key === "reviewId") return freshReview.id;
        if (key === "evidenceJson") {
          return JSON.stringify(freshReview.interpretedEvidence);
        }
        if (key === "itemDecisionsJson") {
          return JSON.stringify(freshReview.itemDecisions ?? {});
        }
        return null;
      },
    };

    await expect(confirmEvidenceReview(formData)).resolves.toBeUndefined();

    const july27Training = mockState.value.canonicalEvidenceObjects.filter(
      (item) =>
        item.payload?.evidence_type === "training" &&
        item.quality?.status !== "superseded" &&
        item.payload?.observed_at === "2026-07-27"
    );
    const strengthSessions = july27Training.filter((item) =>
      /traditional strength training/i.test(item.payload.metadata?.activity_type)
    );

    expect(july27Training).toHaveLength(4);
    expect(strengthSessions).toHaveLength(1);
    expect(strengthSessions[0]).toMatchObject({
      canonicalId: "training|authoritative|IMG_1688.png",
      payload: {
        metadata: {
          active_calories: 215,
          average_heart_rate: 93,
          duration_seconds: 3053,
        },
      },
    });
    expect(
      strengthSessions[0].payload.exercises.map((exercise) => [
        exercise.canonicalExerciseId,
        exercise.sets.length,
      ])
    ).toEqual([
      ["shoulder_press_machine", 4],
      ["lateral_raise_machine", 4],
      ["cable_machine_front_raise", 4],
    ]);
    expect(mockState.value.evidenceReviews[0].status).toBe("confirmed");
    expect(
      Object.values(mockState.value.evidenceReviews[0].commitProgress).every(
        (step) => step.status === "completed"
      )
    ).toBe(true);
  });
});
