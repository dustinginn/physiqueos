import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCanonicalEvidenceConfirmationCommitService,
} from "./CanonicalEvidenceConfirmationCommitService";
import {
  createFounderBriefingReconciliationService,
} from "./FounderBriefingReconciliationService";
import {
  createBriefingReconciliationPresentation,
} from "./BriefingReconciliationPresentationService";
import {
  createBriefingReconciliationEnqueueService,
} from "./BriefingReconciliationEnqueueService";
import {
  createMorningBriefingFinalizationService,
} from "./MorningBriefingFinalizationService";
import {
  createConfirmedPhotoEventRecoveryService,
} from "./ConfirmedPhotoEventRecoveryService";

const USER = "founder";
const CONFIRMED_AT = "2026-08-09T22:08:15.055Z";
const ROOT = "weekly_briefing_2026-08-02_2026-08-08";
const directories = [];

afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("late-evidence confirmation and recovery finalization integration", () => {
  it("atomically commits Training and coalesces the already-confirmed legacy Nutrition dependency", async () => {
    const fixture = storeFixture();
    const result = await confirmationService(fixture)
      .commitConfirmedEvidencePackage(trainingPackage(), USER);

    expect(result.committed).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    expect(persisted.revision).toBe(8);
    expect(persisted.canonicalEvidenceObjects.some((item) =>
      item.evidence_type === "training" && item.lastObservedAt === "2026-08-08"
    )).toBe(true);
    expect(persisted.briefingReconciliationWorkItems).toHaveLength(1);
    expect(persisted.briefingReconciliationWorkItems[0]).toMatchObject({
      publicationRootId: ROOT,
      status: "revision_pending",
      userId: USER,
    });
    expect(persisted.briefingReconciliationWorkItems[0].affectedDependencies)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          logicalIdentity: "nutrition|2026-08-08",
          semanticDigest: "sha256_f595d021335d806152794bff33a63faa7b5148ca249742ba52a9c8a19acba5a6",
        }),
        expect.objectContaining({ evidenceType: "training" }),
      ]));
    expect(persisted.briefingReconciliationWorkItems[0].sourceCommitLinks)
      .toContain(persisted.lastCommitId);
    expect(fs.readFileSync(fixture.filePath, "utf8"))
      .toBe(`${JSON.stringify(fixture.liveStore)}\n`);
  });

  it("reuses one occurrence item as Nutrition, Training, and Activity changes accumulate", async () => {
    const fixture = storeFixture();
    await confirmationService(fixture)
      .commitConfirmedEvidencePackage(trainingPackage(), USER);
    const second = await confirmationService(fixture)
      .commitConfirmedEvidencePackage(activityPackage(), USER);

    expect(second.committed).toBe(true);
    expect(fixture.liveStore.briefingReconciliationWorkItems).toHaveLength(1);
    expect(fixture.liveStore.briefingReconciliationWorkItems[0]
      .affectedDependencies.map((item) => item.evidenceType).sort())
      .toEqual(["activity_day", "nutrition", "training"]);
  });

  it.each([
    ["midweek", "2026-08-02", "2026-08-04", "2026-08-04",
      "2026-08-05T18:00:00.000Z"],
    ["monthly", "2026-07-01", "2026-07-31", "2026-07-31",
      "2026-08-01T18:00:00.000Z"],
  ])("uses the generic confirmation coordinator for %s", (
    cadence, startDate, endDate, observedDate, confirmedAt
  ) => {
    const publication = cadencePublication({ cadence, startDate, endDate,
      generatedAt: new Date(Date.parse(confirmedAt) - 60_000).toISOString() });
    const candidate = {
      briefingReconciliationWorkItems: [],
      canonicalEvidenceObjects: [],
      dailyBriefings: [publication],
    };
    const evidence = {
      canonicalId: `${cadence}-training`,
      evidence_type: "training",
      lastObservedAt: observedDate,
      updatedAt: confirmedAt,
      payload: { id: `${cadence}-training`, evidence_type: "training",
        observed_at: observedDate, exercises: [] },
    };
    const result = createBriefingReconciliationEnqueueService({
      now: () => new Date(confirmedAt),
    }).stageCanonicalEvidenceChanges(candidate, {
      canonicalChanges: [evidence], confirmedAt, userId: USER,
    });

    expect(result.workItemIds).toHaveLength(1);
    expect(candidate.briefingReconciliationWorkItems[0])
      .toMatchObject({ cadence, publicationRootId: publication.id });
  });

  it("finalizes the pending occurrence once and completes its durable work item", async () => {
    const current = weeklyPublication();
    const workItem = pendingWorkItem();
    const items = [workItem];
    const revised = {
      ...structuredClone(current),
      generatedAt: "2026-08-09T23:00:00.000Z",
      dependencyManifest: {
        fingerprint: "sha256_revised",
        canonicalDependencies: workItem.affectedDependencies.map((item) => ({
          logicalIdentity: item.logicalIdentity,
          semanticDigest: item.semanticDigest,
        })),
      },
      replacedBriefingHistory: [{
        artifact: structuredClone(current),
        reason: "late_evidence_reconciliation",
      }],
    };
    const cadence = {
      prepareRegeneration: vi.fn(async () => ({ status: "prepared" })),
      executePreparedRegeneration: vi.fn(async () => ({
        status: "regenerated",
        committed: true,
        artifact: revised,
      })),
    };
    const persistence = {
      saveWorkItem: vi.fn(async (item) => {
        items.splice(0, 1, structuredClone(item));
      }),
    };
    const repositories = {
      briefingReconciliationWorkItems: {
        listWorkItems: async () => structuredClone(items),
      },
      dailyBriefings: {
        listDailyBriefings: async () => [current],
      },
    };
    const result = await createFounderBriefingReconciliationService({
      repositories,
      persistence,
      cadenceServices: { weekly: cadence },
      now: sequenceClock("2026-08-09T23:00:00.000Z"),
    }).finalizePending({ userId: USER, workItemIds: [workItem.id] });

    expect(result).toMatchObject({ attempted: 1, completed: 1, failed: 0 });
    expect(cadence.prepareRegeneration).toHaveBeenCalledOnce();
    expect(cadence.executePreparedRegeneration).toHaveBeenCalledOnce();
    expect(items[0]).toMatchObject({
      publicationRootId: ROOT,
      status: "current_after_revision",
      result: { publicationArtifactId: ROOT, noOp: false },
    });
    expect(revised.replacedBriefingHistory).toHaveLength(1);
  });

  it("makes already-current finalization a no-op without another cadence publication", async () => {
    const workItem = pendingWorkItem();
    const current = {
      ...weeklyPublication(),
      dependencyManifest: {
        fingerprint: "sha256_current",
        canonicalDependencies: workItem.affectedDependencies,
      },
    };
    const items = [workItem];
    const cadence = {
      prepareRegeneration: vi.fn(),
      executePreparedRegeneration: vi.fn(),
    };
    const result = await createFounderBriefingReconciliationService({
      repositories: {
        briefingReconciliationWorkItems: {
          listWorkItems: async () => structuredClone(items),
        },
        dailyBriefings: { listDailyBriefings: async () => [current] },
      },
      persistence: {
        saveWorkItem: async (item) => items.splice(0, 1, structuredClone(item)),
      },
      cadenceServices: { weekly: cadence },
      now: sequenceClock("2026-08-09T23:00:00.000Z"),
    }).finalizePending({ userId: USER, workItemIds: [workItem.id] });

    expect(result).toMatchObject({ completed: 1, failed: 0 });
    expect(cadence.prepareRegeneration).not.toHaveBeenCalled();
    expect(items[0].result.noOp).toBe(true);
  });

  it("keeps failure retryable and succeeds on the next bounded finalization", async () => {
    const current = weeklyPublication();
    const items = [pendingWorkItem()];
    let attempt = 0;
    const cadence = {
      prepareRegeneration: vi.fn(async () => ({ status: "prepared" })),
      executePreparedRegeneration: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("temporary composition failure");
        return {
          status: "regenerated",
          committed: true,
          artifact: { ...current, dependencyManifest: {
            fingerprint: "sha256_retry",
            canonicalDependencies: items[0].affectedDependencies,
          } },
        };
      }),
    };
    const repositories = {
      briefingReconciliationWorkItems: {
        listWorkItems: async () => structuredClone(items),
      },
      dailyBriefings: { listDailyBriefings: async () => [current] },
    };
    const persistence = {
      saveWorkItem: async (item) => items.splice(0, 1, structuredClone(item)),
    };
    const service = createFounderBriefingReconciliationService({
      repositories, persistence, cadenceServices: { weekly: cadence },
      now: sequenceClock("2026-08-09T23:00:00.000Z"),
    });

    expect(await service.finalizePending({ userId: USER,
      workItemIds: [items[0].id] }))
      .toMatchObject({ completed: 0, failed: 1 });
    expect(items[0]).toMatchObject({ status: "failed",
      failure: { retryable: true } });
    expect(current.replacedBriefingHistory).toBeUndefined();
    expect(await service.finalizePending({ userId: USER,
      workItemIds: [items[0].id] }))
      .toMatchObject({ completed: 1, failed: 0 });
    expect(items[0].status).toBe("current_after_revision");
    expect(cadence.executePreparedRegeneration).toHaveBeenCalledTimes(2);
  });

  it("finalizes one Weekly and one deferred Photo Event without duplicate roots or extra Confidence work", async () => {
    const weekly = weeklyPublication();
    const workItems = [pendingWorkItem()];
    const photoSessionId = "photo_session_founder_2026-08-08";
    const photoEventId = `event_briefing_progress_photo_${photoSessionId}`;
    const canonicalEvidenceObjects = [{
      canonicalId: photoSessionId,
      evidence_type: "photo_session",
      lastObservedAt: "2026-08-08",
      quality: { status: "active" },
    }];
    const confidence = [{ id: "confidence-current", score: 59 }];
    const review = {
      id: "photo-review",
      userId: USER,
      status: "confirmed",
      interpretedEvidence: {
        package_id: "photo-package",
        evidence_objects: [{
          evidence_type: "photo_session",
          observed_at: "2026-08-08",
        }],
      },
      commitProgress: Object.fromEntries([
        "canonical_commit",
        "compatibility_writes",
        "scheduled_completion",
        "analysis",
        "goal_evaluation",
        "event_eligibility",
        "briefing",
        "home_refresh",
      ].map((step) => [step, { status: "completed", attempts: 1 }])),
    };
    const state = {
      dailyBriefings: [weekly],
      review,
    };
    let confidenceFinalizations = 0;
    const revised = {
      ...structuredClone(weekly),
      generatedAt: "2026-08-10T02:00:00.000Z",
      dependencyManifest: {
        fingerprint: "sha256_revised_combined",
        canonicalDependencies: workItems[0].affectedDependencies,
      },
      replacedBriefingHistory: [{
        artifact: structuredClone(weekly),
        reason: "late_evidence_reconciliation",
      }],
    };
    const repositories = {
      briefingReconciliationWorkItems: {
        listWorkItems: async () => structuredClone(workItems),
      },
      dailyBriefings: {
        listDailyBriefings: async () => state.dailyBriefings,
      },
      evidenceReviews: {
        getReviewById: async () => state.review,
        updateReview: async (_id, patch) => {
          state.review = { ...state.review, ...structuredClone(patch) };
          return state.review;
        },
      },
    };
    const briefingService = createFounderBriefingReconciliationService({
      repositories,
      persistence: {
        saveWorkItem: async (item) =>
          workItems.splice(0, 1, structuredClone(item)),
      },
      cadenceServices: {
        weekly: {
          prepareRegeneration: vi.fn(async () => ({ status: "prepared" })),
          executePreparedRegeneration: vi.fn(async () => {
            confidenceFinalizations += 1;
            state.dailyBriefings.splice(0, 1, revised);
            return { status: "regenerated", committed: true, artifact: revised };
          }),
        },
      },
      now: sequenceClock("2026-08-10T02:00:00.000Z"),
    });
    const morningFinalization = createMorningBriefingFinalizationService({
      priorityService: {
        getSelection: async () => ({
          window: { previousLocalDate: "2026-08-08" },
          evidenceRecoveryItems: [],
        }),
      },
      createBriefingService: () => briefingService,
      listPublications: async () => state.dailyBriefings,
      listWorkItems: async () => workItems,
    });
    const photoRecovery = createConfirmedPhotoEventRecoveryService({
      repositories,
      photoEventService: {
        getOrCreateResult: async () => {
          const existing = state.dailyBriefings.find((item) =>
            item.id === photoEventId
          );
          if (existing) return {
            status: "completed",
            artifact: existing,
            artifactId: existing.id,
            sessionId: photoSessionId,
            created: false,
          };
          const artifact = {
            id: photoEventId,
            userId: USER,
            artifactType: "event",
            cadence: "event",
            generatedAt: "2026-08-10T02:00:05.000Z",
            trigger: {
              evidenceType: "photo_session",
              evidenceId: photoSessionId,
            },
            briefing: {
              photoEventNarrative: { eventDate: "2026-08-08" },
            },
          };
          state.dailyBriefings.push(artifact);
          return {
            status: "completed",
            artifact,
            artifactId: artifact.id,
            sessionId: photoSessionId,
            created: true,
          };
        },
      },
      now: sequenceClock("2026-08-10T02:00:05.000Z"),
    });

    expect(await morningFinalization.finalize({
      userId: USER,
      timeZone: "America/Los_Angeles",
      at: new Date("2026-08-10T02:00:00.000Z"),
    })).toMatchObject({ status: "completed", attempted: 1, completed: 1 });
    expect(await photoRecovery.recover({
      reviewId: review.id,
      userId: USER,
    })).toMatchObject({ status: "completed", created: true });
    expect(await morningFinalization.finalize({
      userId: USER,
      timeZone: "America/Los_Angeles",
      at: new Date("2026-08-10T02:00:10.000Z"),
    })).toMatchObject({ status: "current", attempted: 0 });
    expect(await photoRecovery.recover({
      reviewId: review.id,
      userId: USER,
    })).toMatchObject({ status: "completed", created: false });

    expect(state.dailyBriefings.filter((item) => item.id === ROOT))
      .toHaveLength(1);
    expect(state.dailyBriefings.find((item) => item.id === ROOT)
      .replacedBriefingHistory).toHaveLength(1);
    expect(state.dailyBriefings.filter((item) => item.id === photoEventId))
      .toHaveLength(1);
    expect(state.dailyBriefings.find((item) => item.id === photoEventId)
      .briefing.photoEventNarrative.eventDate).toBe("2026-08-08");
    expect(workItems).toHaveLength(1);
    expect(workItems[0].status).toBe("current_after_revision");
    expect(canonicalEvidenceObjects).toHaveLength(1);
    expect(confidence).toEqual([{ id: "confidence-current", score: 59 }]);
    expect(confidenceFinalizations).toBe(1);
  });

  it("presents pending, blocked, failed, and completed states without exposing work IDs", () => {
    const pending = pendingWorkItem();
    expect(createBriefingReconciliationPresentation({
      workItems: [pending], publicationRootId: ROOT,
    })).toMatchObject({ state: "updating", canFinalize: true });
    expect(createBriefingReconciliationPresentation({
      hasPendingConfirmation: true,
      workItems: [pending],
      publicationRootId: ROOT,
    })).toMatchObject({ state: "updating", canFinalize: false });
    expect(JSON.stringify(createBriefingReconciliationPresentation({
      workItems: [{ ...pending, status: "failed", attempts: 1,
        failure: { retryable: true } }],
      publicationRootId: ROOT,
    }))).not.toContain(pending.id);
    expect(createBriefingReconciliationPresentation({
      workItems: [{ ...pending, status: "current_after_revision" }],
      publicationRootId: ROOT,
    })).toMatchObject({ state: "current", visible: true });
  });
});

function confirmationService({ filePath, liveStore }) {
  return createCanonicalEvidenceConfirmationCommitService({
    runtimeStorePath: filePath,
    liveStore,
    enableEnergyConfidenceEnqueue: false,
    now: () => new Date(CONFIRMED_AT),
  });
}

function storeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "briefing-confirmation-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    revision: 7,
    lastCommitId: "before-confirmation",
    updatedAt: "2026-08-09T21:00:00.000Z",
    canonicalEvidenceObjects: [nutritionRecord()],
    canonicalExerciseLibrary: [],
    dailyBriefings: [weeklyPublication()],
    evidencePackages: [],
    briefingReconciliationWorkItems: [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return { directory, filePath, liveStore };
}

function nutritionRecord() {
  return {
    canonicalId: "nutrition-day",
    evidence_type: "nutrition",
    lastObservedAt: "2026-08-08",
    updatedAt: CONFIRMED_AT,
    nutritionRevision: {
      logicalDayKey: "nutrition|2026-08-08",
      revision: 2,
      semanticFingerprint:
        "sha256_f595d021335d806152794bff33a63faa7b5148ca249742ba52a9c8a19acba5a6",
      replacedAt: CONFIRMED_AT,
      sourceReviewId: "nutrition-review",
    },
    payload: {
      id: "nutrition-day",
      evidence_type: "nutrition",
      observed_at: "2026-08-08",
      daily_totals: { calories: 3135 },
      meals: [],
    },
    quality: { status: "active" },
    userId: USER,
  };
}

function trainingPackage() {
  return {
    package_id: "training-package",
    review_metadata: {
      confirmedAt: CONFIRMED_AT,
      sourceReviewId: "training-review",
    },
    evidence_objects: [{
      id: "training-session",
      evidence_type: "training",
      observed_at: "2026-08-08",
      metadata: { activity_type: "resistance" },
      exercises: [{ id: "squat", sets: [{ reps: 5, weight: 225 }] }],
    }],
  };
}

function activityPackage() {
  return {
    package_id: "activity-package",
    review_metadata: {
      confirmedAt: CONFIRMED_AT,
      sourceReviewId: "activity-review",
    },
    evidence_objects: [{
      id: "activity-day",
      evidence_type: "activity_day",
      observed_at: "2026-08-08",
      daily_activity: { move_calories: 700 },
    }],
  };
}

function weeklyPublication() {
  return {
    id: ROOT,
    userId: USER,
    artifactType: "scheduled",
    cadence: "weekly",
    generatedAt: "2026-08-09T16:37:09.852Z",
    evidenceWindow: {
      id: "weekly:2026-08-02:2026-08-08:America/Los_Angeles",
      cadence: "weekly",
      startDate: "2026-08-02",
      endDate: "2026-08-08",
      timeZone: "America/Los_Angeles",
      closed: true,
    },
    briefing: { version: "legacy", weeklyNarrative: {} },
  };
}

function cadencePublication({ cadence, startDate, endDate, generatedAt }) {
  return {
    id: `${cadence}_briefing_${startDate}_${endDate}`,
    userId: USER,
    artifactType: "scheduled",
    cadence,
    generatedAt,
    evidenceWindow: {
      id: `${cadence}:${startDate}:${endDate}:America/Los_Angeles`,
      cadence,
      startDate,
      endDate,
      timeZone: "America/Los_Angeles",
      closed: true,
      briefingDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(generatedAt)),
      deliveryDate: cadence === "monthly" ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(generatedAt)) : undefined,
    },
    briefing: {
      version: "fixture",
      ...(cadence === "weekly" ? { weeklyNarrative: {} } : {}),
      ...(cadence === "midweek" ? { hero: {} } : {}),
      ...(cadence === "monthly" ? { monthlyPresentation: {} } : {}),
    },
  };
}

function pendingWorkItem() {
  return {
    schemaVersion: "briefing_reconciliation_work_item_v1",
    id: "briefing_reconciliation|fixture",
    publicationRootId: ROOT,
    userId: USER,
    occurrenceIdentity:
      "weekly:2026-08-02:2026-08-08:America/Los_Angeles",
    cadence: "weekly",
    reason: "late_evidence_reconciliation",
    status: "revision_pending",
    stableIdentityFingerprint: "sha256_stable",
    inputFingerprint: "sha256_input",
    affectedDependencies: [{
      schemaVersion: "canonical_evidence_dependency_v1",
      canonicalObjectId: "nutrition-day",
      evidenceType: "nutrition",
      observedDate: "2026-08-08",
      logicalIdentity: "nutrition|2026-08-08",
      semanticRevision: 2,
      semanticDigest: "sha256_nutrition",
      semanticChangedAt: CONFIRMED_AT,
      confirmedAt: CONFIRMED_AT,
      sourceLinkage: {},
    }],
    sourceCommitLinks: [],
    attempts: 0,
    enqueuedAt: CONFIRMED_AT,
    updatedAt: CONFIRMED_AT,
  };
}

function sequenceClock(start) {
  let offset = 0;
  return () => new Date(Date.parse(start) + offset++ * 1000);
}
