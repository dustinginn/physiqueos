import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEvidenceReviewContinuationKey } from "../../../../domain/services/EvidenceReviewBackgroundContinuation";
import { createDurableOutboxWorker } from "../../../../platform/jobs/DurableOutboxWorker";
import { createEvidenceReviewContinuationWorkerHandler } from "../../../../platform/jobs/EvidenceReviewContinuationWorker";

// Regression for the real Build 46 Progress Photos confirmation that stayed in
// "Processing" for more than 20 minutes.
//
// Root cause, measured against the real production runtime (52.6 MB of
// canonical JSON): the analysis step read its Goal context through four
// concurrent repository reads outside any read scope, and each concurrent read
// loads and clones the ENTIRE runtime (about 150 MB retained). Four at once
// exhausted the 1 GB worker's ~500 MB heap, the process died, its lease expired,
// and the same message was re-claimed and died again, forever, with the review
// still `committing`. The five ProRAW/DNG originals (38-44 MB each) were never
// the cause: analysis reads the 0.6 MB JPEG derivatives.
//
// Fixtures are synthetic. No Founder record or image is reproduced.

const OWNER = "user_photo_analysis_regression";
const REVIEW_ID = "evidence_review_photo_analysis_regression";
const PACKAGE_ID = "evidence_submission_photo_analysis_regression_progress_photos";
const OBJECT_ID = "photo_session_object_regression";
const DATE = "2026-09-19";
const SESSION_ID = `photo_session_${OWNER}_${DATE}`;
const POSES = Object.freeze([
  ["front", "flexed"], ["rear", "relaxed"], ["rear", "flexed"], ["right_side", "relaxed"], ["front", "relaxed"],
]);
const PLAIN_POSE_KEYS = Object.freeze(POSES.map(([view, pose]) => `${view}_${pose}`));

const revalidatePath = vi.fn();
const mockState = vi.hoisted(() => ({ value: null }));

vi.mock("next/cache.js", () => ({ revalidatePath }));
vi.mock("next/navigation.js", () => ({
  redirect(destination) {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: destination });
  },
}));

vi.mock("../../../../data/repositories/founderRepositories", () => {
  const getState = () => mockState.value;
  function requireActiveClaim(reviewId, operationId) {
    const review = getState().review;
    if (review.id !== reviewId || review.status !== "committing" ||
        review.commitClaim?.status !== "in_progress" || review.commitClaim.operationId !== operationId) {
      throw Object.assign(new Error("The evidence review confirmation claim is no longer active."), {
        code: review.status === "committing" ? "COMMIT_CLAIM_LOST" : "REVIEW_NOT_COMMITTING",
      });
    }
    return review;
  }
  return {
    FounderRepositories: {
      users: { async getCurrentUser() { return { id: OWNER }; } },
      evidenceReviews: {
        async getReviewById(reviewId) {
          const review = getState().review;
          return review.id === reviewId ? structuredClone(review) : null;
        },
        async claimEvidenceReviewCommit(reviewId, lifecycle) {
          const review = getState().review;
          review.status = "committing";
          review.commitError = null;
          review.commitClaim = {
            operationId: lifecycle.operationId, status: "in_progress", claimedAt: lifecycle.claimedAt,
            leaseExpiresAt: lifecycle.leaseExpiresAt, packageId: lifecycle.packageId,
          };
          return structuredClone(review);
        },
        async recordEvidenceReviewCommitProgress(reviewId, { operationId, key, value, leaseExpiresAt }) {
          const review = requireActiveClaim(reviewId, operationId);
          review.commitProgress = { ...(review.commitProgress ?? {}), [key]: structuredClone(value) };
          review.commitClaim = { ...review.commitClaim, leaseExpiresAt };
          return structuredClone(review);
        },
        async releaseEvidenceReviewCommit(reviewId, { operationId, releasedAt }) {
          const review = requireActiveClaim(reviewId, operationId);
          getState().releaseCalls += 1;
          review.commitClaim = { ...review.commitClaim, status: "available", releasedAt, leaseExpiresAt: releasedAt };
          return structuredClone(review);
        },
        async completeEvidenceReviewCommit(reviewId, { operationId, confirmation, interpretedEvidence }) {
          const review = requireActiveClaim(reviewId, operationId);
          getState().completeCalls += 1;
          review.status = "confirmed";
          review.interpretedEvidence = structuredClone(interpretedEvidence);
          review.confirmation = structuredClone(confirmation);
          review.commitClaim = { ...review.commitClaim, status: "completed" };
          return structuredClone(review);
        },
        async failEvidenceReviewCommit(reviewId, { operationId, error, failedAt }) {
          const review = requireActiveClaim(reviewId, operationId);
          getState().failCalls += 1;
          review.status = Object.values(review.commitProgress ?? {})
            .some((step) => step?.status === "completed") ? "partially_committed" : "commit_failed";
          review.commitError = String(error);
          review.commitClaim = { ...review.commitClaim, status: "failed", failedAt };
          return structuredClone(review);
        },
      },
      canonicalEvidence: {
        async listCanonicalEvidenceObjects() { return structuredClone(getState().canonicalEvidenceObjects); },
      },
      analyses: {
        async createAnalysis(analysis) { getState().unboundedAnalysisWrites.push(analysis.id); return analysis; },
        async getAnalysisById(id) { return getState().analyses.find((item) => item.id === id) ?? null; },
      },
      progressPhotos: {
        async listPhotos() { return []; },
        async getPhotosByDate() { getState().unboundedPhotoReads += 1; return []; },
        async upsertPhoto() { getState().unboundedPhotoWrites += 1; return null; },
      },
      weights: { async listWeightEntries() { return []; } },
      dexaScans: { async listDEXAScans() { return []; } },
      goals: { async listGoals() { return []; } },
      protocols: { async listProtocols() { return []; } },
      nutritionContext: { async getNutritionContext() { return null; } },
      reminders: { async completeReminderFromEvidence() { return null; } },
      trainingPerformanceEvents: { async getTrainingPerformanceEventById() { return null; } },
      briefingReconciliationWorkItems: { async listWorkItems() { return []; } },
    },
  };
});

vi.mock("../../../../application/composition/productionApplicationComposition", () => ({
  getProductionEvidenceReviewReadService: () => ({}),
}));

vi.mock("../../../../application/read-models/EvidenceConfirmationReadService", () => ({
  createEvidenceConfirmationReadService: () => ({
    async readGoalEvaluationInputs() {
      return { goals: [], dexaScans: [], weightEntries: [], progressPhotos: [], protocols: [], nutritionContext: null };
    },
    async readEventBriefingPreferences() { return { photo: true, dexa: true }; },
    async readTrainingPerformanceEventInputs() { return null; },
    async readPhotoEventContext(input) {
      mockState.value.contextReads.push(input);
      mockState.value.assertScopeIdleAtRead?.();
      return { evidenceDate: input.evidenceDate, activeGoal: null, activePhase: null, operatingState: null, completedPriorGoal: null, latestCompletedDexa: null, futureMilestone: null };
    },
  }),
}));

// The stored-media loader is the only thing that would ever touch bytes. It
// records every reference so the test can prove which artifacts were read.
vi.mock("../../../../application/media/ApplicationUploadService", () => ({
  createApplicationStoredArtifactLoader: () => async ({ artifact }) => {
    mockState.value.mediaReads.push({ reference: artifact.storage_path, declared: artifact.mime_type ?? null });
    const media = mockState.value.media[artifact.storage_path];
    if (!media) throw new Error(`Unexpected media read: ${artifact.storage_path}`);
    return { buffer: media.buffer, contentType: media.contentType };
  },
}));

vi.mock("../../../../domain/interpreters/PhotoInterpreterService", () => ({
  async interpretPhotoSetWithVision({ photos, previousPhotoSet }) {
    mockState.value.visionCalls.push({
      current: photos.map((photo) => photo.dataUrl.slice(0, 40)),
      prior: (previousPhotoSet?.photos ?? []).map((photo) => photo.dataUrl.slice(0, 40)),
    });
    mockState.value.beforeVision?.(mockState.value.visionCalls.length);
    return {
      provider: "openai",
      warning: null,
      interpretation: {
        interpreter_version: "test-interpreter",
        user_facing_summary: "Synthetic interpretation.",
        structured_observations: [{ region: "midsection", change: "unchanged" }],
      },
    };
  },
}));

vi.mock("../../../../domain/services/PhotoPrioritySatisfactionService", () => ({
  async satisfyPhotoPriorityFromCanonicalSession() {
    mockState.value.priorityCompletions += 1;
    return { record: { id: `reminder_weekly_progress_photo_set:${DATE}` } };
  },
}));

vi.mock("../../../../application/composition/productionPhotoEventNarrativeComposition", () => ({
  createProductionPhotoEventNarrativeService: async () => ({
    async getOrCreateResult({ sessionId }) {
      const id = `event_briefing_progress_photo_${sessionId}`;
      const created = !mockState.value.briefings.includes(id);
      if (created) mockState.value.briefings.push(id);
      return { status: "completed", artifactId: id, sessionId, created };
    },
  }),
}));

vi.mock("../../../../application/composition/productionDEXAEventNarrativeComposition", () => ({
  createProductionDEXAEventNarrativeService: async () => ({ async generate() { return null; } }),
}));

vi.mock("../../../../domain/services/CanonicalEvidenceConfirmationCommitService", () => ({
  createCanonicalEvidenceConfirmationCommitService: () => ({
    async commitConfirmedEvidencePackage() { throw new Error("canonical_commit must not be replayed"); },
  }),
}));

vi.mock("../../../../domain/services/TrainingPerformanceEventPersistenceService", () => ({
  createTrainingPerformanceEventPersistenceService: () => ({ async persistEventBatch() { return { outcome: "no_events" }; } }),
  TrainingPerformanceEventPersistenceOutcome: {
    COLLISION: "collision", CONCURRENCY_CONFLICT: "concurrency_conflict", PERSISTENCE_FAILURE: "persistence_failure",
    COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure", NO_EVENTS: "no_events",
  },
}));

vi.mock("../../../../domain/services/PILowerLevelConfidenceWorkEnqueueService", () => ({
  createPILowerLevelConfidenceWorkEnqueueService: () => ({ stageTrainingFinalization() {}, stageEnergySourceChange() {} }),
  isPIEnergyConfidenceEnqueueEnabled: () => false,
  isPITrainingConfidenceEnqueueEnabled: () => false,
}));

vi.mock("../../../../domain/services/PendingEvidenceReviewReprocessingService", () => ({
  createPendingEvidenceReviewReprocessingService: () => ({ async reprocessPendingReviewInPlace() { return { changed: false }; } }),
}));

// The bounded runtime mutation. It applies the mutation to ONLY the requested
// collections, which is what the production composition does, and records what
// was requested so the test can prove nothing wider was loaded or rewritten.
vi.mock("../../../../application/runtime/ApplicationCanonicalRuntime", () => ({
  loadApplicationCanonicalCommitBindings: async () => ({
    async mutateCanonicalRuntime(input) {
      const state = mockState.value;
      state.boundedWrites.push({
        operation: input.operation,
        allowedCollections: [...input.allowedCollections],
        readCollections: [...input.readCollections],
        readApplicationContext: input.readApplicationContext,
        allowApplicationContextMutation: input.allowApplicationContextMutation,
      });
      const candidate = Object.fromEntries(input.readCollections.map((name) => [name, [...(state.collections[name] ?? [])]]));
      const result = await input.mutate(candidate, { commandId: "test-command" });
      for (const name of input.allowedCollections) state.collections[name] = candidate[name];
      if (state.collections.analyses) state.analyses = state.collections.analyses;
      return { committed: true, revision: 1, result: structuredClone(result) };
    },
  }),
}));

const { continueEvidenceReviewInBackground, abandonEvidenceReviewContinuation } = await import("./actions.js");

function photoObject() {
  return {
    id: OBJECT_ID,
    evidence_type: "photo_session",
    observed_at: `${DATE}T12:00:00.000Z`,
    intendedLocalDate: DATE,
    created_at: `${DATE}T12:00:00.000Z`,
    captureMetadata: { capturedAt: `${DATE}T12:00:00.000Z`, timeOfDay: "morning" },
    conditions: {},
    goalRelationship: { goalIds: [] },
    photos: POSES.map(([view, pose], index) => ({
      id: `photo_${index}`,
      view,
      pose,
      active: true,
      identityStatus: "confirmed",
      userConfirmedIdentity: true,
      storage_path: `media://dng-original-${index}`,
      mime_type: "image/x-adobe-dng",
      analysis_storage_path: `media://jpeg-derivative-${index}`,
      analysis_mime_type: "image/jpeg",
      source_hash: `hash_${index}`,
    })),
  };
}

function canonicalObjects(evidencePackage) {
  const [object] = evidencePackage.evidence_objects;
  const session = {
    canonicalId: SESSION_ID,
    userId: OWNER,
    evidence_type: "photo_session",
    quality: { status: "active" },
    firstObservedAt: DATE,
    lastObservedAt: DATE,
    provenance: { evidence_package_ids: [PACKAGE_ID], contributing_evidence_object_ids: [object.id] },
    payload: { ...structuredClone(object), photos: structuredClone(object.photos) },
  };
  // One earlier front/relaxed canonical photo so the prior-comparison path runs.
  const prior = {
    canonicalId: "canonical_photo_prior_front_relaxed",
    userId: OWNER,
    evidence_type: "progress_photo",
    quality: { status: "active" },
    lastObservedAt: "2026-08-22",
    payload: { view: "front", pose: "relaxed", storage_path: "media://prior-jpeg", mime_type: "image/jpeg" },
  };
  return [session, prior];
}

function createState({ completed = ["canonical_commit"], claimOperation = "evidence-review-background:previous" } = {}) {
  const evidencePackage = {
    package_id: PACKAGE_ID,
    evidence_objects: [photoObject()],
    review_metadata: { confirmedAt: `${DATE}T12:30:00.000Z`, sourceReviewId: REVIEW_ID },
  };
  const commitProgress = {};
  for (const step of completed) {
    commitProgress[step] = {
      status: "completed", attempts: 1, completedAt: "2026-09-20T15:18:11.000Z",
      result: step === "canonical_commit" ? { status: "completed", canonicalEvidenceIds: [SESSION_ID] } : { status: "completed" },
    };
  }
  const media = { "media://prior-jpeg": { buffer: Buffer.alloc(4 * 1024 * 1024, 1), contentType: "image/jpeg" } };
  POSES.forEach((_, index) => {
    // A ProRAW original is tens of MB. Keep the fixture small: what matters is the
    // declared type, and that nothing ever reads these references.
    media[`media://dng-original-${index}`] = { buffer: Buffer.alloc(64, 9), contentType: "image/x-adobe-dng" };
    media[`media://jpeg-derivative-${index}`] = { buffer: Buffer.alloc(600 * 1024, index + 1), contentType: "image/jpeg" };
  });
  return {
    review: {
      id: REVIEW_ID, userId: OWNER, status: "committing", createdAt: "2026-09-20T13:50:08.950Z",
      updatedAt: "2026-09-20T15:20:00.000Z", confirmation: null, commitError: null,
      interpretedEvidence: evidencePackage, itemDecisions: {}, commitProgress,
      commitClaim: {
        operationId: claimOperation, status: "available", claimedAt: "2026-09-20T15:18:00.000Z",
        releasedAt: "2026-09-20T15:18:11.000Z", leaseExpiresAt: "2026-09-20T15:18:11.000Z", packageId: PACKAGE_ID,
      },
    },
    canonicalEvidenceObjects: canonicalObjects(evidencePackage),
    media, collections: { analyses: [], progressPhotos: [] }, analyses: [],
    boundedWrites: [], contextReads: [], mediaReads: [], visionCalls: [], briefings: [],
    unboundedAnalysisWrites: [], unboundedPhotoReads: 0, unboundedPhotoWrites: 0,
    priorityCompletions: 0, releaseCalls: 0, completeCalls: 0, failCalls: 0,
  };
}

async function runNext(messageId, options = {}) {
  const review = mockState.value.review;
  return continueEvidenceReviewInBackground({
    reviewId: REVIEW_ID,
    continuationKey: createEvidenceReviewContinuationKey(review),
    messageId,
    ...options,
  });
}

async function drain({ limit = 12, ...options } = {}) {
  const outcomes = [];
  for (let index = 0; index < limit && mockState.value.review.status !== "confirmed"; index += 1) {
    outcomes.push(await runNext(`message-${index}`, options));
  }
  return outcomes;
}

describe("photo analysis continuation memory and ownership contract", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.value = createState();
  });

  it("analyzes a five-photo ProRAW/DNG session from the JPEG derivatives and never reads an original", async () => {
    await drain();

    const references = mockState.value.mediaReads.map((read) => read.reference);
    expect(references.filter((reference) => reference.startsWith("media://dng-original"))).toEqual([]);
    for (let index = 0; index < POSES.length; index += 1) {
      expect(references).toContain(`media://jpeg-derivative-${index}`);
    }
    // Five current derivatives plus the one prior comparison, one at a time.
    expect(mockState.value.visionCalls).toHaveLength(5);
    expect(references.filter((reference) => reference === "media://prior-jpeg")).toHaveLength(1);
    // Every request carried a JPEG data URL, never a DNG one.
    for (const call of mockState.value.visionCalls) {
      expect(call.current.every((url) => url.startsWith("data:image/jpeg;base64,"))).toBe(true);
    }
  });

  it("reads the Goal context inside one scoped read instead of four concurrent runtime loads", async () => {
    await drain();
    expect(mockState.value.contextReads).toHaveLength(1);
    expect(mockState.value.contextReads[0]).toMatchObject({ userId: OWNER, evidenceDate: DATE });
  });

  it("persists the whole session's analyses in one bounded write of only the analyses collection", async () => {
    await drain();

    const analysisWrites = mockState.value.boundedWrites.filter((write) => write.operation === "evidence-confirmation-analysis-persistence");
    // One write for the photo session, one for the goal-evaluation record.
    expect(analysisWrites).toHaveLength(2);
    for (const write of analysisWrites) {
      expect(write.allowedCollections).toEqual(["analyses"]);
      expect(write.readCollections).toEqual(["analyses"]);
      expect(write.readApplicationContext).toBe(false);
      expect(write.allowApplicationContextMutation).toBe(false);
    }
    expect(mockState.value.unboundedAnalysisWrites).toEqual([]);
    // Five per-view analyses, one synthesis, one goal evaluation.
    expect(mockState.value.analyses).toHaveLength(7);
    expect(mockState.value.analyses.filter((item) => item.metadata?.photoSessionSynthesis)).toHaveLength(1);
  });

  it("writes the five compatibility photo rows through one bounded progressPhotos write", async () => {
    await drain();

    const photoWrites = mockState.value.boundedWrites.filter((write) => write.operation === "evidence-confirmation-progress-photo-persistence");
    expect(photoWrites).toHaveLength(1);
    expect(photoWrites[0].allowedCollections).toEqual(["progressPhotos"]);
    expect(mockState.value.unboundedPhotoWrites).toBe(0);
    expect(mockState.value.unboundedPhotoReads).toBe(0);
    expect(mockState.value.collections.progressPhotos.map((photo) => photo.id).sort()).toHaveLength(new Set(PLAIN_POSE_KEYS).size);
  });

  it("reaches confirmed exactly once with the priority, Event, and Briefing each created once", async () => {
    await drain();

    const review = mockState.value.review;
    expect(review.status).toBe("confirmed");
    expect(mockState.value.completeCalls).toBe(1);
    expect(mockState.value.priorityCompletions).toBe(1);
    expect(mockState.value.briefings).toEqual([`event_briefing_progress_photo_${SESSION_ID}`]);
    expect(mockState.value.failCalls).toBe(0);
    for (const [step, value] of Object.entries(review.commitProgress)) {
      expect(value.status, step).toBe("completed");
      expect(value.attempts, step).toBe(1);
    }
    // The canonical PhotoSession and its photos are untouched by continuation.
    expect(mockState.value.canonicalEvidenceObjects).toHaveLength(2);
  });

  it("resumes analysis after prior interrupted attempts and replays the same stable analysis ids", async () => {
    // The production shape: canonical_commit, compatibility_writes, and
    // scheduled_completion done; analysis started five times and never finished.
    mockState.value = createState({ completed: ["canonical_commit", "compatibility_writes", "scheduled_completion"] });
    mockState.value.review.commitProgress.analysis = { status: "started", attempts: 5, startedAt: "2026-09-20T15:38:23.855Z" };
    mockState.value.review.commitClaim = {
      operationId: "evidence-review-background:aedcb3bc", status: "in_progress", claimedAt: "2026-09-20T15:38:18.000Z",
      leaseExpiresAt: "2026-09-20T15:48:18.000Z", packageId: PACKAGE_ID,
    };

    const first = await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: "stale-key-is-bypassed-for-the-owning-operation", messageId: "aedcb3bc",
    });
    expect(first).toMatchObject({ state: "processing", completedStep: "analysis" });
    expect(mockState.value.review.commitProgress.analysis).toMatchObject({ status: "completed", attempts: 6 });
    const firstIds = mockState.value.analyses.map((item) => item.id).sort();
    expect(firstIds).toHaveLength(6);

    // A lost acknowledgement re-delivers the same message: the step re-runs as a
    // replay and must leave the same analyses, not duplicates.
    mockState.value.review.commitProgress.analysis = { status: "started", attempts: 6, startedAt: "2026-09-20T15:50:00.000Z" };
    mockState.value.review.commitClaim = { ...mockState.value.review.commitClaim, status: "in_progress" };
    mockState.value.review.status = "committing";
    await continueEvidenceReviewInBackground({ reviewId: REVIEW_ID, continuationKey: "x", messageId: "aedcb3bc" });
    expect(mockState.value.analyses.map((item) => item.id).sort()).toEqual(firstIds);
    // Completed compatibility_writes was not repeated.
    expect(mockState.value.boundedWrites.filter((write) => write.operation === "evidence-confirmation-progress-photo-persistence")).toHaveLength(0);
    expect(mockState.value.priorityCompletions).toBe(0);
  });

  it("refuses a photo that has no analysis derivative instead of encoding its DNG original", async () => {
    mockState.value = createState({ completed: ["canonical_commit", "compatibility_writes", "scheduled_completion"] });
    const object = mockState.value.review.interpretedEvidence.evidence_objects[0];
    for (const photo of object.photos) { delete photo.analysis_storage_path; delete photo.analysis_mime_type; }

    await expect(runNext("message-no-derivative")).rejects.toThrow();
    expect(mockState.value.mediaReads).toEqual([]);
    expect(mockState.value.visionCalls).toEqual([]);
    expect(mockState.value.boundedWrites).toEqual([]);
  });

  it("stops before the next vision request when the worker loses its lease, without failing the review", async () => {
    mockState.value = createState({ completed: ["canonical_commit", "compatibility_writes", "scheduled_completion"] });
    let checks = 0;
    const assertLease = () => {
      checks += 1;
      // Ownership disappears after the second photo's request has been sent.
      if (mockState.value.visionCalls.length >= 2) {
        throw Object.assign(new Error("lost"), { code: "OUTBOX_LEASE_LOST" });
      }
    };

    await expect(runNext("message-lease", { assertLease })).rejects.toMatchObject({ code: "OUTBOX_LEASE_LOST" });
    expect(mockState.value.visionCalls).toHaveLength(2);
    expect(checks).toBeGreaterThanOrEqual(3);
    // Nothing was persisted by the zombie attempt, and it did not fail or
    // overwrite the claim a successor may now hold under the same operation id.
    expect(mockState.value.boundedWrites).toEqual([]);
    expect(mockState.value.failCalls).toBe(0);
    expect(mockState.value.review.commitProgress.analysis).toMatchObject({ status: "started" });
    expect(mockState.value.review.status).toBe("committing");
  });

  it("checks ownership before persisting so a stalled worker cannot write after losing its lease", async () => {
    mockState.value = createState({ completed: ["canonical_commit", "compatibility_writes", "scheduled_completion"] });
    // Lease is fine through every vision request, then lost immediately before the write.
    const assertLease = () => {
      if (mockState.value.visionCalls.length >= 5) throw Object.assign(new Error("lost"), { code: "OUTBOX_LEASE_LOST" });
    };
    await expect(runNext("message-late-loss", { assertLease })).rejects.toMatchObject({ code: "OUTBOX_LEASE_LOST" });
    expect(mockState.value.visionCalls).toHaveLength(5);
    expect(mockState.value.boundedWrites).toEqual([]);
  });
});

describe("exhausted continuation becomes observable instead of committing forever", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.value = createState({ completed: ["canonical_commit", "compatibility_writes", "scheduled_completion"] });
    mockState.value.review.commitProgress.analysis = { status: "started", attempts: 6, startedAt: "2026-09-20T15:44:30.855Z" };
    mockState.value.review.commitClaim = {
      operationId: "evidence-review-background:aedcb3bc", status: "in_progress", claimedAt: "2026-09-20T15:44:25.548Z",
      leaseExpiresAt: "2026-09-20T15:54:25.548Z", packageId: PACKAGE_ID,
    };
  });

  it("fails the owning claim to partially_committed and preserves every completed step", async () => {
    const outcome = await abandonEvidenceReviewContinuation({
      reviewId: REVIEW_ID, messageId: "aedcb3bc", errorCode: "OUTBOX_ATTEMPTS_EXHAUSTED",
    });

    expect(outcome).toMatchObject({ state: "failed_observable" });
    const review = mockState.value.review;
    expect(review.status).toBe("partially_committed");
    expect(review.commitError).toContain("OUTBOX_ATTEMPTS_EXHAUSTED");
    expect(review.commitError).toContain("first incomplete step");
    for (const step of ["canonical_commit", "compatibility_writes", "scheduled_completion"]) {
      expect(review.commitProgress[step].status).toBe("completed");
    }
    expect(mockState.value.canonicalEvidenceObjects).toHaveLength(2);
    expect(mockState.value.priorityCompletions).toBe(0);
  });

  it("is a no-op for a stale message whose review already moved on", async () => {
    mockState.value.review.commitClaim = { ...mockState.value.review.commitClaim, operationId: "evidence-review-background:someone-else" };
    await expect(abandonEvidenceReviewContinuation({ reviewId: REVIEW_ID, messageId: "aedcb3bc" }))
      .resolves.toMatchObject({ state: "not_applicable", code: "COMMIT_CLAIM_LOST" });
    expect(mockState.value.review.status).toBe("committing");

    mockState.value.review.status = "confirmed";
    await expect(abandonEvidenceReviewContinuation({ reviewId: REVIEW_ID, messageId: "aedcb3bc" }))
      .resolves.toMatchObject({ state: "not_applicable", code: "REVIEW_NOT_COMMITTING" });
    expect(mockState.value.review.status).toBe("confirmed");
    expect(mockState.value.failCalls).toBe(0);
  });

  it("dead-letters a message that keeps killing the worker and marks the review, end to end", async () => {
    const handlerCalls = [];
    const handler = createEvidenceReviewContinuationWorkerHandler({
      continueReview: async (input) => { handlerCalls.push(input); return continueEvidenceReviewInBackground(input); },
      abandonReview: abandonEvidenceReviewContinuation,
    });
    const store = outboxStore({
      id: "aedcb3bc", topic: "evidence.review.continue", payload_version: "1",
      payload: { reviewId: REVIEW_ID, continuationKey: "k" },
      // Claimed three times already by a process that died each time.
      status: "processing", attempt_count: 3, claimed_by: "old-worker",
      claim_expires_at: new Date(Date.UTC(2026, 8, 20, 15, 45, 0)), due_at: new Date(Date.UTC(2026, 8, 20, 15, 24, 36)),
    });
    const worker = createDurableOutboxWorker({
      store, handlers: { "evidence.review.continue": handler }, workerId: "new-worker", buildId: "build",
      maximumAttempts: 3, clock: () => new Date(Date.UTC(2026, 8, 20, 16, 0, 0)),
    });

    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "dead", persisted: true });
    expect(handlerCalls).toEqual([]);
    expect(store.row).toMatchObject({ status: "dead", last_error_code: "OUTBOX_ATTEMPTS_EXHAUSTED" });
    expect(mockState.value.review.status).toBe("partially_committed");
    expect(mockState.value.review.commitError).toContain("OUTBOX_ATTEMPTS_EXHAUSTED");
    expect(mockState.value.visionCalls).toEqual([]);
  });
});

function outboxStore(seed) {
  const row = structuredClone(seed);
  return {
    row,
    async heartbeat() {},
    async claimNext({ workerId, now, leaseExpiresAt }) {
      if (row.status === "dead" || row.status === "succeeded") return null;
      if (row.status === "processing" && row.claim_expires_at > now) return null;
      Object.assign(row, { status: "processing", claimed_by: workerId, claim_expires_at: leaseExpiresAt, attempt_count: row.attempt_count + 1 });
      return structuredClone(row);
    },
    async acknowledge() { row.status = "succeeded"; return structuredClone(row); },
    async renewLease({ leaseExpiresAt }) { row.claim_expires_at = leaseExpiresAt; return structuredClone(row); },
    async fail({ errorCode, terminal }) {
      Object.assign(row, { status: terminal ? "dead" : "pending", last_error_code: errorCode, claimed_by: null, claim_expires_at: null });
      return structuredClone(row);
    },
  };
}
