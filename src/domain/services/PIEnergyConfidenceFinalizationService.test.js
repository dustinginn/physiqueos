import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPIEnergyConfidenceFinalizationService,
  createPIEnergyConfidenceWork,
  createPIEnergyFinalizationReceipt,
  createPIEnergyRollingWindow,
  mergePIEnergyConfidenceWork,
  PIEnergyFinalizationOutcome,
} from "./PIEnergyConfidenceFinalizationService";
import {
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";

const productionPath = path.resolve(
  process.cwd(),
  "private/founder/runtime-store.json"
);
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture({
  balance = 0,
  includeNutrition = true,
  includeActivity = true,
  partial = false,
  fault,
} = {}) {
  const source = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  const goal = source.goals.find((item) => item.primary && item.status === "active");
  const phase = goal.phases.find((item) => item.status === "active");
  const dates = [
    "2026-07-23",
    "2026-07-24",
    "2026-07-25",
    "2026-07-26",
    "2026-07-27",
  ];
  const canonical = [];
  for (const date of dates) {
    if (includeNutrition) canonical.push(nutrition(date, 2500 + balance, partial));
    if (includeActivity) canonical.push(activity(date, partial));
  }
  canonical.push(dexa());
  const store = {
    version: "isolated",
    revision: 28,
    lastCommitId: "isolated-baseline",
    updatedAt: "2026-07-27T00:00:00.000Z",
    goals: structuredClone(source.goals),
    canonicalEvidenceObjects: canonical,
    dexaScans: [],
    goalConfidenceSnapshots: structuredClone(source.goalConfidenceSnapshots),
    goalConfidenceHistory: structuredClone(source.goalConfidenceHistory),
    goalConfidenceContinuitySeeds: structuredClone(
      source.goalConfidenceContinuitySeeds
    ),
    piEnergyConfidenceWorkItems: [],
    piEnergyFinalizationReceipts: [],
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-energy-finalize-"));
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
    liveStore: store,
    goal,
    phase,
    now,
    service: createPIEnergyConfidenceFinalizationService({
      filePath,
      liveStore: store,
      now,
      createUnitOfWork,
    }),
  };
}

function nutrition(date, calories, partial) {
  return {
    canonicalId: `nutrition|${date}|nutrition_${date}`,
    evidence_type: "nutrition",
    lastObservedAt: date,
    quality: { status: "active" },
    payload: {
      id: `nutrition_${date}`,
      evidence_type: "nutrition",
      observed_at: date,
      date,
      daily_totals: { calories, completeness: partial ? "partial" : "complete" },
      quality: { status: partial ? "partial" : "complete" },
    },
  };
}
function activity(date, partial) {
  return {
    canonicalId: `activity_day|${date}`,
    evidence_type: "activity_day",
    lastObservedAt: date,
    quality: { status: "active" },
    payload: {
      id: `activity_${date}`,
      evidence_type: "activity_day",
      observed_at: date,
      date,
      daily_activity: {
        move_calories: 700,
        completeness: partial ? "partial" : "complete",
      },
      quality: { status: partial ? "partial" : "complete" },
    },
  };
}
function dexa() {
  return {
    canonicalId: "dexa_scan|2026-07-18|isolated",
    evidence_type: "dexa_scan",
    lastObservedAt: "2026-07-18",
    quality: { status: "active" },
    payload: {
      id: "dexa_isolated",
      evidence_type: "dexa_scan",
      measuredAt: "2026-07-18",
      restingMetabolicRate: { value: 1800, unit: "kcal/day" },
    },
  };
}
function workInput(f) {
  const window = createPIEnergyRollingWindow({
    changedLocalDate: "2026-07-27",
  });
  return {
    goalId: f.goal.id,
    phaseId: f.phase.id,
    operatingState: "calibration",
    changedLocalDate: "2026-07-27",
    sourceNutritionId: "nutrition_2026-07-27",
    sourceActivityId: "activity_2026-07-27",
    reason: "energy_correction_committed",
    rollingWindowId: window.id,
    evidenceCutoff: window.evidenceCutoff,
    createdAt: "2026-07-28T00:00:00.000Z",
  };
}
function persisted(f) {
  return JSON.parse(fs.readFileSync(f.filePath, "utf8"));
}

describe("PI Energy confidence finalization", () => {
  it("creates and merges deterministic source work", () => {
    const f = fixture();
    const input = workInput(f);
    const nutritionWork = createPIEnergyConfidenceWork({
      ...input,
      sourceActivityId: null,
      reason: "nutrition_committed",
    });
    const activityWork = createPIEnergyConfidenceWork({
      ...input,
      sourceNutritionId: null,
      reason: "activity_committed",
    });
    expect(nutritionWork.id).toBe(activityWork.id);
    const merged = mergePIEnergyConfidenceWork(nutritionWork, activityWork);
    expect(merged).toMatchObject({
      sourceNutritionId: "nutrition_2026-07-27",
      sourceActivityId: "activity_2026-07-27",
      status: "pending",
    });
  });

  it("enqueues once and replays without a revision change", async () => {
    const f = fixture();
    const first = await f.service.enqueue(workInput(f));
    const revision = persisted(f).revision;
    const replay = await f.service.enqueue(workInput(f));
    expect(first).toMatchObject({ outcome: "pending", committed: true });
    expect(replay).toMatchObject({
      outcome: PIEnergyFinalizationOutcome.MATCHED,
      committed: false,
    });
    expect(persisted(f).revision).toBe(revision);
    expect(persisted(f).piEnergyConfidenceWorkItems).toHaveLength(1);
  });

  it.each([
    [0, 60],
    [-400, 56],
    [400, 56],
  ])("publishes a bounded reliable transition for balance %s", async (
    balance,
    expectedScore
  ) => {
    const f = fixture({ balance });
    await f.service.enqueue(workInput(f));
    const baseline = f.service.captureBaseline();
    const result = await f.service.finalize(
      createPIEnergyConfidenceWork(workInput(f)).id,
      {
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
      }
    );
    const store = persisted(f);
    expect(result).toMatchObject({
      outcome: PIEnergyFinalizationOutcome.PUBLISHED_SUCCESSOR,
      committed: true,
    });
    expect(store.goalConfidenceHistory).toHaveLength(2);
    expect(store.goalConfidenceSnapshots).toHaveLength(1);
    expect(store.goalConfidenceSnapshots[0].currentScore).toBe(expectedScore);
    expect(store.piEnergyFinalizationReceipts).toHaveLength(1);
    expect(store.piEnergyConfidenceWorkItems[0].completionReceiptId)
      .toBe(store.piEnergyFinalizationReceipts[0].id);
    expect(store.revision).toBe(baseline.revision + 1);
    expect(store.goalConfidenceHistory.at(-1).commitId)
      .toBe(store.lastCommitId);
  });

  it("persists awaiting-pair without confidence history", async () => {
    const f = fixture({ includeActivity: false });
    const input = { ...workInput(f), sourceActivityId: null };
    await f.service.enqueue(input);
    const before = persisted(f).goalConfidenceHistory.length;
    const result = await f.service.finalize(
      createPIEnergyConfidenceWork(input).id
    );
    expect(result.outcome).toBe(PIEnergyFinalizationOutcome.AWAITING_PAIR);
    expect(persisted(f).goalConfidenceHistory).toHaveLength(before);
    expect(persisted(f).piEnergyFinalizationReceipts).toHaveLength(1);
  });

  it("treats a reliable same-state numeric correction as non-material", async () => {
    const f = fixture({ balance: 0 });
    await f.service.enqueue(workInput(f));
    await f.service.finalize(createPIEnergyConfidenceWork(workInput(f)).id);
    const store = persisted(f);
    store.canonicalEvidenceObjects
      .filter((item) => item.evidence_type === "nutrition")
      .forEach((item) => {
        item.payload.daily_totals.calories += 25;
      });
    const work = store.piEnergyConfidenceWorkItems[0];
    work.status = "pending";
    work.completionReceiptId = null;
    work.expectedSourceFingerprint = "sha256_corrected";
    fs.writeFileSync(f.filePath, `${JSON.stringify(store, null, 2)}\n`);
    Object.assign(f.liveStore, structuredClone(store));
    const historyCount = store.goalConfidenceHistory.length;
    const result = await f.service.finalize(work.id);
    expect(result.outcome).toBe(PIEnergyFinalizationOutcome.NOT_MATERIAL);
    expect(persisted(f).goalConfidenceHistory).toHaveLength(historyCount);
    expect(persisted(f).piEnergyFinalizationReceipts).toHaveLength(2);
  });

  it("replays a completed finalization byte-stably", async () => {
    const f = fixture();
    await f.service.enqueue(workInput(f));
    const workId = createPIEnergyConfidenceWork(workInput(f)).id;
    await f.service.finalize(workId);
    const before = fs.readFileSync(f.filePath);
    const result = await f.service.finalize(workId);
    expect(result).toMatchObject({
      outcome: PIEnergyFinalizationOutcome.MATCHED,
      committed: false,
    });
    expect(fs.readFileSync(f.filePath)).toEqual(before);
  });

  it("allows one winner when two finalizers race", async () => {
    const f = fixture();
    await f.service.enqueue(workInput(f));
    const workId = createPIEnergyConfidenceWork(workInput(f)).id;
    const baseline = f.service.captureBaseline();
    const outcomes = await Promise.all([
      f.service.finalize(workId, {
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
      }),
      f.service.finalize(workId, {
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
      }),
    ]);
    expect(outcomes.filter((item) =>
      item.outcome === PIEnergyFinalizationOutcome.PUBLISHED_SUCCESSOR
    )).toHaveLength(1);
    expect(outcomes.some((item) =>
      [
        PIEnergyFinalizationOutcome.MATCHED,
        PIEnergyFinalizationOutcome.BASELINE_CONFLICT,
      ].includes(item.outcome)
    )).toBe(true);
    expect(persisted(f).goalConfidenceHistory).toHaveLength(2);
    expect(persisted(f).piEnergyFinalizationReceipts).toHaveLength(1);
  });

  it("rejects same-revision semantic-digest drift", async () => {
    const f = fixture();
    await f.service.enqueue(workInput(f));
    const baseline = f.service.captureBaseline();
    const store = persisted(f);
    store.unrelatedDrift = true;
    fs.writeFileSync(f.filePath, `${JSON.stringify(store, null, 2)}\n`);
    const result = await f.service.finalize(
      createPIEnergyConfidenceWork(workInput(f)).id,
      {
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
      }
    );
    expect(result.outcome).toBe(PIEnergyFinalizationOutcome.BASELINE_CONFLICT);
    expect(persisted(f).goalConfidenceHistory).toHaveLength(1);
  });

  it("rolls back receipt and confidence on persistence failure", async () => {
    const base = fixture();
    const fileSystem = {
      read(target) {
        return fs.readFileSync(target, "utf8");
      },
      openExclusive(target) {
        return fs.openSync(target, "wx");
      },
      write() {
        throw new Error("temporary write failed");
      },
      syncFile(handle) {
        fs.fsyncSync(handle);
      },
      close(handle) {
        fs.closeSync(handle);
      },
      atomicReplace: fs.renameSync,
      syncDirectory() {},
      exists: fs.existsSync,
      remove: fs.unlinkSync,
    };
    const service = createPIEnergyConfidenceFinalizationService({
      filePath: base.filePath,
      liveStore: base.liveStore,
      now: base.now,
      createUnitOfWork: (options) => createFounderStoreUnitOfWork({
        ...options,
        fileSystem,
      }),
    });
    const result = await service.enqueue(workInput(base));
    expect(result.outcome).toBe(PIEnergyFinalizationOutcome.PERSISTENCE_FAILURE);
    expect(persisted(base).piEnergyConfidenceWorkItems).toHaveLength(0);
    expect(persisted(base).goalConfidenceHistory).toHaveLength(1);
  });

  it("recovers pending and stale processing work but not completed work", async () => {
    const f = fixture({ includeActivity: false });
    await f.service.enqueue({
      ...workInput(f),
      sourceActivityId: null,
    });
    expect(f.service.listRecoverableWork()).toHaveLength(1);
    expect(await f.service.claim(
      createPIEnergyConfidenceWork({
        ...workInput(f),
        sourceActivityId: null,
      }).id,
      { at: new Date("2026-07-28T00:00:00.000Z") }
    )).toMatchObject({ outcome: "processing", committed: true });
    const store = persisted(f);
    store.piEnergyConfidenceWorkItems[0].status = "processing";
    store.piEnergyConfidenceWorkItems[0].processingStartedAt =
      "2026-07-27T00:00:00.000Z";
    fs.writeFileSync(f.filePath, `${JSON.stringify(store, null, 2)}\n`);
    expect(f.service.listRecoverableWork()).toHaveLength(1);
    store.piEnergyConfidenceWorkItems[0].status = "completed";
    fs.writeFileSync(f.filePath, `${JSON.stringify(store, null, 2)}\n`);
    expect(f.service.listRecoverableWork()).toHaveLength(0);
  });

  it("retention preserves pending work and authoritative receipts", async () => {
    const f = fixture();
    await f.service.enqueue(workInput(f));
    await f.service.finalize(createPIEnergyConfidenceWork(workInput(f)).id);
    const before = persisted(f);
    await f.service.pruneTransient({
      at: new Date("2027-12-01T00:00:00.000Z"),
    });
    const after = persisted(f);
    expect(after.piEnergyFinalizationReceipts).toEqual(
      before.piEnergyFinalizationReceipts
    );
    expect(after.piEnergyConfidenceWorkItems).toHaveLength(1);
  });

  it("requires receipt linkage fields deterministically", () => {
    const input = {
      workId: "work",
      triggerId: "trigger",
      goalId: "goal",
      phaseId: "phase",
      operatingState: "calibration",
      energyInterpretationId: "interpretation",
      energyInterpretationFingerprint: "fingerprint",
      energyConsumptionId: "consumption",
      rollingWindowId: "window",
      sourceEvidenceIds: ["nutrition", "activity"],
      priorEnergyState: "insufficient_or_incomplete",
      currentEnergyState: "near_maintenance",
      reliability: "reliable",
      semanticChangeOutcome: "material_change",
      publicationEligibility: true,
      confidencePublicationOutcome: "published_successor",
      publishedAssessmentId: "assessment",
      firstConsumedAssessmentId: "assessment",
      completedAt: "2026-07-28T00:00:00.000Z",
      energyInterpretationVersion: "energy_v1",
    };
    expect(createPIEnergyFinalizationReceipt(input).id)
      .toBe(createPIEnergyFinalizationReceipt(input).id);
    expect(() => createPIEnergyFinalizationReceipt({
      ...input,
      workId: null,
    })).toThrow("workId is required");
  });

  it("marks the current production interpretation as already represented in an isolated clone", async () => {
    const source = JSON.parse(fs.readFileSync(productionPath, "utf8"));
    const goal = source.goals.find((item) => item.primary && item.status === "active");
    const phase = goal.phases.find((item) => item.status === "active");
    source.piEnergyConfidenceWorkItems = [];
    source.piEnergyFinalizationReceipts = [];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-energy-current-"));
    directories.push(directory);
    const filePath = path.join(directory, "runtime-store.json");
    fs.writeFileSync(filePath, `${JSON.stringify(source, null, 2)}\n`);
    const service = createPIEnergyConfidenceFinalizationService({
      filePath,
      liveStore: source,
      now: () => new Date("2026-07-26T21:00:00.000Z"),
    });
    const window = {
      id: "rolling_energy:2026-07-19:2026-07-25:America/Los_Angeles",
      evidenceCutoff: "2026-07-26T06:59:59.999Z",
    };
    const input = {
      goalId: goal.id,
      phaseId: phase.id,
      operatingState: "calibration",
      changedLocalDate: "2026-07-25",
      sourceNutritionId: "nutrition_2026-07-25_1",
      sourceActivityId: "activity_day_2026-07-25_applefitness_001",
      reason: "energy_correction_committed",
      rollingWindowId: window.id,
      evidenceCutoff: window.evidenceCutoff,
    };
    await service.enqueue(input);
    const result = await service.finalize(
      createPIEnergyConfidenceWork({
        ...input,
        createdAt: "2026-07-26T21:00:00.000Z",
      }).id
    );
    expect(result.outcome).toBe(PIEnergyFinalizationOutcome.ALREADY_CONSUMED);
    expect(JSON.parse(fs.readFileSync(filePath, "utf8")).goalConfidenceHistory)
      .toHaveLength(1);
  });
});
