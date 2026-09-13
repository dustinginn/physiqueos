import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEvidenceReviewContinuationKey } from "../../../../domain/services/EvidenceReviewBackgroundContinuation";

// Regression for the Build 27 production DEXA confirmation that accepted the
// scan, committed canonical evidence, and then never reached `confirmed`.
//
// Durable confirmation runs ONE post-confirmation step per invocation
// (maxSteps: 1 when the repository supports durable commit claims). So
// `canonical_commit` ran inside the Founder's Confirm request and assigned the
// handler closure's `canonical`; every later step runs in a fresh worker
// process where that closure variable is null and `canonical_commit` is
// skipped as already completed. `commitCompatibilityRepositories` was the only
// consumer that never lazily reloaded it, and only its DEXA branch dereferences
// it (`canonical.find(...)`) — which is why weight/photo/training continuations
// survived and this one died with "Cannot read properties of null".
//
// Fixtures here are synthetic. No Founder record is reproduced.

const OWNER = "user_regression_dexa_resume";
const REVIEW_ID = "evidence_review_dexa_resume_regression";
const PACKAGE_ID = "evidence_package_dexa_resume_regression";
const OBJECT_ID = "dexa_object_regression_1";
const CANONICAL_ID = "canonical_dexa_regression_2026_09_12";
const SCAN_DATE = "2026-09-12";

// Mass figures reconcile so the real DEXA contract accepts them:
// 34.2 + 148.6 + 7.2 = 190.0, and 190 * 18% = 34.2.
const SCAN_METRICS = Object.freeze({
  provider: "Regression Fixture Provider",
  totalMass: { value: 190, unit: "lb" },
  bodyFatPercentage: 18,
  fatMass: { value: 34.2, unit: "lb" },
  leanMass: { value: 148.6, unit: "lb" },
  boneMineralContent: { value: 7.2, unit: "lb" },
  sourceFileId: "media://dexa-regression.pdf",
  provenance: {
    extraction_engine: "dexa-pdf-extractor-regression",
    source_artifact_refs: ["media://dexa-regression.pdf"],
  },
});

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
    if (
      review.id !== reviewId ||
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
          if (review.id !== reviewId) return null;
          getState().claimCalls += 1;
          review.status = "committing";
          review.commitError = null;
          review.commitClaim = {
            operationId: lifecycle.operationId,
            status: "in_progress",
            claimedAt: lifecycle.claimedAt,
            leaseExpiresAt: lifecycle.leaseExpiresAt,
            packageId: lifecycle.packageId,
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
          // The Postgres facade enqueues the next `evidence.review.continue`
          // message here, and ONLY here — never on failure. Counting releases
          // is therefore counting continuations.
          getState().releaseCalls += 1;
          review.commitClaim = {
            ...review.commitClaim, status: "available", releasedAt, leaseExpiresAt: releasedAt,
          };
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
          getState().failErrors.push(String(error));
          review.status = Object.values(review.commitProgress ?? {})
            .some((step) => step?.status === "completed") ? "partially_committed" : "commit_failed";
          review.commitError = String(error);
          review.commitClaim = { ...review.commitClaim, status: "failed", failedAt };
          return structuredClone(review);
        },
      },
      canonicalEvidence: {
        async listCanonicalEvidenceObjects() {
          getState().canonicalReads += 1;
          return structuredClone(getState().canonicalEvidenceObjects);
        },
        async upsertCanonicalEvidenceObjects(objects) {
          getState().canonicalUpserts.push(...objects.map((item) => item.canonicalId));
          return objects;
        },
      },
      analyses: {
        async createAnalysis(analysis) { getState().analyses.push(analysis); return analysis; },
        async getAnalysisById(id) { return getState().analyses.find((item) => item.id === id) ?? null; },
      },
      dexaScans: {
        async listDEXAScans() { return structuredClone(getState().dexaScans); },
        async upsertDEXAScan(scan) {
          getState().dexaUpserts.push(structuredClone(scan));
          getState().dexaScans = [
            ...getState().dexaScans.filter((item) => item.id !== scan.id),
            structuredClone(scan),
          ];
          return scan;
        },
      },
      weights: { async listWeightEntries() { return []; }, async addWeightEntry() { return null; } },
      progressPhotos: { async listPhotos() { return []; }, async getPhotosByDate() { return []; }, async upsertPhoto() { return null; } },
      goals: { async listGoals() { return []; } },
      protocols: { async listProtocols() { return []; } },
      nutritionContext: { async getNutritionContext() { return null; } },
      reminders: { async completeReminderFromEvidence() { return null; } },
      executionItems: { async getExecutionItemById() { return null; }, async saveExecutionItem() { return null; } },
      trainingPerformanceEvents: { async getTrainingPerformanceEventById() { return null; } },
      briefingReconciliationWorkItems: { async listWorkItems() { return []; } },
    },
  };
});

vi.mock("../../../../application/composition/productionApplicationComposition", () => ({
  getProductionEvidenceReviewReadService: () => ({
    async getEditContext(reviewId) {
      const review = mockState.value.review;
      return review.id === reviewId ? { review: structuredClone(review), userId: OWNER } : null;
    },
  }),
}));

vi.mock("../../../../application/read-models/EvidenceConfirmationReadService", () => ({
  createEvidenceConfirmationReadService: () => ({
    async readGoalEvaluationInputs() {
      return { goals: [], dexaScans: [], weightEntries: [], progressPhotos: [], protocols: [], nutritionContext: null };
    },
    async readEventBriefingPreferences() { return { photo: true, dexa: true }; },
    async readTrainingPerformanceEventInputs() { return null; },
  }),
}));

vi.mock("../../../../domain/services/DEXAEventNarrativeService", () => ({
  createFounderDEXAEventNarrativeService: () => ({
    async generate({ scanId }) {
      mockState.value.briefingCalls.push(scanId);
      return { artifactId: `event_briefing_dexa_${scanId}` };
    },
  }),
}));

vi.mock("../../../../domain/services/DEXAInterpretationService", () => ({
  createDEXAInterpretation: ({ canonicalScan }) => ({
    id: `analysis_dexa_${canonicalScan.canonicalId}`,
    createdAt: "2026-09-12T19:00:00.000Z",
    title: "DEXA interpreted",
    evidenceIds: [canonicalScan.canonicalId],
    evidenceTypes: ["dexa"],
    metadata: {},
  }),
}));

vi.mock("../../../../domain/services/DexaAppointmentLifecycleService", () => ({
  async reconcileDexaAppointmentFromConfirmedEvidence() { return { matched: false }; },
  async reconcileHistoricalDexaExecutionFromConfirmedEvidence() { return { matched: false }; },
}));

vi.mock("../../../../domain/services/CanonicalEvidenceConfirmationCommitService", () => ({
  createCanonicalEvidenceConfirmationCommitService: () => ({
    async commitConfirmedEvidencePackage() {
      // A resume must NEVER reach this. Reaching it means canonical_commit was
      // replayed, which would duplicate canonical evidence.
      mockState.value.canonicalCommitCalls += 1;
      throw new Error("canonical_commit must not be replayed on resume");
    },
  }),
}));

vi.mock("../../../../domain/services/TrainingPerformanceEventPersistenceService", () => ({
  createTrainingPerformanceEventPersistenceService: () => ({
    async persistEventBatch() { return { outcome: "no_events", newEvents: [], existingEvents: [], batch: null }; },
  }),
  TrainingPerformanceEventPersistenceOutcome: {
    COLLISION: "collision",
    CONCURRENCY_CONFLICT: "concurrency_conflict",
    PERSISTENCE_FAILURE: "persistence_failure",
    COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
    NO_EVENTS: "no_events",
  },
}));

vi.mock("../../../../domain/services/PILowerLevelConfidenceWorkEnqueueService", () => ({
  createPILowerLevelConfidenceWorkEnqueueService: () => ({ stageTrainingFinalization() {}, stageEnergySourceChange() {} }),
  isPIEnergyConfidenceEnqueueEnabled: () => false,
  isPITrainingConfidenceEnqueueEnabled: () => false,
}));

vi.mock("../../../../application/runtime/ApplicationCanonicalRuntime", () => ({
  loadApplicationCanonicalCommitBindings: async () => ({}),
}));

vi.mock("../../../../application/media/ApplicationUploadService", () => ({
  createApplicationStoredArtifactLoader: () => async () => null,
}));

vi.mock("../../../../application/media/PhotoAnalysisMediaLoader", () => ({
  createPhotoAnalysisMediaLoader: () => async () => null,
}));

vi.mock("../../../../application/composition/productionPhotoEventNarrativeComposition", () => ({
  createProductionPhotoEventNarrativeService: async () => ({ async getOrCreateResult() { return { status: "completed", artifactId: null }; } }),
}));

vi.mock("../../../../domain/services/PendingEvidenceReviewReprocessingService", () => ({
  createPendingEvidenceReviewReprocessingService: () => ({ async reprocessPendingReviewInPlace() { return { changed: false }; } }),
}));

const { beginNativeEvidenceReviewConfirmation, continueEvidenceReviewInBackground } =
  await import("./actions.js");

function dexaEvidenceObject() {
  return { id: OBJECT_ID, evidence_type: "dexa_scan", observed_at: SCAN_DATE, measuredAt: SCAN_DATE, ...structuredClone(SCAN_METRICS) };
}

function canonicalDexaRecord() {
  return {
    canonicalId: CANONICAL_ID,
    userId: OWNER,
    evidence_type: "dexa",
    quality: { status: "active" },
    firstObservedAt: SCAN_DATE,
    lastObservedAt: SCAN_DATE,
    dexaRevision: { revision: 1, supersedes: null },
    provenance: { evidence_package_ids: [PACKAGE_ID], contributing_evidence_object_ids: [OBJECT_ID] },
    payload: { ...dexaEvidenceObject(), evidence_type: "dexa" },
  };
}

/**
 * The exact durable state the production review was left in: canonical
 * evidence committed and recorded, the commit claim released, and nothing
 * after `canonical_commit` done.
 */
function createResumeState({ status = "partially_committed", commitProgress = null } = {}) {
  const evidencePackage = {
    package_id: PACKAGE_ID,
    evidence_objects: [dexaEvidenceObject()],
    review_metadata: { confirmedAt: "2026-09-12T19:00:00.000Z", sourceReviewId: REVIEW_ID },
  };
  return {
    review: {
      id: REVIEW_ID,
      userId: OWNER,
      status,
      createdAt: "2026-09-12T18:55:00.000Z",
      updatedAt: "2026-09-12T19:05:00.000Z",
      confirmation: null,
      commitError: status === "partially_committed"
        ? "Post-confirmation step compatibility_writes failed: Cannot read properties of null (reading 'find')"
        : null,
      interpretedEvidence: evidencePackage,
      itemDecisions: {},
      commitProgress: commitProgress ?? {
        canonical_commit: {
          status: "completed",
          attempts: 1,
          completedAt: "2026-09-12T19:05:00.000Z",
          result: { status: "completed", canonicalEvidenceIds: [CANONICAL_ID] },
        },
      },
      commitClaim: {
        operationId: "evidence-review-background:prior-message",
        status: "available",
        claimedAt: "2026-09-12T19:04:50.000Z",
        releasedAt: "2026-09-12T19:05:00.000Z",
        leaseExpiresAt: "2026-09-12T19:05:00.000Z",
        packageId: PACKAGE_ID,
      },
    },
    canonicalEvidenceObjects: [canonicalDexaRecord()],
    analyses: [],
    dexaScans: [],
    dexaUpserts: [],
    canonicalUpserts: [],
    briefingCalls: [],
    failErrors: [],
    claimCalls: 0,
    releaseCalls: 0,
    completeCalls: 0,
    failCalls: 0,
    canonicalCommitCalls: 0,
    canonicalReads: 0,
  };
}

/** Drives the outbox worker: one message per step, key recomputed each time. */
async function drainContinuations({ limit = 20 } = {}) {
  const outcomes = [];
  for (let index = 0; index < limit; index += 1) {
    const review = mockState.value.review;
    if (review.status === "confirmed") break;
    const continuationKey = createEvidenceReviewContinuationKey(review);
    expect(continuationKey).toBeTruthy();
    outcomes.push(await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey, messageId: `message-${index}`,
    }));
  }
  return outcomes;
}

describe("resuming an interrupted DEXA confirmation", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.value = createResumeState();
  });

  it("completes compatibility_writes on the resume instead of dereferencing a null canonical list", async () => {
    const outcomes = await drainContinuations();

    expect(mockState.value.failCalls).toBe(0);
    expect(mockState.value.failErrors).toEqual([]);
    expect(mockState.value.review.commitProgress.compatibility_writes).toMatchObject({ status: "completed" });
    expect(outcomes.at(-1)).toMatchObject({ state: "confirmed", reviewId: REVIEW_ID });
  });

  it("carries the committed canonical identity onto the DEXA read model", async () => {
    await drainContinuations();

    // If `canonical` had silently defaulted to [] the lookup would miss and
    // the scan would fall back to the raw evidence-object id with no revision.
    // Asserting the canonical identity is what proves it was really reloaded.
    expect(mockState.value.dexaUpserts).toHaveLength(1);
    expect(mockState.value.dexaUpserts[0]).toMatchObject({
      id: OBJECT_ID,
      userId: OWNER,
      measuredAt: SCAN_DATE,
      canonicalId: CANONICAL_ID,
      dexaRevision: { revision: 1 },
      canonicalLifecycleStatus: "current",
    });
  });

  it("never replays canonical_commit and never writes canonical evidence twice", async () => {
    await drainContinuations();

    expect(mockState.value.canonicalCommitCalls).toBe(0);
    expect(mockState.value.canonicalUpserts).toEqual([]);
    expect(mockState.value.canonicalEvidenceObjects).toHaveLength(1);
    expect(mockState.value.review.commitProgress.canonical_commit.attempts).toBe(1);
  });

  it("reaches terminal confirmed state exactly once with every step completed once", async () => {
    await drainContinuations();

    const review = mockState.value.review;
    expect(review.status).toBe("confirmed");
    expect(review.confirmation).toMatchObject({ confirmedBy: OWNER });
    expect(mockState.value.completeCalls).toBe(1);
    for (const [step, value] of Object.entries(review.commitProgress)) {
      expect(value.status, `${step} should be completed`).toBe("completed");
      expect(value.attempts, `${step} should have run once`).toBe(1);
    }
    expect(mockState.value.briefingCalls).toEqual([OBJECT_ID]);
    expect(mockState.value.analyses.filter((item) => item.id.startsWith("analysis_dexa_"))).toHaveLength(1);
  });

  it("is idempotent: re-delivering a continuation after confirmation changes nothing", async () => {
    await drainContinuations();
    const snapshot = structuredClone({
      dexaUpserts: mockState.value.dexaUpserts,
      analyses: mockState.value.analyses,
      briefingCalls: mockState.value.briefingCalls,
      confirmation: mockState.value.review.confirmation,
    });

    // A confirmed review has no next step, so its current continuation key is
    // null and every redelivered message — including the one whose own key was
    // valid when it was enqueued — is rejected by the staleness guard before
    // any commit is claimed. "stale" and "confirmed" are both no-ops here; the
    // guard simply gets there first.
    const replay = await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: "any-stale-key", messageId: "replayed-message",
    });

    expect(replay).toMatchObject({ state: "stale", reviewId: REVIEW_ID });
    expect(replay.continuationKey).toBeNull();
    expect(mockState.value.dexaUpserts).toEqual(snapshot.dexaUpserts);
    expect(mockState.value.analyses).toEqual(snapshot.analyses);
    expect(mockState.value.briefingCalls).toEqual(snapshot.briefingCalls);
    expect(mockState.value.review.confirmation).toEqual(snapshot.confirmation);
    expect(mockState.value.completeCalls).toBe(1);
    expect(mockState.value.claimCalls).toBe(8);
  });

  it("rejects a continuation whose key no longer matches the durable checkpoint", async () => {
    const stale = await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: "stale:key:from:an:older:checkpoint", messageId: "stale-message",
    });

    expect(stale).toMatchObject({ state: "stale", reviewId: REVIEW_ID });
    expect(mockState.value.claimCalls).toBe(0);
    expect(mockState.value.dexaUpserts).toEqual([]);
  });
});

describe("Founder Confirm on a dead-lettered partially_committed review", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.value = createResumeState();
    mockState.value.review.commitProgress.compatibility_writes = {
      status: "failed",
      attempts: 3,
      error: "Cannot read properties of null (reading 'find')",
      retryable: true,
    };
  });

  it("advances the commit instead of reporting 'processing' forever", async () => {
    // The continuation for this checkpoint has already dead-lettered, so
    // nothing will ever redeliver it. Before the fix this returned
    // `{ state: "processing" }` without doing any work, which is what made the
    // review permanently unrecoverable.
    const outcome = await beginNativeEvidenceReviewConfirmation({
      reviewId: REVIEW_ID, confirmedBy: OWNER, operationId: "native-confirm-retry",
    });

    expect(outcome).toMatchObject({ state: "processing", completedStep: "compatibility_writes" });
    expect(mockState.value.claimCalls).toBe(1);
    expect(mockState.value.releaseCalls).toBe(1);
    expect(mockState.value.review.commitProgress.compatibility_writes.status).toBe("completed");
    expect(mockState.value.dexaUpserts).toHaveLength(1);
    expect(mockState.value.canonicalCommitCalls).toBe(0);
  });

  it("hands the rest of the work back to the continuation chain and finishes", async () => {
    await beginNativeEvidenceReviewConfirmation({
      reviewId: REVIEW_ID, confirmedBy: OWNER, operationId: "native-confirm-retry",
    });
    await drainContinuations();

    expect(mockState.value.review.status).toBe("confirmed");
    expect(mockState.value.dexaUpserts).toHaveLength(1);
    expect(mockState.value.briefingCalls).toEqual([OBJECT_ID]);
    expect(mockState.value.failCalls).toBe(0);
  });

  it("still refuses a Confirm from anyone other than the owner", async () => {
    await expect(beginNativeEvidenceReviewConfirmation({
      reviewId: REVIEW_ID, confirmedBy: "user_someone_else", operationId: "native-confirm-foreign",
    })).rejects.toThrow("Evidence review is unavailable.");
    expect(mockState.value.claimCalls).toBe(0);
  });

  it("leaves a genuinely in-flight commit alone", async () => {
    mockState.value.review.status = "committing";
    mockState.value.review.commitClaim = {
      ...mockState.value.review.commitClaim,
      status: "in_progress",
      operationId: "another-worker",
      leaseExpiresAt: "2999-01-01T00:00:00.000Z",
    };

    const outcome = await beginNativeEvidenceReviewConfirmation({
      reviewId: REVIEW_ID, confirmedBy: OWNER, operationId: "native-confirm-concurrent",
    });

    expect(outcome).toMatchObject({ state: "processing" });
    expect(outcome.continuationKey).toBeTruthy();
    expect(mockState.value.claimCalls).toBe(0);
    expect(mockState.value.dexaUpserts).toEqual([]);
  });
});

describe("compatibility writes refuse to degrade silently", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.value = createResumeState();
  });

  it("fails loudly rather than writing a DEXA row with no canonical identity", async () => {
    // Canonical evidence exists (assertDurableResumeState proves it) but the
    // reload returns something unusable. Writing the row anyway would produce a
    // read model detached from canonical history — worse than stopping.
    let reads = 0;
    const { FounderRepositories } = await import("../../../../data/repositories/founderRepositories");
    const original = FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects;
    FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects = async (...args) => {
      reads += 1;
      // The first read is assertDurableResumeState's side-effect proof.
      return reads === 1 ? original.call(null, ...args) : null;
    };

    try {
      await expect(drainContinuations({ limit: 1 })).rejects.toThrow(
        "Compatibility writes require the owner's canonical evidence objects."
      );
    } finally {
      FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects = original;
    }

    expect(mockState.value.dexaUpserts).toEqual([]);
    expect(mockState.value.review.status).toBe("partially_committed");
    expect(mockState.value.review.commitProgress.compatibility_writes.status).toBe("failed");
  });
});
