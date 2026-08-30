import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "../../../../contracts/v1/canonicalJson";
import { prepareCanonicalExerciseIdentitiesForConfirmation } from "../../../../domain/services/CanonicalExerciseLibraryService";
import { reconcileConfirmedEvidencePackage } from "../../../../domain/services/CanonicalEvidenceService";
import { createEvidenceReviewContinuationKey } from "../../../../domain/services/EvidenceReviewBackgroundContinuation";

const runtimeStore = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "private/founder/runtime-store.json"), "utf8")
);

const redirect = vi.fn();
const revalidatePath = vi.fn();
const mockState = vi.hoisted(() => ({ value: null }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", async () => {
  const { getRedirectError } = await vi.importActual(
    "next/dist/client/components/redirect"
  );
  return {
    redirect(destination) {
      redirect(destination);
      if (mockState.value?.useNextRedirectSemantics) {
        throw getRedirectError(destination, "replace");
      }
    },
  };
});

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
        async updateReviewIfCurrent(reviewId, expectedUpdatedAt, changes) {
          const state = getState();
          const index = state.evidenceReviews.findIndex((review) => review.id === reviewId);
          if (index < 0) return null;
          if (state.evidenceReviews[index].updatedAt !== expectedUpdatedAt) {
            throw Object.assign(new Error("This evidence review changed."), {
              code: "REVIEW_STALE",
            });
          }
          state.evidenceReviews[index] = {
            ...state.evidenceReviews[index],
            ...structuredClone(changes),
            updatedAt: "2026-07-27T17:00:00.000Z",
          };
          state.reviewUpdateCount = (state.reviewUpdateCount ?? 0) + 1;
          return structuredClone(state.evidenceReviews[index]);
        },
        get claimEvidenceReviewCommit() {
          if (!getState().durableCommitClaims) return undefined;
          return async (reviewId, lifecycle) => {
            const review = getState().evidenceReviews.find((item) => item.id === reviewId);
            if (!review) return null;
            const activeExpiry = Date.parse(review.commitClaim?.leaseExpiresAt ?? "");
            if (
              review.commitClaim?.status === "in_progress" &&
              review.commitClaim.operationId !== lifecycle.operationId &&
              Number.isFinite(activeExpiry) &&
              activeExpiry > Date.parse(lifecycle.claimedAt)
            ) {
              throw Object.assign(new Error("This evidence review confirmation is already running."), {
                code: "COMMIT_IN_PROGRESS",
              });
            }
            review.status = "committing";
            review.commitError = null;
            review.commitClaim = structuredClone({
              operationId: lifecycle.operationId,
              status: "in_progress",
              claimedAt: lifecycle.claimedAt,
              leaseExpiresAt: lifecycle.leaseExpiresAt,
              packageId: lifecycle.packageId,
            });
            getState().claimCalls = (getState().claimCalls ?? 0) + 1;
            return structuredClone(review);
          };
        },
        get recordEvidenceReviewCommitProgress() {
          if (!getState().durableCommitClaims) return undefined;
          return async (reviewId, { operationId, key, value, leaseExpiresAt }) => {
            const review = requireActiveTestClaim(getState(), reviewId, operationId);
            if (getState().recordProgressError) {
              const error = getState().recordProgressError;
              getState().recordProgressError = null;
              throw error;
            }
            review.commitProgress = {
              ...(review.commitProgress ?? {}),
              [key]: structuredClone(value),
            };
            review.commitClaim = { ...review.commitClaim, leaseExpiresAt };
            return structuredClone(review);
          };
        },
        get releaseEvidenceReviewCommit() {
          if (!getState().durableCommitClaims) return undefined;
          return async (reviewId, { operationId, releasedAt }) => {
            const review = requireActiveTestClaim(getState(), reviewId, operationId);
            review.commitClaim = {
              ...review.commitClaim,
              status: "available",
              releasedAt,
              leaseExpiresAt: releasedAt,
            };
            getState().pauseCommitCalls = (getState().pauseCommitCalls ?? 0) + 1;
            return structuredClone(review);
          };
        },
        get completeEvidenceReviewCommit() {
          if (!getState().durableCommitClaims) return undefined;
          return async (reviewId, { operationId, confirmation, interpretedEvidence }) => {
            const review = requireActiveTestClaim(getState(), reviewId, operationId);
            review.status = "confirmed";
            review.interpretedEvidence = structuredClone(interpretedEvidence);
            review.confirmation = structuredClone(confirmation);
            review.commitClaim = {
              ...review.commitClaim,
              status: "completed",
              completedAt: confirmation.confirmedAt,
              leaseExpiresAt: confirmation.confirmedAt,
            };
            getState().completeCommitCalls = (getState().completeCommitCalls ?? 0) + 1;
            return structuredClone(review);
          };
        },
        get failEvidenceReviewCommit() {
          if (!getState().durableCommitClaims) return undefined;
          return async (reviewId, { operationId, error, failedAt }) => {
            const review = requireActiveTestClaim(getState(), reviewId, operationId);
            review.status = Object.values(review.commitProgress ?? {}).some(
              (step) => step?.status === "completed"
            ) ? "partially_committed" : "commit_failed";
            review.commitError = String(error);
            review.commitClaim = {
              ...review.commitClaim,
              status: "failed",
              failedAt,
              leaseExpiresAt: failedAt,
            };
            getState().failCommitCalls = (getState().failCommitCalls ?? 0) + 1;
            return structuredClone(review);
          };
        },
      },
      canonicalEvidence: {
        async listCanonicalEvidenceObjects() {
          return structuredClone(getState().canonicalEvidenceObjects);
        },
        async upsertCanonicalEvidenceObjects(canonicalObjects) {
          const state = getState();
          if (
            state.rejectBroadCanonicalUpserts &&
            canonicalObjects.some((item) =>
              (item.payload ?? item).evidence_type === "nutrition"
            )
          ) {
            throw new Error(
              "Cannot persist a second active canonical NutritionDay for nutrition|2026-07-25."
            );
          }
          const byId = new Map(state.canonicalEvidenceObjects.map((item) =>
            [item.canonicalId, item]
          ));
          canonicalObjects.forEach((item) =>
            byId.set(item.canonicalId, structuredClone(item))
          );
          state.canonicalEvidenceObjects = [...byId.values()];
          return structuredClone(canonicalObjects);
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
          const stored = getState().enforceCanonicalJson
            ? JSON.parse(canonicalJson(analysis))
            : structuredClone(analysis);
          getState().analyses.push(stored);
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
      goals: { async listGoals() { return structuredClone(getState().goals ?? []); } },
      protocols: { async listProtocols() { return []; } },
      nutritionContext: { async getNutritionContext() { return null; } },
      reminders: { async completeReminderFromEvidence() { return null; } },
      executionItems: { async getExecutionItemById() { return null; }, async saveExecutionItem() { return null; } },
      briefingReconciliationWorkItems: {
        async listWorkItems() {
          return structuredClone(getState().briefingReconciliationWorkItems ?? []);
        },
      },
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

vi.mock("../../../../domain/services/CanonicalEvidenceConfirmationCommitService", async () => {
  const { reconcileConfirmedEvidencePackage } = await vi.importActual(
    "../../../../domain/services/CanonicalEvidenceService"
  );
  return {
    createCanonicalEvidenceConfirmationCommitService: () => ({
      async commitConfirmedEvidencePackage(evidencePackage, userId) {
        const state = mockState.value;
        state.canonicalCommitCalls = (state.canonicalCommitCalls ?? 0) + 1;
        if (state.canonicalCommitError) throw state.canonicalCommitError;
        const reconciliation = reconcileConfirmedEvidencePackage({
          evidencePackage,
          existingCanonicalObjects: state.canonicalEvidenceObjects,
          userId,
        });
        const byId = new Map(state.canonicalEvidenceObjects.map((item) =>
          [item.canonicalId, item]
        ));
        reconciliation.changedObjects.forEach((item) =>
          byId.set(item.canonicalId, structuredClone(item))
        );
        state.canonicalEvidenceObjects = [...byId.values()];
        return {
          committed: reconciliation.changedObjects.length > 0,
          outcome: reconciliation.changedObjects.length > 0
            ? "source_committed_work_matched"
            : "source_matched",
          canonicalEvidenceObjects: structuredClone(
            state.canonicalEvidenceObjects.filter((item) =>
              item.provenance?.evidence_package_ids?.includes(
                evidencePackage.package_id
              )
            )
          ),
          changedObjects: structuredClone(reconciliation.changedObjects),
          report: reconciliation.report,
          scope: reconciliation.scope,
        };
      },
    }),
  };
});

vi.mock("../../../../domain/services/PendingEvidenceReviewReprocessingService", () => ({
  createPendingEvidenceReviewReprocessingService: () => ({
    async reprocessPendingReviewInPlace() {
      if (mockState.value.reprocessError) throw mockState.value.reprocessError;
      return mockState.value.reprocessResult ?? { changed: false, idempotent: true };
    },
  }),
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
      const state = mockState.value;
      state.photoNarrativeCalls = (state.photoNarrativeCalls ?? 0) + 1;
      if (state.photoNarrativeError) throw state.photoNarrativeError;
      return state.photoNarrativeResult ?? {
        status: "completed",
        artifactId: null,
        sessionId: null,
      };
    },
  }),
  createPhotoEventNarrativeService: () => ({
    async getOrCreateResult({ sessionId }) {
      const state = mockState.value;
      state.photoNarrativeWithoutConfidenceCalls =
        (state.photoNarrativeWithoutConfidenceCalls ?? 0) + 1;
      const artifactId = `event_briefing_progress_photo_${sessionId}`;
      return state.photoNarrativeWithoutConfidenceResult ?? {
        status: "completed",
        artifactId,
        artifact: { id: artifactId },
        sessionId,
        created: true,
      };
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

const {
  confirmEvidenceReview,
  continueEvidenceReviewInBackground,
  reprocessEvidenceReview,
  updateEvidenceReviewPhotoPose,
  updateEvidenceReviewPhotoSessionMetadata,
} = await import("./actions.js");

function requireActiveTestClaim(state, reviewId, operationId) {
  const review = state.evidenceReviews.find((item) => item.id === reviewId);
  if (
    !review ||
    review.status !== "committing" ||
    review.commitClaim?.status !== "in_progress" ||
    review.commitClaim.operationId !== operationId
  ) {
    throw Object.assign(new Error("The evidence review confirmation claim is no longer active."), {
      code: "COMMIT_CLAIM_LOST",
    });
  }
  return review;
}

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
  const persistedConfirmedStrengthSession = structuredClone(
    store.canonicalEvidenceObjects.find(
      (item) =>
        item.evidence_type === "training" &&
        String(item.canonicalId) === "training|authoritative|IMG_1688.png|typed_evidence_0"
    )
  );
  const strengthEvidence = structuredClone(
    review.interpretedEvidence.evidence_objects.find(
      (item) => item.id === "training_2026-07-27_07-09_StrengthTraining"
    )
  );
  const confirmedStrengthSession =
    persistedConfirmedStrengthSession ??
    {
      canonicalId: "training|authoritative|IMG_1688.png|typed_evidence_0",
      evidence_type: "training",
      payload: strengthEvidence,
      provenance: {
        contributing_evidence_object_ids: [strengthEvidence.id],
        source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"],
      },
      quality: { status: "active" },
    };

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

function createFailedPhotoReviewState(store, { atomicCommitPersisted = true } = {}) {
  const review = structuredClone(
    store.evidenceReviews.find(
      (item) => item.id === "evidence_review_20260810005949415"
    )
  );
  const atomicPhoto = structuredClone(
    store.canonicalEvidenceObjects.find((item) =>
      item.evidence_type === "photo_session" &&
      item.provenance?.evidence_package_ids?.includes(
        review.interpretedEvidence.package_id
      )
    )
  );
  const historicalNutrition = store.canonicalEvidenceObjects
    .filter((item) =>
      (item.payload ?? item).evidence_type === "nutrition" &&
      String(item.lastObservedAt).slice(0, 10) === "2026-07-25" &&
      item.quality?.status !== "superseded"
    )
    .map((item) => structuredClone(item));
  review.status = "commit_failed";
  review.confirmation = null;
  review.commitError = "Post-confirmation step canonical_commit failed";
  review.commitProgress = Object.fromEntries([
    ["canonical_commit", {
      status: "failed",
      attempts: 2,
      error: review.commitError,
      retryable: true,
    }],
    ...[
      "compatibility_writes",
      "scheduled_completion",
      "analysis",
      "training_performance_events",
      "goal_evaluation",
      "event_eligibility",
      "briefing",
      "home_refresh",
    ].map((step) => [step, {
      status: "completed",
      attempts: 1,
      result: { status: "completed" },
    }]),
  ]);
  return {
    user: structuredClone(store.user),
    evidenceReviews: [review],
    canonicalEvidenceObjects: [
      ...historicalNutrition,
      ...(atomicCommitPersisted && atomicPhoto ? [atomicPhoto] : []),
    ],
    analyses: [],
    canonicalCommitCalls: 0,
    rejectBroadCanonicalUpserts: true,
  };
}

function confirmationForm(review) {
  return {
    get(key) {
      if (key === "reviewId") return review.id;
      if (key === "evidenceJson") {
        return JSON.stringify(review.interpretedEvidence);
      }
      if (key === "itemDecisionsJson") {
        return JSON.stringify(review.itemDecisions ?? {});
      }
      return null;
    },
  };
}

function createBriefingFailedPhotoReviewState(store) {
  const review = structuredClone(
    store.evidenceReviews.find(
      (item) => item.id === "evidence_review_20260810005949415"
    )
  );
  review.status = "partially_committed";
  review.commitError = "briefing: prior publication failure";
  review.commitProgress.briefing = {
    status: "failed",
    attempts: 2,
    retryable: true,
  };
  review.commitProgress.home_refresh = {
    status: "pending",
    attempts: 0,
  };
  return {
    user: structuredClone(store.user),
    evidenceReviews: [review],
    canonicalEvidenceObjects: store.canonicalEvidenceObjects
      .filter((item) =>
        item.evidence_type === "photo_session" ||
        item.evidence_type === "progress_photo"
      )
      .map((item) => structuredClone(item)),
    analyses: [],
    canonicalCommitCalls: 0,
    photoNarrativeCalls: 0,
  };
}

function createDurableContinuationState(store) {
  const state = createIsolatedReviewState(store);
  const review = state.evidenceReviews[0];
  review.interpretedEvidence = prepareCanonicalExerciseIdentitiesForConfirmation(
    review.interpretedEvidence
  );
  review.status = "committing";
  review.confirmation = null;
  review.commitError = null;
  review.commitClaim = {
    operationId: "previous-recovery",
    status: "available",
    claimedAt: "2026-08-28T23:21:12.467Z",
    leaseExpiresAt: "2026-08-28T23:21:30.016Z",
    releasedAt: "2026-08-28T23:21:30.016Z",
    packageId: review.interpretedEvidence.package_id,
  };
  review.commitProgress = Object.fromEntries([
    "canonical_commit",
    "compatibility_writes",
    "scheduled_completion",
    "analysis",
    "training_performance_events",
    "goal_evaluation",
  ].map((step) => [step, {
    status: "completed",
    attempts: step === "goal_evaluation" ? 2 : 1,
    completedAt: "2026-08-28T23:21:29.000Z",
    result: step === "canonical_commit"
      ? {
          status: "completed",
          canonicalEvidenceIds: state.canonicalEvidenceObjects.map(
            (item) => item.canonicalId
          ),
        }
      : step === "analysis"
        ? { status: "completed", analysisIds: [] }
        : step === "training_performance_events"
          ? { status: "completed", newlyCreatedEvents: [], existingEvents: [] }
          : { status: "completed" },
  }]));
  state.durableCommitClaims = true;
  state.useNextRedirectSemantics = true;
  state.canonicalCommitCalls = 0;
  state.claimCalls = 0;
  state.pauseCommitCalls = 0;
  state.completeCommitCalls = 0;
  state.failCommitCalls = 0;
  return state;
}

function createExpiredFirstStepRecoveryState(store, { canonicalCommitPersisted = false } = {}) {
  const state = createIsolatedReviewState(store);
  const review = state.evidenceReviews[0];
  review.interpretedEvidence = prepareCanonicalExerciseIdentitiesForConfirmation(
    review.interpretedEvidence
  );
  review.status = "committing";
  review.confirmation = null;
  review.commitError = null;
  review.commitProgress = {};
  review.commitClaim = {
    operationId: "expired-first-step-claim",
    status: "in_progress",
    claimedAt: "2026-08-29T06:23:20.343Z",
    leaseExpiresAt: "2026-08-29T06:33:20.343Z",
    packageId: review.interpretedEvidence.package_id,
  };
  state.canonicalEvidenceObjects = [];
  if (canonicalCommitPersisted) {
    const reconciliation = reconcileConfirmedEvidencePackage({
      evidencePackage: review.interpretedEvidence,
      existingCanonicalObjects: [],
      userId: state.user.id,
    });
    state.canonicalEvidenceObjects = structuredClone(reconciliation.changedObjects);
    review.commitProgress.canonical_commit = {
      status: "started",
      attempts: 1,
      startedAt: "2026-08-29T06:23:21.000Z",
    };
  }
  state.briefingReconciliationWorkItems = [];
  state.durableCommitClaims = true;
  state.useNextRedirectSemantics = true;
  state.canonicalCommitCalls = 0;
  state.claimCalls = 0;
  state.pauseCommitCalls = 0;
  state.completeCommitCalls = 0;
  state.failCommitCalls = 0;
  return state;
}

async function expectNextRedirect(promise, destinationPart) {
  await expect(promise).rejects.toMatchObject({
    message: "NEXT_REDIRECT",
    digest: expect.stringContaining(destinationPart),
  });
}

async function continueInBackground(review, index = 1) {
  const continuationKey = createEvidenceReviewContinuationKey(review);
  expect(continuationKey).toBeTruthy();
  return continueEvidenceReviewInBackground({
    reviewId: review.id,
    continuationKey,
    messageId: `message-${index}`,
  });
}

function createPendingPhotoEditState(store) {
  const state = createIsolatedReviewState(store);
  const review = state.evidenceReviews[0];
  review.status = "pending";
  review.commitProgress = {};
  review.commitClaim = null;
  review.updatedAt = "2026-08-30T22:42:43.354Z";
  review.interpretedEvidence = {
    package_id: "photo_package_1",
    evidence_objects: [{
      id: "photos_1",
      evidence_type: "photo_session",
      captureMetadata: { status: "needs_review", timeOfDay: null },
      goalRelationship: {
        status: "needs_review",
        options: [{ id: "goal_1", title: "Goal One" }],
      },
      photos: [
        { id: "front", source_artifact_ref: "media://front" },
        { id: "rear", source_artifact_ref: "media://rear" },
      ],
    }],
  };
  state.reviewUpdateCount = 0;
  state.useNextRedirectSemantics = true;
  return state;
}

describe("photo review edit actions", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    redirect.mockClear();
    mockState.value = createPendingPhotoEditState(runtimeStore);
  });

  it("refreshes a stale pose edit without entering the generic failure boundary", async () => {
    const review = mockState.value.evidenceReviews[0];
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("expectedUpdatedAt", "stale-version");
    formData.set("photoId", "front");
    formData.set("sourceArtifactRef", "media://front");
    formData.set("poseId", "front-relaxed");

    await expectNextRedirect(
      updateEvidenceReviewPhotoPose(formData),
      `evidence/review/${review.id}?photo=stale`
    );
    expect(mockState.value.reviewUpdateCount).toBe(0);
    expect(revalidatePath).toHaveBeenCalledWith(`/evidence/review/${review.id}`);
  });

  it("persists one current pose edit and redirects to the refreshed review", async () => {
    const review = mockState.value.evidenceReviews[0];
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("expectedUpdatedAt", review.updatedAt);
    formData.set("photoId", "front");
    formData.set("sourceArtifactRef", "media://front");
    formData.set("poseId", "front-relaxed");

    await expectNextRedirect(
      updateEvidenceReviewPhotoPose(formData),
      `evidence/review/${review.id}?pose=saved`
    );
    expect(mockState.value.reviewUpdateCount).toBe(1);
    expect(mockState.value.evidenceReviews[0].interpretedEvidence.evidence_objects[0].photos[1])
      .toMatchObject({ source_artifact_ref: "media://rear" });
  });

  it("uses the same optimistic boundary for session metadata", async () => {
    const review = mockState.value.evidenceReviews[0];
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("expectedUpdatedAt", review.updatedAt);
    formData.set("evidenceObjectId", "photos_1");
    formData.set("goalId", "goal_1");
    formData.set("timeOfDay", "afternoon");

    await expectNextRedirect(
      updateEvidenceReviewPhotoSessionMetadata(formData),
      `evidence/review/${review.id}?session=saved`
    );
    expect(mockState.value.reviewUpdateCount).toBe(1);
  });
});

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

  it("returns a confirmed Morning recovery review to the allowlisted check-in route", async () => {
    const review = mockState.value.evidenceReviews[0];
    review.interpretedEvidence.review_metadata = {
      ...(review.interpretedEvidence.review_metadata ?? {}),
      recoveryContext: {
        date: "2026-07-27",
        expectedEvidenceType: "training",
        recoveryKey: "execution:training:2026-07-27",
        returnTo: "/check-in/morning",
      },
    };
    const formData = {
      get(key) {
        if (key === "reviewId") return review.id;
        if (key === "evidenceJson") return JSON.stringify(review.interpretedEvidence);
        if (key === "itemDecisionsJson") return JSON.stringify(review.itemDecisions ?? {});
        return null;
      },
    };

    await expect(confirmEvidenceReview(formData)).resolves.toBeUndefined();

    expect(revalidatePath).toHaveBeenCalledWith("/check-in/morning");
    expect(redirect).toHaveBeenCalledWith("/check-in/morning");
  });

  it("resumes the persisted photo commit without rerunning it or upserting unrelated canonical history", async () => {
    mockState.value = createFailedPhotoReviewState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];
    const nutritionBefore = structuredClone(
      mockState.value.canonicalEvidenceObjects.filter((item) =>
        (item.payload ?? item).evidence_type === "nutrition"
      )
    );

    await expect(confirmEvidenceReview(confirmationForm(review)))
      .resolves.toBeUndefined();

    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.evidenceReviews[0].status).toBe("confirmed");
    expect(
      mockState.value.evidenceReviews[0].commitProgress.canonical_commit
    ).toMatchObject({ status: "completed", attempts: 3 });
    expect(
      mockState.value.canonicalEvidenceObjects.filter((item) =>
        item.evidence_type === "photo_session" &&
        item.provenance?.evidence_package_ids?.includes(
          review.interpretedEvidence.package_id
        )
      )
    ).toHaveLength(1);
    expect(
      mockState.value.canonicalEvidenceObjects.filter((item) =>
        item.evidence_type === "progress_photo" &&
        item.lastObservedAt === "2026-08-08"
      )
    ).toHaveLength(5);
    expect(
      mockState.value.canonicalEvidenceObjects.filter((item) =>
        (item.payload ?? item).evidence_type === "nutrition"
      )
    ).toEqual(nutritionBefore);
    expect(redirect).toHaveBeenCalledWith("/check-in/morning");
  });

  it("returns a retryable failure to the paused review instead of a generic server error", async () => {
    mockState.value = createFailedPhotoReviewState(runtimeStore, {
      atomicCommitPersisted: false,
    });
    mockState.value.evidenceReviews[0].commitProgress = {};
    mockState.value.canonicalCommitError = new Error("temporary commit failure");
    const review = mockState.value.evidenceReviews[0];

    await expect(confirmEvidenceReview(confirmationForm(review)))
      .resolves.toBeUndefined();

    expect(mockState.value.canonicalCommitCalls).toBe(1);
    expect(mockState.value.evidenceReviews[0]).toMatchObject({
      status: "commit_failed",
      commitError: expect.stringContaining("canonical_commit"),
    });
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/evidence/review/${review.id}?resume=paused`)
    );
    expect(redirect).not.toHaveBeenCalledWith("/check-in/morning");
  });

  it("resumes goal evaluation with an optional metric key without replaying completed steps", async () => {
    const state = createIsolatedReviewState(runtimeStore);
    const review = state.evidenceReviews[0];
    const completedBefore = [
      "canonical_commit",
      "compatibility_writes",
      "scheduled_completion",
      "analysis",
      "training_performance_events",
    ];
    review.status = "partially_committed";
    review.confirmation = null;
    review.commitError = "goal_evaluation: metricKey was not JSON serializable";
    review.commitProgress = Object.fromEntries([
      ...completedBefore.map((step) => [step, {
        status: "completed",
        attempts: 1,
        result: { status: "completed" },
      }]),
      ["goal_evaluation", {
        status: "failed",
        attempts: 1,
        retryable: true,
      }],
    ]);
    state.goals = [{
      id: "goal_optional_metric",
      title: "Optional metric goal",
      type: "habit",
      primary: false,
      status: "active",
    }];
    state.enforceCanonicalJson = true;
    state.canonicalCommitCalls = 0;
    const canonicalBefore = structuredClone(state.canonicalEvidenceObjects);
    mockState.value = state;

    await expect(confirmEvidenceReview(confirmationForm(review)))
      .resolves.toBeUndefined();

    const confirmed = mockState.value.evidenceReviews[0];
    expect(confirmed.status).toBe("confirmed");
    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.canonicalEvidenceObjects).toEqual(canonicalBefore);
    for (const step of completedBefore) {
      expect(confirmed.commitProgress[step].attempts).toBe(1);
    }
    expect(confirmed.commitProgress.goal_evaluation).toMatchObject({
      status: "completed",
      attempts: 2,
    });
    expect(confirmed.commitProgress.event_eligibility.status).toBe("completed");
    expect(confirmed.commitProgress.briefing.status).toBe("completed");
    expect(confirmed.commitProgress.home_refresh.status).toBe("completed");
    expect(mockState.value.analyses).toContainEqual(expect.objectContaining({
      id: `goal_evaluation_${review.interpretedEvidence.package_id}`,
      metadata: expect.objectContaining({
        evaluations: [expect.objectContaining({ metricKey: null })],
      }),
    }));
  });

  it("releases a one-step recovery claim before an actual Next redirect without falsely failing the commit", async () => {
    mockState.value = createDurableContinuationState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];

    await expectNextRedirect(
      confirmEvidenceReview(confirmationForm(review)),
      `/evidence/review/${review.id}?saved=1`
    );

    const continued = mockState.value.evidenceReviews[0];
    expect(continued.commitProgress.event_eligibility).toMatchObject({
      status: "completed",
      attempts: 1,
    });
    expect(continued.commitClaim.status).toBe("available");
    expect(mockState.value.pauseCommitCalls).toBe(1);
    expect(mockState.value.failCommitCalls).toBe(0);
    expect(mockState.value.canonicalCommitCalls).toBe(0);
  });

  it("continues the exact six-step-complete incident state to final confirmation one step per request", async () => {
    mockState.value = createDurableContinuationState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];
    const initialAttempts = Object.fromEntries(
      Object.entries(review.commitProgress).map(([step, progress]) => [step, progress.attempts])
    );
    const canonicalBefore = structuredClone(mockState.value.canonicalEvidenceObjects);

    await expect(continueInBackground(review, 1)).resolves.toMatchObject({ state: "processing" });
    expect(mockState.value.evidenceReviews[0].commitProgress.event_eligibility.status)
      .toBe("completed");

    await expect(continueInBackground(review, 2)).resolves.toMatchObject({ state: "processing" });
    expect(mockState.value.evidenceReviews[0].commitProgress.briefing.status)
      .toBe("completed");

    await expect(continueInBackground(review, 3)).resolves.toMatchObject({ state: "confirmed" });

    const confirmed = mockState.value.evidenceReviews[0];
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmation?.confirmedAt).toBeTruthy();
    expect(confirmed.commitProgress.home_refresh).toMatchObject({
      status: "completed",
      attempts: 1,
    });
    for (const [step, attempts] of Object.entries(initialAttempts)) {
      expect(confirmed.commitProgress[step].attempts).toBe(attempts);
    }
    expect(mockState.value.claimCalls).toBe(3);
    expect(mockState.value.pauseCommitCalls).toBe(2);
    expect(mockState.value.completeCommitCalls).toBe(1);
    expect(mockState.value.failCommitCalls).toBe(0);
    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.canonicalEvidenceObjects).toEqual(canonicalBefore);

    const countsBeforeStaleDelivery = {
      claims: mockState.value.claimCalls,
      completions: mockState.value.completeCommitCalls,
    };
    await expect(continueEvidenceReviewInBackground({
      reviewId: review.id,
      continuationKey: `${review.id}:stale`,
      messageId: "message-stale",
    })).resolves.toMatchObject({ state: "stale" });
    expect(mockState.value.claimCalls).toBe(countsBeforeStaleDelivery.claims);
    expect(mockState.value.completeCommitCalls).toBe(countsBeforeStaleDelivery.completions);
  });

  it("reclaims an expired started Training-event step and skips every completed predecessor", async () => {
    mockState.value = createDurableContinuationState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];
    const completedSteps = [
      "canonical_commit",
      "compatibility_writes",
      "scheduled_completion",
      "analysis",
    ];
    review.commitProgress = Object.fromEntries([
      ...completedSteps.map((step) => [step, review.commitProgress[step]]),
      ["training_performance_events", {
        status: "started",
        attempts: 1,
        startedAt: "2026-08-29T15:41:23.954Z",
      }],
    ]);
    review.commitClaim = {
      operationId: "c024a5ab-cc61-41ac-98f7-584efc6eef3f",
      status: "in_progress",
      claimedAt: "2026-08-29T15:41:23.954Z",
      leaseExpiresAt: "2026-08-29T15:51:23.954Z",
      packageId: review.interpretedEvidence.package_id,
    };
    const analysisId = `analysis_training_${review.interpretedEvidence.package_id}`;
    review.commitProgress.analysis.result = {
      status: "completed",
      analysisIds: [analysisId],
    };
    mockState.value.analyses = [{
      id: analysisId,
      createdAt: "2026-08-29T15:40:04.886Z",
      metadata: { trainingPerformance: { exerciseObservations: [] } },
    }];
    const canonicalBefore = structuredClone(mockState.value.canonicalEvidenceObjects);
    const predecessorAttempts = Object.fromEntries(completedSteps.map((step) => [
      step,
      review.commitProgress[step].attempts,
    ]));

    await expect(continueInBackground(review, 1)).resolves.toMatchObject({ state: "processing" });

    expect(review.commitProgress.training_performance_events).toMatchObject({
      status: "completed",
      attempts: 2,
      result: {
        status: "completed",
        newlyCreatedEvents: [],
        existingEvents: [],
      },
    });
    for (const [step, attempts] of Object.entries(predecessorAttempts)) {
      expect(review.commitProgress[step].attempts).toBe(attempts);
    }
    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.canonicalEvidenceObjects).toEqual(canonicalBefore);
    expect(review.commitClaim.status).toBe("available");
    expect(mockState.value.pauseCommitCalls).toBe(1);
    expect(mockState.value.failCommitCalls).toBe(0);
  });

  it("recovers an expired pre-first-step claim only after zero-side-effect proof and completes once", async () => {
    mockState.value = createExpiredFirstStepRecoveryState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];

    await expectNextRedirect(
      confirmEvidenceReview(confirmationForm(review)),
      "saved=1"
    );
    for (let request = 1; request < 12 && review.status !== "confirmed"; request += 1) {
      await continueInBackground(review, request);
    }

    expect(review.status).toBe("confirmed");
    expect(mockState.value.canonicalCommitCalls).toBe(1);
    expect(mockState.value.claimCalls).toBe(9);
    expect(mockState.value.pauseCommitCalls).toBe(8);
    expect(mockState.value.completeCommitCalls).toBe(1);
    expect(mockState.value.failCommitCalls).toBe(0);
    expect(review.commitProgress.canonical_commit).toMatchObject({
      status: "completed",
      attempts: 1,
    });
    expect(Object.values(review.commitProgress).every(
      (progress) => progress.status === "completed"
    )).toBe(true);
    const packageId = review.interpretedEvidence.package_id;
    const packageRecords = mockState.value.canonicalEvidenceObjects.filter((item) =>
      item.provenance?.evidence_package_ids?.includes(packageId)
    );
    expect(packageRecords).toHaveLength(
      review.interpretedEvidence.evidence_objects.filter((item) => item.removed !== true).length
    );
    expect(new Set(packageRecords.map((item) => item.canonicalId)).size)
      .toBe(packageRecords.length);
  });

  it("reconciles a committed first step whose progress marker was lost without replaying canonical mutation", async () => {
    mockState.value = createExpiredFirstStepRecoveryState(runtimeStore, {
      canonicalCommitPersisted: true,
    });
    const review = mockState.value.evidenceReviews[0];
    const canonicalBefore = structuredClone(mockState.value.canonicalEvidenceObjects);

    await expectNextRedirect(
      confirmEvidenceReview(confirmationForm(review)),
      "saved=1"
    );

    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.canonicalEvidenceObjects).toEqual(canonicalBefore);
    expect(review.commitProgress.canonical_commit).toMatchObject({
      status: "completed",
      attempts: 2,
      result: expect.objectContaining({
        recoveredFromDurableSource: true,
      }),
    });
    expect(review.commitClaim.status).toBe("available");
    expect(mockState.value.pauseCommitCalls).toBe(1);
    expect(mockState.value.failCommitCalls).toBe(0);
  });

  it("still records and fails a genuine progress-persistence error before redirecting to retry", async () => {
    mockState.value = createDurableContinuationState(runtimeStore);
    mockState.value.recordProgressError = new Error("durable progress unavailable");
    const review = mockState.value.evidenceReviews[0];

    await expectNextRedirect(
      confirmEvidenceReview(confirmationForm(review)),
      `/evidence/review/${review.id}?saved=1&processing=attention`
    );

    const failed = mockState.value.evidenceReviews[0];
    expect(failed.status).toBe("partially_committed");
    expect(failed.commitProgress.event_eligibility).toMatchObject({
      status: "failed",
      attempts: 1,
      retryable: true,
    });
    expect(failed.commitClaim.status).toBe("failed");
    expect(mockState.value.failCommitCalls).toBe(1);
    expect(mockState.value.pauseCommitCalls).toBe(0);
  });

  it("publishes the Photo Event without Confidence when the goal contract is ineligible", async () => {
    mockState.value = createBriefingFailedPhotoReviewState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];
    mockState.value.photoNarrativeError = Object.assign(
      new Error(
        "Production Confidence context incomplete: canonical_goal_objective_incomplete."
      ),
      { code: "canonical_goal_objective_incomplete" }
    );

    await expect(confirmEvidenceReview(confirmationForm(review)))
      .resolves.toBeUndefined();

    const completed = mockState.value.evidenceReviews[0];
    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.photoNarrativeCalls).toBe(1);
    expect(mockState.value.photoNarrativeWithoutConfidenceCalls).toBe(1);
    expect(completed.status).toBe("confirmed");
    expect(completed.commitProgress.briefing).toMatchObject({
      status: "completed",
      attempts: 3,
      result: {
        status: "completed",
        freshness: "event_generated",
        deferredReasons: ["canonical_goal_objective_incomplete"],
        artifactIds: [
          "event_briefing_progress_photo_photo_session_user_founder_001_2026-08-08",
        ],
      },
    });
    expect(completed.commitProgress.home_refresh.status).toBe("completed");
    expect(redirect).toHaveBeenCalledWith("/check-in/morning");

    const completedSnapshot = structuredClone(completed);
    redirect.mockClear();
    await expect(confirmEvidenceReview(confirmationForm(completed)))
      .resolves.toBeUndefined();

    expect(mockState.value.evidenceReviews[0]).toEqual(completedSnapshot);
    expect(mockState.value.photoNarrativeCalls).toBe(1);
    expect(mockState.value.photoNarrativeWithoutConfidenceCalls).toBe(1);
    expect(redirect).toHaveBeenCalledWith("/check-in/morning");
  });

  it("keeps an unexpected photo briefing failure paused and retryable", async () => {
    mockState.value = createBriefingFailedPhotoReviewState(runtimeStore);
    const review = mockState.value.evidenceReviews[0];
    mockState.value.photoNarrativeError = Object.assign(
      new Error("photo provider unavailable"),
      { code: "photo_provider_unavailable" }
    );

    await expect(confirmEvidenceReview(confirmationForm(review)))
      .resolves.toBeUndefined();

    expect(mockState.value.evidenceReviews[0]).toMatchObject({
      status: "partially_committed",
      commitError: expect.stringContaining("photo provider unavailable"),
      commitProgress: {
        briefing: {
          status: "failed",
          attempts: 3,
          retryable: true,
        },
      },
    });
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/evidence/review/${review.id}?saved=1&processing=attention`)
    );
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

describe("reprocessEvidenceReview", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    redirect.mockReset();
    mockState.value = createIsolatedReviewState(runtimeStore);
    mockState.value.evidenceReviews[0].status = "pending";
    mockState.value.evidenceReviews[0].confirmation = null;
    mockState.value.evidenceReviews[0].commitProgress = {};
  });

  it.each([
    ["updated", { changed: true, idempotent: false }],
    ["current", { changed: false, idempotent: true }],
  ])("redirects a %s result to explicit feedback and revalidates the review", async (outcome, result) => {
    mockState.value.reprocessResult = result;
    const review = mockState.value.evidenceReviews[0];
    const formData = { get: (key) => key === "reviewId" ? review.id : null };

    await expect(reprocessEvidenceReview(formData)).resolves.toBeUndefined();

    expect(revalidatePath).toHaveBeenCalledWith(`/evidence/review/${review.id}`);
    expect(redirect).toHaveBeenCalledWith(`/evidence/review/${review.id}?reprocess=${outcome}`);
    expect(review.status).toBe("pending");
  });

  it("redirects a failed re-read to visible feedback without changing the review", async () => {
    const review = mockState.value.evidenceReviews[0];
    const before = structuredClone(review);
    mockState.value.reprocessError = Object.assign(new Error("provider unavailable"), {
      code: "PROVIDER_UNAVAILABLE",
    });
    const formData = { get: (key) => key === "reviewId" ? review.id : null };

    await expect(reprocessEvidenceReview(formData)).resolves.toBeUndefined();

    expect(mockState.value.evidenceReviews[0]).toEqual(before);
    expect(revalidatePath).toHaveBeenCalledWith(`/evidence/review/${review.id}`);
    expect(redirect).toHaveBeenCalledWith(`/evidence/review/${review.id}?reprocess=failed`);
  });
});
