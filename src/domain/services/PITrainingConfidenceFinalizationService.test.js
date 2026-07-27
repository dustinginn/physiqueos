import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPITrainingConfidenceFinalizationService,
  createPITrainingConfidenceWork,
  mergePITrainingConfidenceWork,
  PITrainingFinalizationOutcome,
} from "./PITrainingConfidenceFinalizationService";
import {
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";

const productionPath = path.resolve(
  process.cwd(), "private/founder/runtime-store.json"
);
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function category(name, status) {
  return {
    id: `performance|category|${name}`,
    category: name,
    status,
    supporting_session_ids: [`${name}_1`, `${name}_2`],
    explanation_data: { exercise_count: 2 },
  };
}

function report(statuses = ["regressing", "regressing"]) {
  return {
    categoryObservations: statuses.map((status, index) =>
      category(`category_${index}`, status)
    ),
    exerciseObservations: statuses.map((status, index) => ({
      id: `performance|exercise|exercise_${index}`,
      status,
      supporting_session_ids: [`exercise_${index}_1`, `exercise_${index}_2`],
      explanation_data: { frequency: { total_sessions: 2 } },
    })),
  };
}

function fixture({ statuses, omitAnalysis = false, fault } = {}) {
  const source = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  const goal = source.goals.find((item) => item.primary && item.status === "active");
  const phase = goal.phases.find((item) => item.status === "active");
  const sessionId = "training_session_isolated";
  const analysisId = "training_analysis_isolated";
  const store = {
    version: "isolated",
    revision: 28,
    lastCommitId: "isolated-baseline",
    updatedAt: "2026-07-27T00:00:00.000Z",
    goals: structuredClone(source.goals),
    canonicalEvidenceObjects: [{
      canonicalId: `training_session|2026-07-27|${sessionId}`,
      evidence_type: "training",
      quality: { status: "active" },
      payload: { id: sessionId, evidence_type: "training" },
    }],
    analyses: omitAnalysis ? [] : [{
      id: analysisId,
      metadata: { trainingPerformance: report(statuses) },
    }],
    goalConfidenceSnapshots: structuredClone(source.goalConfidenceSnapshots),
    goalConfidenceHistory: structuredClone(source.goalConfidenceHistory),
    goalConfidenceContinuitySeeds: structuredClone(
      source.goalConfidenceContinuitySeeds
    ),
    piTrainingConfidenceWorkItems: [],
    piTrainingFinalizationReceipts: [],
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-training-finalize-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`);
  let tick = 0;
  const now = () => new Date(`2026-07-28T00:00:0${tick++}.000Z`);
  const createUnitOfWork = (options) => createFounderStoreUnitOfWork({
    ...options,
    createCommitId: () => `isolated-commit-${tick}`,
    createTransactionId: () => `isolated-tx-${tick}`,
    ...(fault ? { fileSystem: fault } : {}),
  });
  return {
    filePath,
    store,
    goal,
    phase,
    sessionId,
    analysisId,
    service: createPITrainingConfidenceFinalizationService({
      filePath, liveStore: store, now, createUnitOfWork,
    }),
  };
}

function input(f, overrides = {}) {
  return {
    goalId: f.goal.id,
    phaseId: f.phase.id,
    operatingState: "calibration",
    canonicalTrainingSessionId: f.sessionId,
    finalizedTrainingReportId: f.analysisId,
    sourceTrainingEvidenceIds: [f.sessionId],
    performanceEventBatchId: `training_event_batch|${f.sessionId}|zero`,
    performanceEventIds: [],
    categoryRollupFingerprint: "category-rollup-isolated",
    analysisComplete: true,
    performanceEventGenerationComplete: true,
    performanceEventPersistenceComplete: true,
    pendingReconciliation: false,
    reason: "performance_event_batch_finalized",
    evidenceCutoff: "2026-07-27T23:59:59.999Z",
    createdAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function persisted(f) {
  return JSON.parse(fs.readFileSync(f.filePath, "utf8"));
}

async function enqueue(f, overrides) {
  const result = await f.service.enqueue(input(f, overrides));
  return result.work;
}

describe("PI Training confidence finalization", () => {
  it("merges repeated session callbacks into one deterministic work item", () => {
    const initial = createPITrainingConfidenceWork(input(fixture(), {
      performanceEventIds: ["event_b"],
    }));
    const incoming = createPITrainingConfidenceWork(input(fixture(), {
      performanceEventIds: ["event_a", "event_b"],
    }));
    const merged = mergePITrainingConfidenceWork(initial, incoming);
    expect(merged.id).toBe(initial.id);
    expect(merged.performanceEventIds).toEqual(["event_a", "event_b"]);
  });

  it("keeps concurrent duplicate callbacks revision-locked to one work item", async () => {
    const f = fixture();
    const [left, right] = await Promise.all([
      f.service.enqueue(input(f)),
      f.service.enqueue(input(f)),
    ]);
    expect([left.outcome, right.outcome]).toContain("pending");
    expect(persisted(f).piTrainingConfidenceWorkItems).toHaveLength(1);
  });

  it("publishes one atomic successor and receipt for a broad regression", async () => {
    const f = fixture();
    const beforeScore = f.store.goalConfidenceHistory.at(-1).assessment.score.current;
    const work = await enqueue(f);
    const result = await f.service.finalize(work.id);
    const state = persisted(f);
    expect(result).toMatchObject({
      outcome: PITrainingFinalizationOutcome.PUBLISHED_SUCCESSOR,
      committed: true,
    });
    expect(state.piTrainingFinalizationReceipts).toHaveLength(1);
    expect(state.goalConfidenceHistory).toHaveLength(
      f.store.goalConfidenceHistory.length
    );
    const assessment = state.goalConfidenceHistory.at(-1).assessment;
    expect(assessment.score.current).toBe(beforeScore - 2);
    expect(assessment.context.type).toBe("training_interpretation");
    expect(state.piTrainingConfidenceWorkItems[0].completionReceiptId)
      .toBe(state.piTrainingFinalizationReceipts[0].id);
  });

  it("supports a finalized zero-event session and replays byte-stably", async () => {
    const f = fixture();
    const work = await enqueue(f);
    const first = await f.service.finalize(work.id);
    const bytes = fs.readFileSync(f.filePath, "utf8");
    const second = await f.service.finalize(work.id);
    expect(first.committed).toBe(true);
    expect(second.outcome).toBe(PITrainingFinalizationOutcome.MATCHED);
    expect(fs.readFileSync(f.filePath, "utf8")).toBe(bytes);
    expect(persisted(f).piTrainingFinalizationReceipts[0]).toMatchObject({
      performanceEventIds: [],
      performanceEventBatchId: `training_event_batch|${f.sessionId}|zero`,
    });
  });

  it("holds incomplete interpretation as durable recoverable work", async () => {
    const f = fixture({ omitAnalysis: true });
    const work = await enqueue(f, {
      analysisComplete: false,
      finalizedTrainingReportId: null,
    });
    const result = await f.service.finalize(work.id);
    expect(result.outcome).toBe(
      PITrainingFinalizationOutcome.AWAITING_FINALIZATION
    );
    expect(persisted(f).piTrainingConfidenceWorkItems[0].status)
      .toBe("awaiting_final_training_interpretation");
  });

  it("rejects stale baseline expectations without writing", async () => {
    const f = fixture();
    const work = await enqueue(f);
    const bytes = fs.readFileSync(f.filePath, "utf8");
    const result = await f.service.finalize(work.id, { expectedRevision: 1 });
    expect(result.outcome).toBe(PITrainingFinalizationOutcome.BASELINE_CONFLICT);
    expect(fs.readFileSync(f.filePath, "utf8")).toBe(bytes);
  });

  it("recovers stale claims and enforces the bounded attempt limit", async () => {
    const f = fixture({ omitAnalysis: true });
    const work = await enqueue(f, {
      analysisComplete: false,
      finalizedTrainingReportId: null,
    });
    await f.service.claim(work.id, {
      at: new Date("2026-07-28T00:00:00.000Z"),
    });
    expect(f.service.listRecoverableWork({
      at: new Date("2026-07-28T00:16:00.000Z"),
    }).map((item) => item.id)).toContain(work.id);
    const state = persisted(f);
    state.piTrainingConfidenceWorkItems[0].attemptCount = 5;
    fs.writeFileSync(f.filePath, `${JSON.stringify(state, null, 2)}\n`);
    expect((await f.service.finalize(work.id)).outcome)
      .toBe(PITrainingFinalizationOutcome.ATTEMPT_LIMIT_REACHED);
  });

  it("keeps transient cleanup bounded and retains confidence-linked work", async () => {
    const f = fixture();
    const work = await enqueue(f);
    await f.service.finalize(work.id);
    const result = await f.service.pruneTransient({
      at: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(result.outcome).toBe(PITrainingFinalizationOutcome.MATCHED);
    expect(persisted(f).piTrainingConfidenceWorkItems).toHaveLength(1);
  });
});
