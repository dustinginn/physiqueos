import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createPILowerLevelCanonicalEvidenceCommitService,
} from "./PILowerLevelCanonicalEvidenceCommitService";
import {
  createPILowerLevelConfidenceWorkEnqueueService,
  isPIEnergyConfidenceEnqueueEnabled,
  isPILowerLevelConfidenceEnqueueEnabled,
  isPITrainingConfidenceEnqueueEnabled,
} from "./PILowerLevelConfidenceWorkEnqueueService";
import {
  createPILowerLevelConfidenceRecoveryWorker,
} from "./PILowerLevelConfidenceRecoveryWorker";
import {
  createPILowerLevelConfidenceWorkStatusReadService,
} from "./PILowerLevelConfidenceWorkStatusReadService";
import {
  createTrainingPerformanceEventPersistenceService,
} from "./TrainingPerformanceEventPersistenceService";

const productionPath = path.resolve(
  process.cwd(), "private/founder/runtime-store.json"
);
const directories = [];
afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

function fixture() {
  const production = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  const store = {
    version: production.version,
    revision: 1,
    lastCommitId: "baseline",
    updatedAt: "2026-07-27T00:00:00.000Z",
    goals: structuredClone(production.goals),
    canonicalEvidenceObjects: [],
    trainingPerformanceEvents: [],
    trainingPerformanceEventBatches: [],
    goalConfidenceSnapshots:
      structuredClone(production.goalConfidenceSnapshots),
    goalConfidenceHistory: structuredClone(production.goalConfidenceHistory),
    goalConfidenceContinuitySeeds:
      structuredClone(production.goalConfidenceContinuitySeeds),
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lower-integration-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  let id = 0;
  const now = () => new Date(`2026-07-28T00:00:0${id++}.000Z`);
  const createUnitOfWork = (options) => createFounderStoreUnitOfWork({
    ...options,
    createCommitId: () => `commit-${id}`,
    createTransactionId: () => `tx-${id}`,
  });
  return {
    filePath,
    store,
    now,
    coordinator:
      createPILowerLevelConfidenceWorkEnqueueService({ now }),
    source: createPILowerLevelCanonicalEvidenceCommitService({
      runtimeStorePath: filePath,
      liveStore: store,
      now,
      createUnitOfWork,
    }),
  };
}

const nutrition = (calories = 2400) => ({
  package_id: "package-nutrition",
  userId: "founder",
  evidence_objects: [{
    id: "nutritionday_2026-07-27_1",
    evidence_type: "nutrition",
    observed_at: "2026-07-27",
    daily_totals: { calories, protein_g: 190 },
    provenance: { source_artifact_refs: ["nutrition.png"] },
  }],
});
const activity = () => ({
  package_id: "package-activity",
  userId: "founder",
  evidence_objects: [{
    id: "activity_2026-07-27",
    evidence_type: "activity_day",
    observed_at: "2026-07-27",
    daily_activity: { move_calories: 700, completeness: "complete" },
    provenance: { source_artifact_refs: ["activity.png"] },
  }],
});
function read(f) {
  return JSON.parse(fs.readFileSync(f.filePath, "utf8"));
}

describe("lower-level confidence production integration", () => {
  it("atomically stages Nutrition-first and enriches the same Energy chain", async () => {
    const f = fixture();
    const first = await f.source.commitConfirmedEvidencePackage(
      nutrition(), "founder"
    );
    expect(first).toMatchObject({
      committed: true,
      outcome: "source_committed_work_enqueued",
    });
    expect(read(f).piEnergyConfidenceWorkItems).toHaveLength(1);
    expect(read(f).piEnergyConfidenceWorkItems[0].sourceActivityId).toBeNull();

    await f.source.commitConfirmedEvidencePackage(activity(), "founder");
    const state = read(f);
    expect(state.piEnergyConfidenceWorkItems).toHaveLength(1);
    expect(state.piEnergyConfidenceWorkItems[0]).toMatchObject({
      sourceNutritionId:
        "nutrition|2026-07-27|nutritionday_2026-07-27_1",
      sourceActivityId:
        "activity_day|2026-07-27",
      status: "pending",
    });
    expect(state.piEnergyFinalizationReceipts ?? []).toHaveLength(0);
    expect(state.goalConfidenceHistory).toHaveLength(1);
  });

  it("is symmetric, replay-safe, and reactivates corrections", async () => {
    const f = fixture();
    await f.source.commitConfirmedEvidencePackage(activity(), "founder");
    await f.source.commitConfirmedEvidencePackage(nutrition(), "founder");
    const afterPair = fs.readFileSync(f.filePath, "utf8");
    const matched = await f.source.commitConfirmedEvidencePackage(
      nutrition(), "founder"
    );
    expect(matched.outcome).toBe("source_matched");
    expect(fs.readFileSync(f.filePath, "utf8")).toBe(afterPair);

    const corrected = await f.source.commitConfirmedEvidencePackage(
      nutrition(2600), "founder"
    );
    expect(corrected.committed).toBe(true);
    expect(read(f).piEnergyConfidenceWorkItems).toHaveLength(1);
    expect(read(f).piEnergyConfidenceWorkItems[0].sourceCommitLinks.length)
      .toBeGreaterThan(1);
  });

  it("rolls back source and work together when staging fails", async () => {
    const f = fixture();
    const source = createPILowerLevelCanonicalEvidenceCommitService({
      runtimeStorePath: f.filePath,
      liveStore: f.store,
      now: f.now,
      enqueueCoordinator: {
        stageEnergySourceChange() {
          throw new Error("injected enqueue failure");
        },
      },
    });
    const before = fs.readFileSync(f.filePath, "utf8");
    const result = await source.commitConfirmedEvidencePackage(
      nutrition(), "founder"
    );
    expect(result).toMatchObject({
      committed: false,
      outcome: "persistence_failure",
    });
    expect(fs.readFileSync(f.filePath, "utf8")).toBe(before);
  });

  it("stages one Training chain for many events and explicit zero events", () => {
    const f = fixture();
    const base = {
      canonicalTrainingSessionId: "session-1",
      finalizedTrainingReportId: "analysis-1",
      sourceTrainingEvidenceIds: ["canonical-session-1"],
      performanceEventBatchId: "batch-1",
      categoryRollupFingerprint: "categories-1",
      sourceSemanticFingerprint: "source-1",
      evidenceCutoff: "2026-07-27T23:59:59.999Z",
    };
    f.coordinator.stageTrainingFinalization(f.store, {
      ...base,
      performanceEventIds: ["event-2", "event-1"],
    });
    f.coordinator.stageTrainingFinalization(f.store, {
      ...base,
      performanceEventIds: ["event-1", "event-2"],
    });
    expect(f.store.piTrainingConfidenceWorkItems).toHaveLength(1);
    expect(f.store.piTrainingConfidenceWorkItems[0].performanceEventIds)
      .toEqual(["event-1", "event-2"]);

    f.coordinator.stageTrainingFinalization(f.store, {
      ...base,
      canonicalTrainingSessionId: "session-2",
      performanceEventBatchId: "batch-zero",
      performanceEventIds: [],
      zeroEventCompletion: true,
    });
    expect(f.store.piTrainingConfidenceWorkItems).toHaveLength(2);
  });

  it("commits a zero-event batch marker and Training work atomically", async () => {
    const f = fixture();
    const batch = {
      id: "batch-zero",
      status: "finalized",
      sourceCommitId: "pending_source_commit",
      canonicalTrainingSessionIds: ["session-zero"],
      performanceEventIds: [],
      zeroEventCompletion: true,
    };
    const result = await createTrainingPerformanceEventPersistenceService({
      runtimeStorePath: f.filePath,
      liveStore: f.store,
    }).persistEventBatch([], {
      batchId: batch.id,
      batch,
      mutateCandidate: (candidate) =>
        f.coordinator.stageTrainingFinalization(candidate, {
          canonicalTrainingSessionId: "session-zero",
          finalizedTrainingReportId: "analysis-zero",
          sourceTrainingEvidenceIds: ["canonical-session-zero"],
          performanceEventBatchId: batch.id,
          performanceEventIds: [],
          zeroEventCompletion: true,
          categoryRollupFingerprint: "categories-zero",
          sourceSemanticFingerprint: "source-zero",
          evidenceCutoff: "2026-07-27T23:59:59.999Z",
        }),
      finalizeCandidate: ({ stagedState, commitId }) => {
        stagedState.trainingPerformanceEventBatches[0].sourceCommitId = commitId;
        stagedState.piTrainingConfidenceWorkItems[0].sourceCommitLinks =
          stagedState.piTrainingConfidenceWorkItems[0].sourceCommitLinks
            .map((link) => ({ ...link, commitId }));
      },
      validateFinalized: (candidate) =>
        candidate.piTrainingConfidenceWorkItems?.length === 1,
    });
    expect(result).toMatchObject({ committed: true, outcome: "no_events" });
    expect(read(f)).toMatchObject({
      trainingPerformanceEventBatches: [{
        id: "batch-zero",
        zeroEventCompletion: true,
      }],
      piTrainingConfidenceWorkItems: [{
        canonicalTrainingSessionId: "session-zero",
        performanceEventIds: [],
      }],
    });
  });

  it("defaults both production gates to disabled", () => {
    expect(isPILowerLevelConfidenceEnqueueEnabled({})).toBe(false);
    expect(isPIEnergyConfidenceEnqueueEnabled({})).toBe(false);
    expect(isPITrainingConfidenceEnqueueEnabled({})).toBe(false);
    const worker = createPILowerLevelConfidenceRecoveryWorker({
      energyService: serviceStub(),
      trainingService: serviceStub(),
      executeEnabled: () => false,
    });
    return expect(worker.run({
      mode: "execute",
      productionExecutionAuthorized: true,
      acceptsRuntimeMutation: true,
      operationReason: "isolated validation",
      expectedRevision: 1,
      expectedSemanticDigest: "digest",
      maximumItems: 1,
    })).resolves.toMatchObject({ outcome: "unauthorized" });
  });

  it("activates Energy independently without activating Training", () => {
    const environment = {
      PI_LOWER_LEVEL_CONFIDENCE_ENERGY_ENQUEUE_ENABLED: "true",
      PI_LOWER_LEVEL_CONFIDENCE_TRAINING_ENQUEUE_ENABLED: "false",
      PI_LOWER_LEVEL_CONFIDENCE_WORKER_EXECUTE_ENABLED: "false",
    };
    expect(isPIEnergyConfidenceEnqueueEnabled(environment)).toBe(true);
    expect(isPITrainingConfidenceEnqueueEnabled(environment)).toBe(false);
  });

  it("dry-runs both domains without claims, attempts, or writes", async () => {
    const energy = serviceStub("energy-work", "awaiting_pair");
    const training = serviceStub("training-work", "not_material");
    const worker = createPILowerLevelConfidenceRecoveryWorker({
      energyService: energy,
      trainingService: training,
      now: () => new Date("2026-07-28T00:00:00.000Z"),
      createRunId: () => "run-1",
    });
    const result = await worker.run({ mode: "dry_run" });
    expect(result).toMatchObject({
      outcome: "completed",
      processedCount: 2,
      awaitingCount: 1,
      nonMaterialCount: 1,
    });
    expect(energy.claim).not.toHaveBeenCalled();
    expect(training.claim).not.toHaveBeenCalled();
    expect(energy.finalize).not.toHaveBeenCalled();
  });

  it("executes only an explicitly authorized bounded selection", async () => {
    const energy = serviceStub("energy-work", "not_material");
    const training = serviceStub("training-work", "not_material");
    const worker = createPILowerLevelConfidenceRecoveryWorker({
      energyService: energy,
      trainingService: training,
      executeEnabled: () => true,
    });
    const result = await worker.run({
      mode: "execute",
      domains: ["energy"],
      workIds: ["energy-work"],
      productionExecutionAuthorized: true,
      acceptsRuntimeMutation: true,
      operationReason: "controlled isolated execution",
      expectedRevision: 1,
      expectedSemanticDigest: "digest",
    });
    expect(result).toMatchObject({
      outcome: "completed",
      processedCount: 1,
      nonMaterialCount: 1,
    });
    expect(energy.claim).toHaveBeenCalledTimes(1);
    expect(energy.finalize).toHaveBeenCalledTimes(1);
    expect(training.claim).not.toHaveBeenCalled();
  });

  it("rejects a same-revision semantic-digest conflict before claim", async () => {
    const energy = serviceStub("energy-work");
    const worker = createPILowerLevelConfidenceRecoveryWorker({
      energyService: energy,
      trainingService: serviceStub(),
      executeEnabled: () => true,
    });
    const result = await worker.run({
      mode: "execute",
      domains: ["energy"],
      maximumItems: 1,
      productionExecutionAuthorized: true,
      acceptsRuntimeMutation: true,
      operationReason: "controlled isolated execution",
      expectedRevision: 1,
      expectedSemanticDigest: "changed-digest",
    });
    expect(result.outcome).toBe("baseline_conflict");
    expect(energy.claim).not.toHaveBeenCalled();
  });

  it("reports bounded pending, stale, failed, and terminal visibility", () => {
    const items = [{
      id: "pending",
      status: "pending",
      attemptCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      changedLocalDate: "2026-07-27",
    }, {
      id: "stale",
      status: "processing",
      attemptCount: 1,
      createdAt: "2026-07-27T01:00:00.000Z",
      processingStartedAt: "2026-07-27T01:00:00.000Z",
    }, {
      id: "failed",
      status: "failed",
      attemptCount: 5,
      createdAt: "2026-07-27T02:00:00.000Z",
    }];
    const result = createPILowerLevelConfidenceWorkStatusReadService({
      readStore: () => ({ piEnergyConfidenceWorkItems: items }),
      now: () => new Date("2026-07-28T00:00:00.000Z"),
    }).getStatus();
    expect(result.domains.energy).toMatchObject({
      pendingCount: 1,
      staleClaimCount: 1,
      failedCount: 1,
      retryEligibleWorkIds: ["pending", "stale"],
    });
  });

  it("keeps suppressed orchestration layers free of coordinator calls", () => {
    for (const file of [
      "src/domain/services/GoalEvaluationService.js",
      "src/domain/services/HomeBriefingService.js",
      "src/domain/services/MidweekBriefingService.js",
      "src/domain/services/WeeklyNarrativeService.js",
      "src/domain/services/TrainingPerformanceEventProducer.js",
    ]) {
      expect(fs.readFileSync(file, "utf8"))
        .not.toContain("PILowerLevelConfidenceWorkEnqueueService");
    }
  });
});

function serviceStub(workId = null, previewOutcome = "matched") {
  const work = workId ? {
    id: workId,
    status: "pending",
    attemptCount: 0,
    createdAt: "2026-07-27T00:00:00.000Z",
  } : null;
  return {
    captureBaseline: vi.fn(() => ({
      revision: 1,
      semanticDigest: "digest",
    })),
    listRecoverableWork: vi.fn(() => work ? [work] : []),
    preview: vi.fn((id) => ({
      outcome: previewOutcome,
      workId: id,
      expectedScoreMovement: 0,
    })),
    claim: vi.fn(async () => ({ outcome: "processing", committed: true })),
    finalize: vi.fn(async () => ({ outcome: previewOutcome, committed: true })),
  };
}
