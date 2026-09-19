import { describe, expect, it } from "vitest";
import {
  HealthKitReconciliationState,
  createHealthKitActivityDayPayload,
  createHealthKitObservationRecord,
  isHealthKitActivitySummarySuperseded,
  normalizeHealthKitObservationBatch,
  reconcileHealthKitWorkoutObservation,
} from "./HealthKitObservationService.js";

describe("HealthKitObservationService V1 compatibility", () => {
  it("derives the exact V1 NUL-separated source identity independently from delivery batches", () => {
    const first = normalize("batch-one", [workout()]).observations[0];
    const retry = normalize("batch-two", [workout()]).observations[0];
    expect(first.id).toBe("healthkit_observation_f3a630737d38ac946c4de2991a09b31f879cc701ed3caa6c535380f9d62a9221");
    expect(retry.id).toBe(first.id);
    expect(retry.semanticFingerprint).toBe(first.semanticFingerprint);
    expect(first.occurrence.startedAt).toBe("2026-09-12T17:00:00.000Z");
  });

  it("keeps different immutable external IDs distinct even when time and values match", () => {
    const observations = normalize("batch-one", [
      workout({ externalId: "hk-workout-001" }),
      workout({ externalId: "hk-workout-002" }),
    ]).observations;
    expect(observations).toHaveLength(2);
    expect(observations[0].id).not.toBe(observations[1].id);
  });

  it("preserves the V1 maximum batch size of 100", () => {
    expect(normalize("batch-one", Array.from({ length: 100 }, (_value, index) =>
      workout({ externalId: `hk-workout-${index}` })
    )).observations).toHaveLength(100);
    expect(() => normalize("batch-two", Array.from({ length: 101 }, (_value, index) =>
      workout({ externalId: `hk-workout-${index}` })
    ))).toThrowError(expect.objectContaining({ code: "HEALTHKIT_CONTRACT_INVALID" }));
  });

  it("keeps raw provenance separate from canonical Evidence eligibility", () => {
    const observation = normalize("batch-one", [sample()]).observations[0];
    const record = createHealthKitObservationRecord({
      observation,
      reconciliation: { state: HealthKitReconciliationState.SOURCE_ONLY },
      ownerUserId: "founder",
      receivedAt: "2026-09-12T18:00:00.000Z",
    });
    expect(record).toMatchObject({
      observationType: "quantity_sample",
      occurredAt: "2026-09-12T17:15:00.000Z",
      ingestion: { firstReceivedAt: "2026-09-12T18:00:00.000Z" },
      evidenceEligibility: { state: "not_assessed", decidedBy: null },
    });
    expect(record).not.toHaveProperty("evidence_type");
    expect(record).not.toHaveProperty("goalId");
    expect(record).not.toHaveProperty("phaseId");
  });

  it("canonicalizes only an authoritative daily total and declares workout calories non-additive", () => {
    const observation = normalize("batch-one", [activitySummary()]).observations[0];
    const payload = createHealthKitActivityDayPayload(observation);
    expect(payload.daily_activity.move_calories).toBe(700);
    expect(payload.metadata).toMatchObject({
      aggregation_scope: "daily_total_including_workouts",
      includes_workout_energy: true,
      source_revision: 1,
    });
    expect(payload.derived_metrics).toEqual({
      aggregation_policy: "authoritative_healthkit_daily_total",
      workout_active_calories_additive: false,
    });
  });

  it("applies complete-over-partial precedence before numeric source revision ordering", () => {
    const complete = normalize("complete", [activitySummary({
      coverage: "complete_day",
      sourceRevision: 1,
    })]).observations[0];
    const newerPartial = normalize("partial", [activitySummary({
      coverage: "partial_day",
      sourceRevision: 2,
    })]).observations[0];
    expect(isHealthKitActivitySummarySuperseded([complete], newerPartial)).toBe(complete);
    expect(isHealthKitActivitySummarySuperseded([newerPartial], complete)).toBeNull();
  });

  it("uses numeric source revision ordering when coverage is equal", () => {
    const revisionTwo = normalize("newer", [activitySummary({ sourceRevision: 2 })]).observations[0];
    const revisionOne = normalize("older", [activitySummary({ sourceRevision: 1 })]).observations[0];
    expect(isHealthKitActivitySummarySuperseded([revisionTwo], revisionOne)).toBe(revisionTwo);
    expect(isHealthKitActivitySummarySuperseded([revisionOne], revisionTwo)).toBeNull();
  });

  it("uses canonical workout identity logic to propose—but not confirm—a strength match", () => {
    const observation = normalize("batch-one", [workout()]).observations[0];
    const result = reconcileHealthKitWorkoutObservation({
      observation,
      canonicalObjects: [detailedSession()],
    });
    expect(result).toMatchObject({
      state: HealthKitReconciliationState.TRAINING_MATCH_CANDIDATE,
      confirmationRequired: true,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].canonicalId).toBe("training-session-one");
  });

  it("recognizes a previously linked source identity without modifying TrainingSession ownership", () => {
    const observation = normalize("batch-one", [workout()]).observations[0];
    const existing = detailedSession();
    existing.payload.reconciliation = { source_workout_id: "hk-workout-001" };
    const result = reconcileHealthKitWorkoutObservation({ observation, canonicalObjects: [existing] });
    expect(result).toMatchObject({
      state: HealthKitReconciliationState.TRAINING_SESSION_LINKED,
      canonicalTrainingSessionId: "training-session-one",
      associationAuthority: "preexisting_canonical_source_identity",
    });
    expect(existing.payload.exercises[0].sets).toEqual([{ reps: 8, weight: 185 }]);
  });

  it("keeps ambiguous strength matches unlinked", () => {
    const observation = normalize("batch-one", [workout()]).observations[0];
    const second = detailedSession("training-session-two");
    const result = reconcileHealthKitWorkoutObservation({
      observation,
      canonicalObjects: [detailedSession(), second],
    });
    expect(result).toMatchObject({
      state: HealthKitReconciliationState.TRAINING_MATCH_AMBIGUOUS,
      confirmationRequired: true,
    });
    expect(result).not.toHaveProperty("canonicalTrainingSessionId");
  });

  it("keeps cardio as a candidate until Evidence eligibility is independently available", () => {
    const observation = normalize("batch-one", [workout({ activityType: "Outdoor Run" })]).observations[0];
    const result = reconcileHealthKitWorkoutObservation({ observation, canonicalObjects: [] });
    expect(result).toMatchObject({
      state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED,
      reason: "canonical_workout_evidence_eligibility_boundary_not_yet_separate",
      canonicalCandidate: { evidence_type: "training", exercises: [] },
    });
  });

  it("rejects an additive or workout-only Activity summary", () => {
    const value = activitySummary();
    value.activitySummary.aggregationScope = "workout_only";
    expect(() => normalize("batch-one", [value])).toThrowError(expect.objectContaining({
      code: "HEALTHKIT_CONTRACT_INVALID",
    }));
  });
});

function normalize(batchId, observations) {
  return normalizeHealthKitObservationBatch({
    batchId,
    observations,
    principalDeviceId: "founder-iphone",
  });
}

function source() {
  return { bundleIdentifier: "com.apple.Health", productType: "iPhone17,1" };
}

function workout({
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
    workout: { activityType, durationSeconds: 3600, activeCalories: 400, averageHeartRate: 122 },
  };
}

function sample() {
  return {
    observationType: "quantity_sample",
    externalId: "hk-sample-001",
    source: source(),
    occurrence: {
      localDate: "2026-09-12",
      timeZone: "America/Los_Angeles",
      startedAt: "2026-09-12T10:15:00-07:00",
      endedAt: "2026-09-12T10:15:05-07:00",
    },
    quantitySample: { sampleType: "heart_rate", value: 122, unit: "count/min", workoutExternalId: "hk-workout-001" },
  };
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
      dailyActivity: { move_calories: moveCalories, exercise_minutes: 45, stand_hours: 12 },
    },
  };
}

function detailedSession(canonicalId = "training-session-one") {
  return {
    canonicalId,
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
