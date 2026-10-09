import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvidenceReviewContinuationKey } from "../../../../domain/services/EvidenceReviewBackgroundContinuation";
import { createFakeFounderCanonicalDatabase } from "../../../../testSupport/fakeFounderCanonicalDatabase.js";

// Provider-mode regression for the October 9 DEXA confirmation that crashed the
// worker and then the web process inside `compatibility_writes`. It drives the
// real handlers through every post-confirmation step with the real bounded read
// loader, the real named-record and bounded runtime mutations, and the real DEXA
// appointment logic over an in-process canonical database, and fails the test if
// any step reaches a whole-runtime repository read or write.
//
// The starting state mirrors production: canonical_commit completed, the
// review `committing` under an expired `native-confirm` claim whose
// compatibility_writes attempt never finished, and the only continuation dead.
// Fixtures are synthetic; no Founder record is reproduced.

const OWNER = "user_dexa_bounded_continuation";
const REVIEW_ID = "evidence_review_dexa_bounded_continuation";
const PACKAGE_ID = "evidence_package_dexa_bounded_continuation";
const OBJECT_ID = "dexa_object_bounded_continuation_2026_10_09";
const SCAN_DATE = "2026-10-09";
const CANONICAL_ID = `dexa_scan|${OWNER}|${SCAN_DATE}`;
const METRICS = Object.freeze({
  provider: "Synthetic Provider",
  totalMass: { value: 190, unit: "lb" },
  bodyFatPercentage: 18,
  fatMass: { value: 34.2, unit: "lb" },
  leanMass: { value: 148.6, unit: "lb" },
  boneMineralContent: { value: 7.2, unit: "lb" },
  sourceFileId: "media://synthetic-oct9.pdf",
  provenance: { extraction_engine: "synthetic", source_artifact_refs: ["media://synthetic-oct9.pdf"] },
});

const revalidatePath = vi.fn();
const harness = vi.hoisted(() => ({ state: null }));

vi.mock("next/cache.js", () => ({ revalidatePath }));
vi.mock("next/navigation.js", () => ({
  redirect(destination) { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: destination }); },
}));

vi.mock("../../../../data/repositories/founderRepositories", async () => {
  const state = () => harness.state;
  const reviews = {
    get repository() { return state().reviewRepository; },
  };
  const evidenceReviews = Object.fromEntries([
    "getReviewById", "claimEvidenceReviewCommit", "recordEvidenceReviewCommitProgress",
    "releaseEvidenceReviewCommit", "completeEvidenceReviewCommit", "failEvidenceReviewCommit", "listReviews",
  ].map((name) => [name, async (...args) => {
    if (name === "releaseEvidenceReviewCommit") state().releases += 1;
    return reviews.repository[name](...args);
  }]));
  // Any other repository method is a whole-runtime read or write in production.
  const forbidden = new Proxy({}, {
    get(_target, repositoryName) {
      return new Proxy({}, {
        get(_inner, methodName) {
          return async () => {
            const key = `${String(repositoryName)}.${String(methodName)}`;
            state().wholeRuntimeCalls.push(key);
            if (state().allowWholeRuntime.has(key)) return state().allowedResult(key);
            throw Object.assign(new Error(`whole-runtime repository used: ${key}`), { code: "WHOLE_RUNTIME_REPOSITORY_USED" });
          };
        },
      });
    },
  });
  return {
    FounderRepositories: new Proxy({
      // The entry read scope; its single whole-runtime load in production is
      // the durable-resume proof below.
      runInReadScope: (callback) => callback(),
      users: { async getCurrentUser() { return { id: OWNER }; } },
      evidenceReviews,
      canonicalEvidence: {
        // Only the confirmation entry's durable-resume proof reads this.
        async listCanonicalEvidenceObjects() {
          state().entryCanonicalReads += 1;
          return state().db.list("canonicalEvidenceObjects");
        },
      },
      analyses: { async getAnalysisById(id) { return state().db.get("analyses", id); } },
      trainingPerformanceEvents: { async getTrainingPerformanceEventById() { return null; } },
    }, {
      get(target, name) { return name in target ? target[name] : forbidden[name]; },
    }),
  };
});

vi.mock("../../../../application/composition/productionApplicationComposition", async () => {
  const { loadCanonicalRuntime } = await import("../../../../platform/migration/phase4CanonicalImport.js");
  return {
    getProductionEvidenceReviewReadService: () => ({}),
    async loadProductionBoundedFounderReadContext({ collections, includeApplicationContext = false } = {}) {
      harness.state.boundedReads.push([...collections]);
      const runtime = await loadCanonicalRuntime({
        query: harness.state.db.query, ownerUserId: OWNER, collections, includeApplicationContext, includeImportMetadata: false,
      });
      return { runtime, repositories: null };
    },
  };
});

vi.mock("../../../../application/runtime/ApplicationCanonicalRuntime", async () => {
  const { executePostgresFounderRecordMutation, executePostgresFounderRuntimeMutation } =
    await import("../../../../platform/database/PostgresFounderRepositoryFacade.js");
  const authorityStore = { claimCanonicalWriteBoundary: async () => {} };
  return {
    loadApplicationCanonicalCommitBindings: async () => ({
      mutateCanonicalRuntime: (input) => executePostgresFounderRuntimeMutation({
        pool: harness.state.db.pool, ownerUserId: OWNER, authorityStore, bounded: true, returnReceipt: true, ...input,
      }),
      mutateCanonicalRecords: (input) => executePostgresFounderRecordMutation({
        pool: harness.state.db.pool, ownerUserId: OWNER, authorityStore, ...input,
      }),
    }),
  };
});

vi.mock("../../../../application/read-models/EvidenceConfirmationReadService", () => ({
  createEvidenceConfirmationReadService: () => ({
    async readGoalEvaluationInputs() { throw new Error("whole-runtime goal read used for DEXA"); },
    async readEventBriefingPreferences() { throw new Error("whole-runtime briefing preference read used for DEXA"); },
    async readTrainingPerformanceEventInputs() { throw new Error("training inputs read for DEXA"); },
  }),
}));

vi.mock("../../../../application/composition/productionDEXAEventNarrativeComposition", () => ({
  createProductionDEXAEventNarrativeService: async (options) => ({
    async generate({ scanId }) {
      const runtime = await options.loadCanonicalRuntime();
      harness.state.briefingRuntimes.push(runtime);
      harness.state.briefingCalls.push(scanId);
      return { artifactId: `dexa_event_${scanId}` };
    },
  }),
}));

vi.mock("../../../../domain/services/DEXAInterpretationService", () => ({
  createDEXAInterpretation: ({ canonicalScan, priorScan }) => ({
    id: `analysis_dexa_${canonicalScan.canonicalId}`,
    createdAt: "2026-10-09T15:00:00.000Z",
    title: "DEXA interpreted",
    evidenceIds: [canonicalScan.canonicalId],
    evidenceTypes: ["dexa"],
    metadata: { priorScanId: priorScan?.canonicalId ?? null },
  }),
}));

vi.mock("../../../../domain/services/CanonicalEvidenceConfirmationCommitService", () => ({
  createCanonicalEvidenceConfirmationCommitService: () => ({
    async commitConfirmedEvidencePackage() { throw new Error("canonical_commit must not be replayed on resume"); },
  }),
}));

vi.mock("../../../../domain/services/PILowerLevelConfidenceWorkEnqueueService", () => ({
  createPILowerLevelConfidenceWorkEnqueueService: () => ({ stageTrainingFinalization() {}, stageEnergySourceChange() {} }),
  isPIEnergyConfidenceEnqueueEnabled: () => false,
  isPITrainingConfidenceEnqueueEnabled: () => false,
}));

vi.mock("../../../../application/media/ApplicationUploadService", () => ({ createApplicationStoredArtifactLoader: () => async () => null }));
vi.mock("../../../../application/media/PhotoAnalysisMediaLoader", () => ({ createPhotoAnalysisMediaLoader: () => async () => null }));
vi.mock("../../../../application/composition/productionPhotoEventNarrativeComposition", () => ({
  createProductionPhotoEventNarrativeService: async () => { throw new Error("photo briefing reached for DEXA"); },
}));
vi.mock("../../../../domain/services/PendingEvidenceReviewReprocessingService", () => ({
  createPendingEvidenceReviewReprocessingService: () => ({ async reprocessPendingReviewInPlace() { return { changed: false }; } }),
}));

const { continueEvidenceReviewInBackground, beginNativeEvidenceReviewConfirmation } = await import("./actions.js");
const { createEvidenceReviewRepository } = await import("../../../../data/repositories/EvidenceReviewRepository.js");

function dexaObject() {
  return { id: OBJECT_ID, evidence_type: "dexa_scan", observed_at: SCAN_DATE, measuredAt: SCAN_DATE, ...structuredClone(METRICS) };
}

function canonicalDexa() {
  return {
    id: CANONICAL_ID, canonicalId: CANONICAL_ID, userId: OWNER, evidence_type: "dexa_scan",
    quality: { status: "active" }, firstObservedAt: SCAN_DATE, lastObservedAt: SCAN_DATE,
    dexaRevision: { revision: 1, supersedes: null },
    goalPhaseAttribution: { goalId: "goal_synthetic", phaseId: "phase_synthetic" },
    provenance: { evidence_package_ids: [PACKAGE_ID], contributing_evidence_object_ids: [OBJECT_ID] },
    payload: { ...dexaObject(), evidence_type: "dexa_scan" },
  };
}

function october9Review() {
  return {
    id: REVIEW_ID, userId: OWNER, status: "committing", confirmation: null, commitError: null,
    createdAt: "2026-10-09T14:24:24.731Z", updatedAt: "2026-10-09T14:37:36.768Z",
    itemDecisions: {},
    interpretedEvidence: {
      package_id: PACKAGE_ID, detected_evidence_type: "dexa_scan", evidence_objects: [dexaObject()],
      review_metadata: { confirmedAt: "2026-10-09T14:25:26.795Z", sourceReviewId: REVIEW_ID },
    },
    commitProgress: {
      canonical_commit: { status: "completed", attempts: 1, startedAt: "2026-10-09T14:25:31.337Z", completedAt: "2026-10-09T14:25:37.941Z",
        result: { status: "completed", canonicalEvidenceIds: [CANONICAL_ID] } },
      compatibility_writes: { status: "started", attempts: 3, startedAt: "2026-10-09T14:37:29.057Z" },
    },
    commitClaim: {
      operationId: "native-confirm:synthetic", status: "in_progress", packageId: PACKAGE_ID,
      claimedAt: "2026-10-09T14:37:25.617Z", leaseExpiresAt: "2026-10-09T14:47:29.058Z",
    },
  };
}

function createState() {
  const db = createFakeFounderCanonicalDatabase({
    ownerUserId: OWNER,
    collections: {
      user: { id: OWNER, timeZone: "America/Los_Angeles" },
      goals: [{ id: "goal_synthetic", userId: OWNER, status: "active", title: "Synthetic" }],
      protocols: [],
      protocolVersions: [],
      weightEntries: [],
      progressPhotos: [],
      dexaScans: [{ id: "legacy_scan_2026_09_12", userId: OWNER, measuredAt: "2026-09-12", ...structuredClone(METRICS) }],
      executionItems: [
        { id: "execution_next_dexa", userId: OWNER, type: "evidence", status: "scheduled", active: true,
          timezone: "America/Los_Angeles", preferredSchedule: { date: SCAN_DATE }, uploadReminder: true, completionHistory: [] },
        { id: "execution_dexa", userId: OWNER, type: "evidence", active: true, completionHistory: [] },
      ],
      canonicalEvidenceObjects: [canonicalDexa()],
      analyses: [{ id: "analysis_existing", evidenceIds: ["other"], evidenceTypes: ["training"] }],
      dailyBriefings: [{ id: "briefing_existing", userId: OWNER }],
      evidenceReviews: [{ id: "unrelated_review", userId: OWNER, status: "confirmed" }],
    },
  });
  return {
    db,
    reviewRepository: createEvidenceReviewRepository([october9Review()]),
    releases: 0,
    entryCanonicalReads: 0,
    boundedReads: [],
    briefingCalls: [],
    briefingRuntimes: [],
    wholeRuntimeCalls: [],
    allowWholeRuntime: new Set(),
    allowedResult: () => null,
  };
}

async function currentReview() {
  return harness.state.reviewRepository.getReviewById(REVIEW_ID);
}

/** The worker: one message per step, starting from the recovery's message. */
async function drain({ limit = 12 } = {}) {
  const outcomes = [];
  for (let index = 0; index < limit; index += 1) {
    const review = await currentReview();
    if (review.status === "confirmed") break;
    const continuationKey = createEvidenceReviewContinuationKey(review);
    expect(continuationKey).toBeTruthy();
    outcomes.push(await continueEvidenceReviewInBackground({ reviewId: REVIEW_ID, continuationKey, messageId: `message-${index}` }));
  }
  return outcomes;
}

let previousProviderFlag;
beforeAll(() => {
  previousProviderFlag = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
  process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
});
afterAll(() => {
  if (previousProviderFlag === undefined) delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
  else process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = previousProviderFlag;
});

describe("October 9 DEXA continuation on the bounded path", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    harness.state = createState();
  });

  it("a stale dead-letter key does nothing; the current key resumes by taking over the expired claim", async () => {
    const stale = await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: `${REVIEW_ID}:canonical_commit:compatibility_writes:not_started:0`, messageId: "dead-message",
    });
    expect(stale).toMatchObject({ state: "stale" });
    expect((await currentReview()).commitProgress.compatibility_writes.attempts).toBe(3);

    const resumed = await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: createEvidenceReviewContinuationKey(await currentReview()), messageId: "recovery-message",
    });
    expect(resumed).toMatchObject({ state: "processing", completedStep: "compatibility_writes" });
    const review = await currentReview();
    expect(review.commitProgress.compatibility_writes).toMatchObject({ status: "completed", attempts: 4 });
    expect(review.commitClaim).toMatchObject({ status: "available", operationId: "evidence-review-background:recovery-message" });
  });

  it("finishes every step without any whole-runtime repository read or write", async () => {
    const outcomes = await drain();

    expect(outcomes.at(-1)).toMatchObject({ state: "confirmed" });
    expect(harness.state.wholeRuntimeCalls).toEqual([]);
    const review = await currentReview();
    expect(review.status).toBe("confirmed");
    for (const step of ["compatibility_writes", "scheduled_completion", "analysis", "training_performance_events",
      "goal_evaluation", "event_eligibility", "briefing", "home_refresh"]) {
      expect(review.commitProgress[step]?.status).toBe("completed");
    }
    expect(review.commitProgress.canonical_commit.attempts).toBe(1);
    // One durable-resume proof per invocation, and nothing else read the canonical runtime.
    expect(harness.state.entryCanonicalReads).toBe(outcomes.length);
  });

  it("reads only the collections each step consumes", async () => {
    await drain();
    const flat = harness.state.boundedReads.flat();
    for (const excluded of ["evidenceReviews", "evidencePackages", "trainingPerformanceEvents", "trainingPerformanceEventBatches",
      "canonicalExerciseLibrary", "migrationMarkers", "piEnergyConfidenceWorkItems"]) {
      expect(flat).not.toContain(excluded);
    }
    const db = harness.state.db;
    // Bounded runtime writes touched only analyses (DEXA interpretation and Goal evaluation).
    expect([...new Set(db.stats.collectionRewrites)]).toEqual(["analyses"]);
    // Named-record writes: the one compatibility row and the one appointment.
    expect(db.stats.recordWrites.sort()).toEqual([`dexaScans:${OBJECT_ID}`, "executionItems:execution_next_dexa"]);
  });

  it("writes one compatibility row carrying the canonical identity, and completes the appointment once", async () => {
    await drain();
    const db = harness.state.db;
    const rows = db.list("dexaScans").filter((item) => item.measuredAt === SCAN_DATE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: OBJECT_ID, canonicalId: CANONICAL_ID, dexaRevision: { revision: 1 }, userId: OWNER });
    expect(db.get("dexaScans", "legacy_scan_2026_09_12").version).toBe(1);
    const appointment = db.get("executionItems", "execution_next_dexa");
    expect(appointment).toMatchObject({ status: "completed", active: false, completedByEvidenceId: CANONICAL_ID, completedEvidenceDate: SCAN_DATE });
    expect(appointment.completionHistory).toHaveLength(1);
    expect(db.get("executionItems", "execution_dexa").version).toBe(1);
    expect(db.list("canonicalEvidenceObjects")).toHaveLength(1);
  });

  it("analyses with the legacy prior scan and publishes the DEXA Event from a bounded, guarded runtime", async () => {
    await drain();
    const db = harness.state.db;
    expect(db.get("analyses", `analysis_dexa_${CANONICAL_ID}`)).toMatchObject({ metadata: { priorScanId: "legacy_scan_2026_09_12" } });
    expect(db.get("analyses", `goal_evaluation_${PACKAGE_ID}`)).toBeTruthy();
    expect(db.get("analyses", "analysis_existing")).toBeTruthy();
    expect(harness.state.briefingCalls).toEqual([OBJECT_ID]);
    const runtime = harness.state.briefingRuntimes[0];
    expect(runtime.dailyBriefings.map((item) => item.id)).toEqual(["briefing_existing"]);
    expect(() => runtime.evidenceReviews.length).toThrowError(expect.objectContaining({ code: "BOUNDED_READ_COLLECTION_NOT_LOADED" }));
  });

  it("is idempotent: redelivering the last message after confirmation changes nothing", async () => {
    await drain();
    const db = harness.state.db;
    const revision = db.revision;
    db.resetStats();
    const replay = await continueEvidenceReviewInBackground({ reviewId: REVIEW_ID, continuationKey: "any", messageId: "replay" });
    expect(replay).toMatchObject({ state: "stale" });
    expect(db.revision).toBe(revision);
    expect(db.stats.recordWrites).toEqual([]);
    expect(harness.state.briefingCalls).toEqual([OBJECT_ID]);
  });

  it("survives a crash between steps: a retried step re-runs idempotently", async () => {
    // A live lease is never taken over; only a lapsed one is.
    // compatibility_writes commits its row, then the process dies before the
    // checkpoint is recorded; the next delivery repeats it.
    await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: createEvidenceReviewContinuationKey(await currentReview()), messageId: "first",
    });
    const repository = harness.state.reviewRepository;
    const review = await repository.getReviewById(REVIEW_ID);
    harness.state.reviewRepository = createEvidenceReviewRepository([{
      ...review,
      commitProgress: { ...review.commitProgress, compatibility_writes: { status: "started", attempts: 4, startedAt: new Date(Date.now() - 120_000).toISOString() } },
      // The dead process's lease has lapsed, so the next delivery may take over.
      commitClaim: { ...review.commitClaim, status: "in_progress", leaseExpiresAt: new Date(Date.now() - 60_000).toISOString() },
    }]);
    await drain();
    const db = harness.state.db;
    expect(db.list("dexaScans").filter((item) => item.measuredAt === SCAN_DATE)).toHaveLength(1);
    expect(db.get("executionItems", "execution_next_dexa").completionHistory).toHaveLength(1);
    expect((await currentReview()).status).toBe("confirmed");
  });

  it("a Native Confirm while the review is committing does no work", async () => {
    const outcome = await beginNativeEvidenceReviewConfirmation({ reviewId: REVIEW_ID, confirmedBy: OWNER, operationId: "native-again" });
    expect(outcome).toMatchObject({ state: "processing" });
    expect(harness.state.db.stats.recordWrites).toEqual([]);
    expect((await currentReview()).commitProgress.compatibility_writes.attempts).toBe(3);
  });
});

describe("other evidence types keep their existing path", () => {
  beforeEach(() => {
    harness.state = createState();
    const weightReview = october9Review();
    weightReview.interpretedEvidence = {
      package_id: "weight_package", evidence_objects: [{ id: "weight_obj", evidence_type: "weight", observed_at: SCAN_DATE, value: 180, unit: "lb" }],
    };
    weightReview.commitClaim = { ...weightReview.commitClaim, packageId: "weight_package" };
    harness.state.reviewRepository = createEvidenceReviewRepository([weightReview]);
    harness.state.allowWholeRuntime = new Set(["weights.addWeightEntry"]);
  });

  it("a weight confirmation still writes through the repository and makes no bounded DEXA read", async () => {
    await continueEvidenceReviewInBackground({
      reviewId: REVIEW_ID, continuationKey: createEvidenceReviewContinuationKey(await currentReview()), messageId: "weight-1",
    });
    expect(harness.state.wholeRuntimeCalls).toEqual(["weights.addWeightEntry"]);
    expect(harness.state.boundedReads).toEqual([]);
    expect(harness.state.db.stats.recordWrites).toEqual([]);
    // Its compatibility step reloaded canonical evidence through the repository as before.
    expect(harness.state.entryCanonicalReads).toBe(2);
  });
});
