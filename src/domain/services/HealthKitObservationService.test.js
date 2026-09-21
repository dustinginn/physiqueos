import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
  HealthKitReconciliationState,
  assessHealthKitCanonicalization,
  createHealthKitObservationRecord,
  normalizeHealthKitObservationBatch,
  reconcileHealthKitWorkoutObservation,
  resolveHealthKitCanonicalActivationPolicy,
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

  it("keeps V1 identity unchanged across purposes while separating semantic replay", () => {
    const operational = normalize("batch-one", [workout()]).observations[0];
    const validation = normalize("batch-two", [{ ...workout(), ingestionPurpose: "validation_only" }]).observations[0];
    expect(validation.id).toBe("healthkit_observation_f3a630737d38ac946c4de2991a09b31f879cc701ed3caa6c535380f9d62a9221");
    expect(validation.id).toBe(operational.id);
    expect(validation.semanticFingerprint).not.toBe(operational.semanticFingerprint);
    expect(validation.ingestionPurpose).toBe("validation_only");
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

  it("keeps Activity daily-total scope strict: workout calories are never additive", () => {
    const observation = normalize("batch-one", [activitySummary()]).observations[0];
    expect(observation.measurement).toMatchObject({
      aggregationScope: "daily_total_including_workouts",
      coverage: "complete_day",
      sourceRevision: 1,
    });
  });

  describe("Nutrition daily totals", () => {
    it("normalizes a HealthKit daily aggregate with calories, protein, carbohydrates, and fat only", () => {
      const observation = normalize("nutrition", [nutritionDailyTotal()]).observations[0];
      expect(observation.observationType).toBe("nutrition_daily_total");
      expect(observation.measurement).toEqual({
        aggregationScope: "daily_total_all_sources",
        coverage: "complete_day",
        sourceRevision: 1,
        dailyNutrition: { calories: 2400, protein_g: 210, carbs_g: 240, fat_g: 70 },
      });
      expect(observation.occurrence.startedAt).toBeUndefined();
    });

    it("gives every device revision its own immutable identity and keeps one revision idempotent", () => {
      const one = normalize("one", [nutritionDailyTotal()]).observations[0];
      const replay = normalize("two", [nutritionDailyTotal()]).observations[0];
      const next = normalize("three", [nutritionDailyTotal({ sourceRevision: 2 })]).observations[0];
      expect(replay.id).toBe(one.id);
      expect(next.id).not.toBe(one.id);
    });

    it("rejects an unlisted nutrient rather than silently dropping or expanding scope", () => {
      const value = nutritionDailyTotal();
      value.nutritionDailyTotal.dailyNutrition.fiber_g = 30;
      expect(() => normalize("batch", [value])).toThrowError(expect.objectContaining({
        code: "HEALTHKIT_CONTRACT_INVALID",
      }));
    });

    it("requires daily dietary energy and non-negative numbers", () => {
      const missing = nutritionDailyTotal();
      delete missing.nutritionDailyTotal.dailyNutrition.calories;
      expect(() => normalize("batch", [missing])).toThrowError(expect.objectContaining({ code: "HEALTHKIT_CONTRACT_INVALID" }));
      const negative = nutritionDailyTotal();
      negative.nutritionDailyTotal.dailyNutrition.protein_g = -1;
      expect(() => normalize("batch", [negative])).toThrowError(expect.objectContaining({ code: "HEALTHKIT_CONTRACT_INVALID" }));
    });

    it("rejects any aggregation scope other than all-source daily statistics", () => {
      const value = nutritionDailyTotal();
      value.nutritionDailyTotal.aggregationScope = "single_source_samples";
      expect(() => normalize("batch", [value])).toThrowError(expect.objectContaining({ code: "HEALTHKIT_CONTRACT_INVALID" }));
    });
  });

  describe("canonical activation policy", () => {
    const enabled = (overrides = {}) => ({
      schemaVersion: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION,
      status: "enabled",
      domains: ["activity", "nutrition"],
      effectiveLocalDate: "2026-09-23",
      endLocalDate: "2026-09-23",
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
      ...overrides,
    });

    it("is disabled when no policy is configured", () => {
      expect(resolveHealthKitCanonicalActivationPolicy(null)).toMatchObject({ enabled: false, source: "not_configured" });
      const observation = normalize("b", [activitySummary()]).observations[0];
      expect(assessHealthKitCanonicalization({ observation, activationPolicy: null })).toMatchObject({
        eligible: false, permanent: false, reason: "canonicalization_not_activated",
      });
    });

    it("scopes eligibility to the exact domains and the exact local-date window", () => {
      const inWindow = normalize("a", [activitySummary({ localDate: "2026-09-23" })]).observations[0];
      const before = normalize("b", [activitySummary({ localDate: "2026-09-22" })]).observations[0];
      const after = normalize("c", [activitySummary({ localDate: "2026-09-24" })]).observations[0];
      const policy = enabled();
      expect(assessHealthKitCanonicalization({ observation: inWindow, activationPolicy: policy })).toMatchObject({ eligible: true });
      expect(assessHealthKitCanonicalization({ observation: before, activationPolicy: policy })).toMatchObject({
        eligible: false, permanent: true, reason: "before_activation_date",
      });
      expect(assessHealthKitCanonicalization({ observation: after, activationPolicy: policy })).toMatchObject({
        eligible: false, permanent: true, reason: "after_activation_window",
      });
      const nutrition = normalize("d", [nutritionDailyTotal({ localDate: "2026-09-23" })]).observations[0];
      expect(assessHealthKitCanonicalization({
        observation: nutrition, activationPolicy: enabled({ domains: ["activity"] }),
      })).toMatchObject({ eligible: false, permanent: true, reason: "domain_not_in_activation_scope" });
    });

    it("never canonicalizes validation-only observations, even inside an active window", () => {
      const observation = normalize("v", [{ ...activitySummary({ localDate: "2026-09-23" }), ingestionPurpose: "validation_only" }]).observations[0];
      expect(assessHealthKitCanonicalization({ observation, activationPolicy: enabled() })).toMatchObject({
        eligible: false, permanent: true, reason: "validation_only_permanently_raw",
      });
    });

    it.each([
      ["a legacy or unversioned record", { schemaVersion: undefined }],
      ["an open-ended window", { endLocalDate: undefined }],
      ["an end before the start", { endLocalDate: "2026-09-22" }],
      ["a window longer than seven days", { endLocalDate: "2026-10-01" }],
      ["no domains", { domains: [] }],
      ["an unsupported domain", { domains: ["activity", "sleep"] }],
      ["a backfill request", { historicalBackfill: true }],
      ["any strategic eligibility other than quarantined", { strategicEvidenceEligibility: "eligible" }],
      ["a disabled status", { status: "disabled" }],
      ["a malformed date", { effectiveLocalDate: "2026-02-31" }],
    ])("fails closed on %s without throwing", (_label, overrides) => {
      const policy = resolveHealthKitCanonicalActivationPolicy(enabled(overrides));
      expect(policy.enabled).toBe(false);
      const observation = normalize("x", [activitySummary({ localDate: "2026-09-23" })]).observations[0];
      expect(assessHealthKitCanonicalization({ observation, activationPolicy: enabled(overrides) }).eligible).toBe(false);
    });
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

function nutritionDailyTotal({
  coverage = "complete_day",
  calories = 2400,
  sourceRevision = 1,
  localDate = "2026-09-12",
} = {}) {
  return {
    observationType: "nutrition_daily_total",
    externalId: `nutrition-daily-total:${localDate}`,
    source: source(),
    occurrence: { localDate, timeZone: "America/Los_Angeles" },
    nutritionDailyTotal: {
      aggregationScope: "daily_total_all_sources",
      coverage,
      sourceRevision,
      dailyNutrition: { calories, protein_g: 210, carbs_g: 240, fat_g: 70 },
    },
  };
}

function activitySummary({
  coverage = "complete_day",
  moveCalories = 700,
  sourceRevision = 1,
  localDate = "2026-09-12",
} = {}) {
  return {
    observationType: "activity_summary",
    externalId: `activity-summary-${localDate}`,
    source: source(),
    occurrence: { localDate, timeZone: "America/Los_Angeles" },
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
