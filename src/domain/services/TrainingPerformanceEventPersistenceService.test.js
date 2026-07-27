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
