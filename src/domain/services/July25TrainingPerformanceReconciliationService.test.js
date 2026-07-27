import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFounderStoreUnitOfWork,
  createNodeFounderStoreFileSystem,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createTrainingPerformanceEventPersistenceService } from "./TrainingPerformanceEventPersistenceService";
import {
  createJuly25TrainingPerformanceReconciliationService,
  JULY_25_TRAINING_RECONCILIATION_TARGET as TARGET,
  JULY_25_TRAINING_RECONCILIATION_VERSION,
} from "./July25TrainingPerformanceReconciliationService";
import { createTrainingPerformanceSuccessPresentation } from "./TrainingPerformanceSuccessPresentationService";

const directories = [];

afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("bounded July 25 Training performance reconciliation", () => {
  it("prepares exactly the six verified, deduplicated events", () => {
    const fixture = createFixture();
    const { events } = fixture.service.prepare();
    expect(events).toHaveLength(6);
    expect(events.filter((event) => event.eventType === "session_volume_pr")).toHaveLength(4);
    expect(events.filter((event) => event.eventType === "reps_at_load_pr")).toHaveLength(2);
    expect(events.some((event) => event.canonicalExerciseId === "spider_curl")).toBe(false);
    expect(new Set(events.map((event) => event.id))).toHaveLength(6);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalExerciseId: "ez_bar_curl", eventType: "session_volume_pr", currentValue: 3700, previousBaselineValue: 3380, improvement: 320 }),
      expect.objectContaining({ canonicalExerciseId: "ez_bar_curl", eventType: "reps_at_load_pr", reps: 15, load: 65, previousBaselineValue: 13 }),
      expect.objectContaining({ canonicalExerciseId: "cable_pushdown", eventType: "session_volume_pr", currentValue: 6160, previousBaselineValue: 5830 }),
      expect.objectContaining({ canonicalExerciseId: "straight_bar_cable_pushdown", eventType: "session_volume_pr", currentValue: 6720, previousBaselineValue: 6240 }),
      expect.objectContaining({ canonicalExerciseId: "straight_bar_cable_pushdown", eventType: "reps_at_load_pr", reps: 14, load: 120, previousBaselineValue: 13 }),
      expect.objectContaining({ canonicalExerciseId: "forearm_curl", eventType: "session_volume_pr", currentValue: 8720, previousBaselineValue: 7680 }),
    ]));
  });

  it("requires the exact source identifiers and rejects unconfirmed or mismatched sources", () => {
    const fixture = createFixture();
    expect(() => fixture.service.prepare({ ...TARGET, reviewId: "other" })).toThrow(/differs/);
    fixture.store.evidenceReviews[0].status = "pending";
    expect(() => fixture.service.prepare()).toThrow(/confirmed/);

    const packageMismatch = createFixture();
    packageMismatch.store.evidenceReviews[0].interpretedEvidence.package_id = "other";
    expect(() => packageMismatch.service.prepare()).toThrow(/package link/);

    const canonicalMismatch = createFixture();
    canonicalMismatch.store.canonicalEvidenceObjects[0].payload.id = "other";
    expect(() => canonicalMismatch.service.prepare()).toThrow(/canonical/);

    const analysisMismatch = createFixture();
    analysisMismatch.store.analyses[0].evidenceIds = [];
    expect(() => analysisMismatch.service.prepare()).toThrow(/analysis/);
  });

  it("aborts preparation for missing, additional, or semantically changed events", () => {
    const missing = createFixture();
    findObservation(missing.store, "forearm_curl").explanation_data.pr_detection.prs = [];
    expect(() => missing.service.prepare()).toThrow(/six-event/);

    const additional = createFixture();
    findObservation(additional.store, "spider_curl").explanation_data.pr_detection.prs =
      [volumePr(2240, 2000)];
    expect(() => additional.service.prepare()).toThrow(/six-event/);

    const changed = createFixture();
    findObservation(changed.store, "cable_pushdown")
      .explanation_data.pr_detection.prs[0].previous_best = 5800;
    expect(() => changed.service.prepare()).toThrow(/verified contract/);
  });

  it("atomically persists the batch, receipt, and one audit marker", async () => {
    const fixture = createFixture();
    const beforeConfirmation = fixture.store.evidenceReviews[0].confirmation.confirmedAt;
    const result = await fixture.service.reconcile();
    expect(result).toMatchObject({ outcome: "created", committed: true, idempotent: false, revision: 1 });
    expect(fixture.store.trainingPerformanceEvents).toHaveLength(6);
    expect(fixture.store.migrationMarkers).toEqual([
      expect.objectContaining({
        schemaVersion: JULY_25_TRAINING_RECONCILIATION_VERSION,
        sourceReviewId: TARGET.reviewId,
        reconciledEventIds: expect.arrayContaining(result.newEvents.map((event) => event.id)),
      }),
    ]);
    const step = fixture.store.evidenceReviews[0].commitProgress.training_performance_events;
    expect(step.result).toMatchObject({
      outcome: "created",
      newlyCreatedEvents: result.newEvents,
      existingEvents: [],
    });
    expect(fixture.store.evidenceReviews[0].confirmation.confirmedAt).toBe(beforeConfirmation);
    expect(JSON.parse(fs.readFileSync(fixture.filePath, "utf8")).trainingPerformanceEvents).toHaveLength(6);
  });

  it("replays without a write and preserves the original creation receipt", async () => {
    const fixture = createFixture();
    await fixture.service.reconcile();
    const persistedAfterFirst = fs.readFileSync(fixture.filePath, "utf8");
    const receiptAfterFirst = structuredClone(
      fixture.store.evidenceReviews[0].commitProgress.training_performance_events
    );
    const second = await fixture.service.reconcile();
    expect(second).toMatchObject({
      outcome: "matched",
      committed: false,
      idempotent: true,
      receiptPreserved: true,
    });
    expect(fixture.store.trainingPerformanceEvents).toHaveLength(6);
    expect(fixture.store.migrationMarkers).toHaveLength(1);
    expect(fixture.store.evidenceReviews[0].commitProgress.training_performance_events)
      .toEqual(receiptAfterFirst);
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(persistedAfterFirst);
  });

  it("rolls back events, receipt, and marker on persistence failure", async () => {
    const baseFileSystem = createNodeFounderStoreFileSystem();
    const fixture = createFixture({
      createUnitOfWork: (options) => createFounderStoreUnitOfWork({
        ...options,
        fileSystem: {
          ...baseFileSystem,
          atomicReplace() {
            throw new Error("injected");
          },
        },
      }),
    });
    const before = fs.readFileSync(fixture.filePath, "utf8");
    const result = await fixture.service.reconcile();
    expect(result).toMatchObject({ outcome: "persistence_failure", committed: false });
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(before);
    expect(fixture.store.trainingPerformanceEvents).toEqual([]);
    expect(fixture.store.migrationMarkers).toEqual([]);
    expect(fixture.store.evidenceReviews[0].commitProgress).toEqual({});
  });

  it("aborts the full reconciliation on a semantic identity collision", async () => {
    const fixture = createFixture();
    const [event] = fixture.service.prepare().events;
    fixture.store.trainingPerformanceEvents.push({
      ...event,
      previousBaselineValue: event.previousBaselineValue - 1,
      improvement: event.improvement + 1,
    });
    fs.writeFileSync(fixture.filePath, `${JSON.stringify(fixture.store)}\n`);
    const before = fs.readFileSync(fixture.filePath, "utf8");
    const result = await fixture.service.reconcile();
    expect(result).toMatchObject({ outcome: "semantic_collision", committed: false });
    expect(fs.readFileSync(fixture.filePath, "utf8")).toBe(before);
    expect(fixture.store.migrationMarkers).toEqual([]);
  });

  it("drives the locked six-row saved-evidence presentation after refresh", async () => {
    const fixture = createFixture();
    await fixture.service.reconcile();
    const refreshed = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    const presentation = createTrainingPerformanceSuccessPresentation(
      refreshed.evidenceReviews[0]
    );
    expect(presentation).toMatchObject({ recordCount: 6, summary: "6 new records" });
    expect(new Set(presentation.items.map((item) => `${item.exerciseName}|${item.eventType}`))).toHaveLength(6);
  });
});

function createFixture({ createUnitOfWork } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jul25-reconcile-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const store = createStore();
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  const persistenceService = createTrainingPerformanceEventPersistenceService({
    runtimeStorePath: filePath,
    liveStore: store,
    createUnitOfWork,
    now: () => new Date("2026-07-26T03:00:00.000Z"),
  });
  return {
    filePath,
    store,
    service: createJuly25TrainingPerformanceReconciliationService({
      liveStore: store,
      persistenceService,
      now: () => new Date("2026-07-26T03:00:00.000Z"),
    }),
  };
}

function createStore() {
  const exercises = [
    exercise("Spider Curls", [[14, 40], [14, 40], [14, 40], [14, 40]]),
    exercise("EZ Bar Curls", [[13, 70], [12, 70], [15, 65], [15, 65]]),
    exercise("Cable Rope Pushdowns", [[14, 110], [14, 110], [14, 110], [14, 110]]),
    exercise("Straight Bar Cable Pushdowns", [[14, 120], [14, 120], [14, 120], [14, 120]]),
    exercise("Forearm Curls", [[30, 80], [28, 80], [25, 80], [26, 80]]),
  ];
  const canonical = {
    canonicalId: TARGET.canonicalTrainingId,
    sourceEvidencePackageIds: [TARGET.evidencePackageId],
    payload: {
      id: TARGET.sessionId,
      evidence_type: "training",
      observed_at: TARGET.workoutDate,
      exercises,
    },
  };
  return {
    version: "test",
    revision: 0,
    updatedAt: "2026-07-26T02:31:00.342Z",
    evidencePackages: [{ package_id: TARGET.evidencePackageId }],
    canonicalEvidenceObjects: [canonical],
    analyses: [{
      id: TARGET.analysisId,
      evidenceIds: [TARGET.canonicalTrainingId],
      metadata: {
        trainingPerformance: {
          exerciseObservations: [
            observation("spider_curl", [], 2240),
            observation("ez_bar_curl", [repsPr(15, 65, 13), repsPr(15, 65, 13), volumePr(3700, 3380)], 3700),
            observation("cable_pushdown", [volumePr(6160, 5830)], 6160),
            observation("straight_bar_cable_pushdown", [repsPr(14, 120, 13), repsPr(14, 120, 13), volumePr(6720, 6240)], 6720),
            observation("forearm_curl", [volumePr(8720, 7680)], 8720),
          ],
        },
      },
    }],
    evidenceReviews: [{
      id: TARGET.reviewId,
      status: "confirmed",
      confirmation: { confirmedAt: TARGET.confirmationTimestamp, confirmedBy: "founder" },
      interpretedEvidence: {
        package_id: TARGET.evidencePackageId,
        evidence_objects: [canonical.payload],
      },
      commitProgress: {},
    }, {
      id: "unrelated",
      status: "confirmed",
      confirmation: { confirmedAt: "2026-07-24T00:00:00.000Z" },
      commitProgress: { untouched: true },
    }],
    trainingPerformanceEvents: [],
    migrationMarkers: [],
  };
}

function findObservation(store, key) {
  return store.analyses[0].metadata.trainingPerformance.exerciseObservations
    .find((item) => item.exercise.key === key);
}

function exercise(name, sets) {
  return {
    name,
    sets: sets.map(([reps, weight], index) => ({
      set_number: index + 1, reps, weight, weight_unit: "lb",
    })),
  };
}

function observation(key, prs, totalVolume) {
  return {
    exercise: { key, name: key },
    explanation_data: {
      last_session: {
        date: TARGET.workoutDate,
        session_id: TARGET.sessionId,
        total_volume: totalVolume,
      },
      pr_detection: { prs },
    },
  };
}

function volumePr(value, previousBest) {
  return { type: "session_volume", value, previous_best: previousBest, unit: "lb" };
}

function repsPr(value, load, previousBest) {
  return {
    type: "reps_at_load", value, previous_best: previousBest,
    load, load_unit: "lb", unit: "reps",
  };
}
