import { describe, expect, it } from "vitest";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import {
  createCanonicalEvidenceObservationsV3,
} from "../../domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { selectStrategicallyEligibleEvidenceV3 } from "../../domain/intelligence/v3/EvidenceEligibilityV3.js";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "../commands/Phase3CommandService.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";

const OWNER = "user_founder_001";

describe("Native HealthKit V1 ingestion contract", () => {
  it("is command-receipt idempotent and observation-idempotent across different delivery keys", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({
      records,
      now: () => new Date("2026-09-12T19:00:00.000Z"),
    });
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports,
    });
    const payload = { batchId: "healthkit-batch-one", observations: [activitySummary(), workout()] };
    const first = await service.execute(command("healthkit-delivery-key-0001", payload));
    const receiptReplay = await service.execute(command("healthkit-delivery-key-0001", payload));
    const observationReplay = await service.execute(command("healthkit-delivery-key-0002", {
      ...payload,
      batchId: "healthkit-batch-two",
    }));

    expect(first.outcome).toBe("committed");
    expect(receiptReplay.outcome).toBe("replayed");
    expect(observationReplay.receipt.result).toMatchObject({
      status: "matched",
      createdCount: 0,
      matchedCount: 2,
      cursorResponsibility: "device",
    });
    const snapshot = records.snapshot();
    expect(snapshot.healthKitObservations).toHaveLength(2);
    expect(snapshot.canonicalEvidenceObjects).toHaveLength(1);
    expect(snapshot.evidencePackages).toEqual([]);
  });

  it("rejects idempotency-key reuse with a different payload", async () => {
    const records = recordStore();
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: createCanonicalPersistenceCommandPorts({ records }),
    });
    await service.execute(command("healthkit-same-key", {
      batchId: "healthkit-batch-one",
      observations: [workout({ externalId: "hk-workout-001" })],
    }));
    await expect(service.execute(command("healthkit-same-key", {
      batchId: "healthkit-batch-two",
      observations: [workout({ externalId: "hk-workout-002" })],
    }))).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
    expect(records.snapshot().healthKitObservations).toHaveLength(1);
  });

  it("atomically creates one source observation under concurrent duplicate delivery", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    const payload = {
      batchId: "healthkit-concurrent-batch",
      observations: [workout({ activityType: "Outdoor Run" })],
    };
    const [first, second] = await Promise.all([
      ports.ingestHealthKitObservations(context("delivery-concurrent-one", payload)),
      ports.ingestHealthKitObservations(context("delivery-concurrent-two", payload)),
    ]);
    expect([first.result.createdCount, second.result.createdCount].sort()).toEqual([0, 1]);
    expect(records.snapshot().healthKitObservations).toHaveLength(1);
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
  });

  it("stores source observations separately and never adds workout calories to the daily total", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({
      records,
      now: () => new Date("2026-09-12T19:00:00.000Z"),
    });
    const result = await ports.ingestHealthKitObservations(context("delivery-one", {
      batchId: "healthkit-batch-one",
      observations: [
        activitySummary({ moveCalories: 700 }),
        workout({ activeCalories: 400, activityType: "Outdoor Run" }),
      ],
    }));
    const snapshot = records.snapshot();
    const day = snapshot.canonicalEvidenceObjects[0].payload;
    const sourceWorkout = snapshot.healthKitObservations.find((item) => item.observationType === "workout");

    expect(result.result.activityDayCanonicalizedCount).toBe(1);
    expect(day.daily_activity.move_calories).toBe(700);
    expect(day.derived_metrics.workout_active_calories_additive).toBe(false);
    expect(day.references.training_session_ids).toEqual([]);
    expect(sourceWorkout.reconciliation).toMatchObject({
      state: "workout_canonicalization_deferred",
      reason: "canonical_workout_evidence_eligibility_boundary_not_yet_separate",
    });
    expect(sourceWorkout.evidenceEligibility.state).toBe("not_assessed");
    expect(sourceWorkout).not.toHaveProperty("evidence_type");
  });

  it("keeps strength detail authoritative and persists only a server-owned match candidate", async () => {
    const original = detailedSession();
    const records = recordStore([original]);
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-strength", {
      batchId: "healthkit-strength-batch",
      observations: [workout()],
    }));
    const snapshot = records.snapshot();
    expect(snapshot.healthKitObservations[0].reconciliation).toMatchObject({
      state: "training_match_candidate",
      confirmationRequired: true,
      candidates: [{ canonicalId: "training-session-one" }],
    });
    expect(snapshot.canonicalEvidenceObjects[0]).toEqual(original);
  });

  it("leaves ambiguous strength matches unlinked and preserves both structured sessions", async () => {
    const first = detailedSession("training-session-one");
    const second = detailedSession("training-session-two");
    const records = recordStore([first, second]);
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-ambiguous", {
      batchId: "healthkit-ambiguous-batch",
      observations: [workout()],
    }));
    const snapshot = records.snapshot();
    expect(snapshot.healthKitObservations[0].reconciliation).toMatchObject({
      state: "training_match_ambiguous",
      confirmationRequired: true,
    });
    expect(snapshot.healthKitObservations[0].reconciliation).not.toHaveProperty("canonicalTrainingSessionId");
    expect(snapshot.canonicalEvidenceObjects).toEqual([first, second]);
  });

  it("rejects immutable HealthKit identity collisions", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-one", {
      batchId: "healthkit-workout-one",
      observations: [workout({ activeCalories: 400 })],
    }));
    await expect(ports.ingestHealthKitObservations(context("delivery-two", {
      batchId: "healthkit-workout-two",
      observations: [workout({ activeCalories: 450 })],
    }))).rejects.toMatchObject({ status: 409, code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION" });
    expect(records.snapshot().healthKitObservations).toHaveLength(1);
  });

  it("reconciles a previously unmatched strength observation when exact canonical ownership later appears", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    const payload = { batchId: "healthkit-before-training", observations: [workout()] };
    await ports.ingestHealthKitObservations(context("delivery-before-training", payload));
    const session = detailedSession();
    session.payload.reconciliation = { source_workout_id: "hk-workout-001" };
    await records.put({
      ownerUserId: OWNER,
      collection: "canonicalEvidenceObjects",
      recordId: session.canonicalId,
      payload: session,
    });
    const replay = await ports.ingestHealthKitObservations(context("delivery-after-training", {
      ...payload,
      batchId: "healthkit-after-training",
    }));
    expect(replay.result).toMatchObject({ reconciledCount: 1, matchedCount: 0 });
    expect(records.snapshot().healthKitObservations[0]).toMatchObject({
      version: 2,
      reconciliation: {
        state: "training_session_linked",
        canonicalTrainingSessionId: "training-session-one",
      },
    });
  });

  it("ignores an out-of-order same-coverage revision and preserves the newer canonical total", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-newer", {
      batchId: "healthkit-activity-newer",
      observations: [activitySummary({ moveCalories: 800, sourceRevision: 2 })],
    }));
    const stale = await ports.ingestHealthKitObservations(context("delivery-older", {
      batchId: "healthkit-activity-older",
      observations: [activitySummary({ moveCalories: 700, sourceRevision: 1 })],
    }));
    const snapshot = records.snapshot();
    expect(stale.result.observations[0].reconciliation.state).toBe("activity_summary_superseded");
    expect(snapshot.canonicalEvidenceObjects[0].payload.daily_activity.move_calories).toBe(800);
    expect(snapshot.canonicalEvidenceObjects).toHaveLength(1);
  });

  it("does not let a newer partial revision displace an older complete Activity summary", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-complete", {
      batchId: "healthkit-activity-complete",
      observations: [activitySummary({ moveCalories: 700, sourceRevision: 1, coverage: "complete_day" })],
    }));
    const partial = await ports.ingestHealthKitObservations(context("delivery-partial", {
      batchId: "healthkit-activity-partial",
      observations: [activitySummary({ moveCalories: 800, sourceRevision: 2, coverage: "partial_day" })],
    }));
    expect(partial.result.observations[0].reconciliation).toMatchObject({
      state: "activity_summary_superseded",
      reason: "complete_day_summary_already_received",
    });
    expect(records.snapshot().canonicalEvidenceObjects[0].payload).toMatchObject({
      daily_activity: { move_calories: 700 },
      metadata: { coverage: "complete_day", source_revision: 1 },
    });
  });

  it("lets a complete summary outrank a numerically newer partial summary already received", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-partial", {
      batchId: "healthkit-activity-partial",
      observations: [activitySummary({ moveCalories: 800, sourceRevision: 2, coverage: "partial_day" })],
    }));
    await ports.ingestHealthKitObservations(context("delivery-complete", {
      batchId: "healthkit-activity-complete",
      observations: [activitySummary({ moveCalories: 700, sourceRevision: 1, coverage: "complete_day" })],
    }));
    const day = records.snapshot().canonicalEvidenceObjects[0];
    expect(day.payload).toMatchObject({
      daily_activity: { move_calories: 700 },
      metadata: { coverage: "complete_day", source_revision: 1 },
    });
    expect(day.activityRevision.revision).toBe(2);
    expect(day.activityRevisionHistory).toHaveLength(1);
  });

  it("does not expose raw or candidate workouts to V3 observations or strategic eligibility", async () => {
    const records = recordStore();
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.ingestHealthKitObservations(context("delivery-v3-boundary", {
      batchId: "healthkit-v3-boundary",
      observations: [workout({ activityType: "Outdoor Run" })],
      diagnosticBatchIdentity: "allowed-but-nonauthoritative",
      opaqueAnchor: "must-not-be-stored",
    }));
    const raw = records.snapshot().healthKitObservations[0];
    const fixture = createPairedCalibrationFixtures().dexa;
    const observations = createCanonicalEvidenceObservationsV3({
      goalContract: fixture.goalContract,
      goal: { id: fixture.goalContract.goalId },
      phase: { id: fixture.goalContract.phase.phaseId },
      store: { healthKitObservations: [raw] },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    const eligibility = selectStrategicallyEligibleEvidenceV3({
      goalContract: fixture.goalContract,
      observations,
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(observations).toEqual([]);
    expect(eligibility.eligibleObservations).toEqual([]);
    expect(raw.evidenceEligibility).toEqual({ state: "not_assessed", decidedBy: null });
    expect(raw.ingestion).not.toHaveProperty("opaqueAnchor");
    expect(raw).not.toHaveProperty("opaqueAnchor");
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
  });
});

function command(idempotencyKey, payload) {
  return {
    commandType: Phase3Command.INGEST_HEALTHKIT_OBSERVATIONS,
    principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
    metadata: { idempotencyKey, clientTimeZone: "America/Los_Angeles" },
    payload,
  };
}

function context(idempotencyKey, payload) {
  return {
    ownerUserId: OWNER,
    payload,
    principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
    metadata: { idempotencyKey, clientTimeZone: "America/Los_Angeles" },
  };
}

function source() {
  return { bundleIdentifier: "com.apple.Health", productType: "iPhone17,1" };
}

function activitySummary({
  coverage = "complete_day",
  moveCalories = 700,
  sourceRevision = 1,
} = {}) {
  return {
    observationType: "activity_summary",
    externalId: "activity-summary-2026-09-12",
    source: source(),
    occurrence: { localDate: "2026-09-12", timeZone: "America/Los_Angeles" },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts",
      coverage,
      sourceRevision,
      dailyActivity: { move_calories: moveCalories, exercise_minutes: 60, stand_hours: 12 },
    },
  };
}

function workout({
  activeCalories = 400,
  activityType = "Traditional Strength Training",
  externalId = "hk-workout-001",
} = {}) {
  return {
    observationType: "workout",
    externalId,
    source: source(),
    occurrence: {
      localDate: "2026-09-12",
      timeZone: "America/Los_Angeles",
      startedAt: "2026-09-12T10:00:00-07:00",
      endedAt: "2026-09-12T11:00:00-07:00",
    },
    workout: {
      activityType,
      durationSeconds: 3600,
      activeCalories,
      averageHeartRate: 122,
    },
  };
}

function detailedSession(canonicalId = "training-session-one") {
  return {
    canonicalId,
    version: 1,
    evidence_type: "training",
    quality: { status: "active" },
    payload: {
      id: canonicalId,
      evidence_type: "training",
      observed_at: "2026-09-12",
      metadata: {
        activity_type: "Traditional Strength Training",
        start_time: "2026-09-12T17:00:00.000Z",
        end_time: "2026-09-12T18:00:00.000Z",
        duration_seconds: 3600,
        active_calories: 400,
      },
      exercises: [{ name: "Bench Press", sets: [{ reps: 8, weight: 185 }] }],
    },
  };
}

function recordStore(canonicalEvidenceObjects = []) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [],
    healthKitObservations: [],
    canonicalEvidenceObjects,
    evidencePackages: [],
  });
}
