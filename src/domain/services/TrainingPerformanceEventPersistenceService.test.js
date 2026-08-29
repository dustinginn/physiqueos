import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNodeFounderStoreFileSystem,
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createTrainingPerformanceEvent } from "../models/trainingPerformanceEvent";
import {
  createTrainingPerformanceEventPersistenceService,
  TrainingPerformanceEventPersistenceOutcome as Outcome,
} from "./TrainingPerformanceEventPersistenceService";
import {
  createShallowWritableFounderRuntime,
  detachBoundedFounderCollections,
} from "../../platform/database/BoundedFounderRuntimeMutation.js";

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("TrainingPerformanceEventPersistenceService", () => {
  it("atomically creates a batch and matches the same events idempotently on replay", async () => {
    const fixture = createFixture();
    const events = [volumeEvent(), repsEvent()];

    const first = await fixture.service.persistEventBatch(events);
    expect(first).toMatchObject({
      outcome: Outcome.CREATED,
      committed: true,
      newEvents: events,
      existingEvents: [],
      revision: 1,
    });
    expect(JSON.parse(fs.readFileSync(fixture.filePath, "utf8")).trainingPerformanceEvents).toHaveLength(2);

    const afterFirst = fs.readFileSync(fixture.filePath, "utf8");
    const second = await fixture.service.persistEventBatch(events.map((event) => ({
      ...event,
      createdAt: "2026-08-01T00:00:00.000Z",
    })));
    expect(second).toMatchObject({
      outcome: Outcome.MATCHED,
      committed: false,
      newEvents: [],
    });
    expect(second.existingEvents).toHaveLength(2);
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(afterFirst);
  });

  it("rejects a deterministic-ID semantic collision without writing", async () => {
    const existing = volumeEvent();
    const fixture = createFixture({ events: [existing] });
    const before = fs.readFileSync(fixture.filePath, "utf8");
    const conflicting = {
      ...existing,
      previousBaselineValue: existing.previousBaselineValue - 10,
      improvement: existing.improvement + 10,
    };
    const result = await fixture.service.persistEventBatch([conflicting]);
    expect(result).toMatchObject({
      outcome: Outcome.COLLISION,
      committed: false,
      collisionEventId: existing.id,
    });
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(before);
  });

  it("does not leave a partial batch when persistence fails", async () => {
    const baseFileSystem = createNodeFounderStoreFileSystem();
    const fixture = createFixture({
      createUnitOfWork: (options) =>
        createFounderStoreUnitOfWork({
          ...options,
          fileSystem: {
            ...baseFileSystem,
            atomicReplace() {
              throw new Error("injected persistence failure");
            },
          },
        }),
    });
    const before = fs.readFileSync(fixture.filePath, "utf8");
    const result = await fixture.service.persistEventBatch([
      volumeEvent(),
      repsEvent(),
    ]);
    expect(result).toMatchObject({
      outcome: Outcome.PERSISTENCE_FAILURE,
      committed: false,
      newEvents: [],
    });
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(before);
    expect(fixture.liveStore.trainingPerformanceEvents).toEqual([]);
  });

  it("returns no_events without opening a transaction", async () => {
    const fixture = createFixture({
      createUnitOfWork: () => {
        throw new Error("transaction should not open");
      },
    });
    await expect(fixture.service.persistEventBatch([])).resolves.toMatchObject({
      outcome: Outcome.NO_EVENTS,
      committed: false,
    });
  });

  it("commits through one bounded runtime load without cloning unrelated Founder state", async () => {
    const fixture = createBoundedFixture();
    const events = [volumeEvent(), repsEvent()];
    const batch = eventBatch(events);

    const persisted = await fixture.service.persistEventBatch(events, {
      batchId: batch.id,
      batch,
      mutateCandidate(candidate) {
        candidate.piTrainingConfidenceWorkItems = [
          ...(candidate.piTrainingConfidenceWorkItems ?? []),
          { id: "work-current", performanceEventBatchId: batch.id },
        ];
      },
      finalizeCandidate({ stagedState, commitId }) {
        stagedState.trainingPerformanceEventBatches =
          stagedState.trainingPerformanceEventBatches.map((item) =>
            item.id === batch.id ? { ...item, sourceCommitId: commitId } : item
          );
      },
      validateFinalized(candidate) {
        return candidate.piTrainingConfidenceWorkItems.some(
          (item) => item.performanceEventBatchId === batch.id
        );
      },
      selectFinalized(candidate) {
        return {
          workIds: candidate.piTrainingConfidenceWorkItems
            .filter((item) => item.performanceEventBatchId === batch.id)
            .map((item) => item.id),
        };
      },
    });

    expect(persisted).toMatchObject({
      outcome: Outcome.CREATED,
      committed: true,
      newEvents: events,
      selected: { workIds: ["work-current"] },
      changedCollections: [
        "trainingPerformanceEvents",
        "trainingPerformanceEventBatches",
        "piTrainingConfidenceWorkItems",
      ],
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
        boundedCollectionCloneCount: 3,
      },
    });
    expect(fixture.mutationCalls).toBe(1);
    expect(fixture.originalTopLevelFrozen).toBe(true);
    expect(fixture.originalUnrelatedReferencePreserved).toBe(true);
    expect(fixture.original.trainingPerformanceEvents).toEqual([]);
    expect(fixture.runtime.trainingPerformanceEvents).toHaveLength(2);
  });

  it("recognizes an exact post-event pre-progress replay without duplicating events or work", async () => {
    const fixture = createBoundedFixture();
    const events = [volumeEvent(), repsEvent()];
    const batch = eventBatch(events);
    const options = {
      batchId: batch.id,
      batch,
      mutateCandidate(candidate) {
        candidate.piTrainingConfidenceWorkItems = [
          ...(candidate.piTrainingConfidenceWorkItems ?? []),
          { id: "work-current", performanceEventBatchId: batch.id },
        ];
      },
      finalizeCandidate({ stagedState, commitId }) {
        stagedState.trainingPerformanceEventBatches =
          stagedState.trainingPerformanceEventBatches.map((item) =>
            item.id === batch.id ? { ...item, sourceCommitId: commitId } : item
          );
      },
      validateFinalized(candidate) {
        return candidate.piTrainingConfidenceWorkItems.filter(
          (item) => item.performanceEventBatchId === batch.id
        ).length === 1;
      },
    };

    await fixture.service.persistEventBatch(events, options);
    const afterCommit = structuredClone(fixture.runtime);
    const replay = await fixture.service.persistEventBatch(events, options);

    expect(replay).toMatchObject({
      outcome: Outcome.MATCHED,
      committed: false,
      newEvents: [],
    });
    expect(replay.existingEvents).toHaveLength(2);
    expect(fixture.runtime).toEqual(afterCommit);
    expect(fixture.runtime.trainingPerformanceEvents).toHaveLength(2);
    expect(fixture.runtime.trainingPerformanceEventBatches).toHaveLength(1);
    expect(fixture.runtime.piTrainingConfidenceWorkItems).toHaveLength(1);
  });

  it("fails closed on a partial persisted batch and leaves the baseline unchanged", async () => {
    const events = [volumeEvent(), repsEvent()];
    const batch = eventBatch(events);
    const fixture = createBoundedFixture({
      trainingPerformanceEvents: [events[0]],
      trainingPerformanceEventBatches: [{ ...batch, sourceCommitId: "prior" }],
    });
    const before = structuredClone(fixture.runtime);

    const persisted = await fixture.service.persistEventBatch(events, {
      batchId: batch.id,
      batch,
    });

    expect(persisted).toMatchObject({
      outcome: Outcome.COLLISION,
      committed: false,
      collisionEventId: batch.id,
    });
    expect(fixture.runtime).toEqual(before);
  });

  it("rolls back a bounded persistence failure without mutating aliased baseline collections", async () => {
    const fixture = createBoundedFixture({ failBeforePublish: true });
    const before = structuredClone(fixture.runtime);

    const persisted = await fixture.service.persistEventBatch([
      volumeEvent(),
      repsEvent(),
    ]);

    expect(persisted).toMatchObject({
      outcome: Outcome.PERSISTENCE_FAILURE,
      committed: false,
    });
    expect(fixture.runtime).toEqual(before);
    expect(fixture.original.trainingPerformanceEvents).toEqual([]);
  });
});

function createFixture({ events = [], createUnitOfWork } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "training-events-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    version: "test",
    revision: 0,
    updatedAt: "2026-07-26T00:00:00.000Z",
    trainingPerformanceEvents: structuredClone(events),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath,
    liveStore,
    service: createTrainingPerformanceEventPersistenceService({
      runtimeStorePath: filePath,
      liveStore,
      createUnitOfWork,
      now: () => new Date("2026-07-26T02:31:01.000Z"),
    }),
  };
}

function createBoundedFixture({
  trainingPerformanceEvents = [],
  trainingPerformanceEventBatches = [],
  failBeforePublish = false,
} = {}) {
  let runtime = {
    revision: 17,
    trainingPerformanceEvents: structuredClone(trainingPerformanceEvents),
    trainingPerformanceEventBatches: structuredClone(trainingPerformanceEventBatches),
    piTrainingConfidenceWorkItems: [],
    unrelatedFounderState: { payload: "x".repeat(2_000_000) },
  };
  const original = Object.freeze({ ...runtime });
  let mutationCalls = 0;
  let originalUnrelatedReferencePreserved = false;
  const mutateCanonicalRuntime = async ({ allowedCollections, mutate }) => {
    mutationCalls += 1;
    const loaded = Object.freeze({ ...runtime });
    const candidate = createShallowWritableFounderRuntime(loaded);
    originalUnrelatedReferencePreserved =
      candidate.unrelatedFounderState === loaded.unrelatedFounderState;
    const detachedCollectionCount = detachBoundedFounderCollections(
      candidate,
      allowedCollections
    );
    const result = await mutate(candidate, { commandId: `commit-${mutationCalls}` });
    if (failBeforePublish) throw new Error("injected bounded persistence failure");
    const changedCollections = allowedCollections.filter((collection) =>
      JSON.stringify(candidate[collection]) !== JSON.stringify(runtime[collection])
    );
    runtime = { ...runtime };
    for (const collection of changedCollections) {
      runtime[collection] = structuredClone(candidate[collection]);
    }
    return {
      committed: true,
      commitId: `commit-${mutationCalls}`,
      revision: runtime.revision + (changedCollections.length ? 1 : 0),
      result: structuredClone(result),
      changedCollections,
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
        collectionSnapshotMode: "digest",
        boundedCollectionCloneCount: detachedCollectionCount,
      },
    };
  };
  return {
    original,
    get runtime() { return runtime; },
    get mutationCalls() { return mutationCalls; },
    get originalTopLevelFrozen() { return Object.isFrozen(original); },
    get originalUnrelatedReferencePreserved() {
      return originalUnrelatedReferencePreserved;
    },
    service: createTrainingPerformanceEventPersistenceService({
      mutateCanonicalRuntime,
    }),
  };
}

function eventBatch(events) {
  return {
    id: "training-event-batch-current",
    sourceCommitId: "pending_source_commit",
    performanceEventIds: events.map((event) => event.id).sort(),
  };
}

function volumeEvent() {
  return createTrainingPerformanceEvent({
    eventType: "session_volume_pr",
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: "canonical-session",
    sourceSessionId: "session",
    sourceAnalysisId: "analysis",
    workoutDate: "2026-07-25",
    canonicalExerciseId: "cable_pushdown",
    canonicalExerciseName: "Cable Rope Pushdowns",
    currentValue: 6160,
    previousBaselineValue: 5830,
    sessionVolume: 6160,
    unit: "lb",
    createdAt: "2026-07-26T02:31:00.000Z",
  });
}

function repsEvent() {
  return createTrainingPerformanceEvent({
    eventType: "reps_at_load_pr",
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: "canonical-session",
    sourceSessionId: "session",
    sourceAnalysisId: "analysis",
    workoutDate: "2026-07-25",
    canonicalExerciseId: "ez_bar_curl",
    canonicalExerciseName: "EZ Bar Curls",
    currentValue: 15,
    previousBaselineValue: 13,
    load: 65,
    loadUnit: "lb",
    reps: 15,
    unit: "reps",
    createdAt: "2026-07-26T02:31:00.000Z",
  });
}
