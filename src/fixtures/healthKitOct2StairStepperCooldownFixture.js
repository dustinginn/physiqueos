// Production-shaped fixture for the Founder's 2026-10-02 Apple Watch session:
// a Stair Stepper (HKWorkoutActivityType 44, 22:38-22:49Z) followed by a
// Cooldown (80, 22:50-22:54Z), both uploaded through
// `healthkit.observations.ingest.v1` with the numeric raw activity type Native
// sends (`String(workoutActivityType.rawValue)`). Telemetry values are
// representative, not the Founder's real numbers.
import {
  HealthKitReconciliationState,
  createHealthKitObservationRecord,
  normalizeHealthKitObservationBatch,
} from "../domain/services/HealthKitObservationService.js";
import { reconcileHealthKitCanonicalWorkout } from "../domain/services/HealthKitWorkoutService.js";

export const OCT2_OWNER = "user_founder_001";
export const OCT2_DATE = "2026-10-02";
export const OCT2_TIME_ZONE = "America/Los_Angeles";
export const OCT2_RECEIVED_AT = "2026-10-02T22:54:44.000Z";
export const OCT2_WORKOUT_POLICY_ID = "healthkit_workout_canonical_activation_policy";

const SOURCE = Object.freeze({ bundleIdentifier: "com.apple.health.watch", sourceName: "Apple Watch", productType: "Watch7,5" });

export function oct2StairStepperInput(overrides = {}) {
  return workoutInput({
    externalId: "oct2-stair-stepper-uuid",
    activityType: "44",
    startedAt: "2026-10-02T22:38:12Z",
    endedAt: "2026-10-02T22:49:31Z",
    activeCalories: 121.37,
    averageHeartRate: 138.4,
    // Apple tags a Stair Stepper as indoor; the type has no location variant.
    isIndoorWorkout: true,
    ...overrides,
  });
}

export function oct2CooldownInput(overrides = {}) {
  return workoutInput({
    externalId: "oct2-cooldown-uuid",
    activityType: "80",
    startedAt: "2026-10-02T22:50:02Z",
    endedAt: "2026-10-02T22:54:44Z",
    activeCalories: 18.6,
    averageHeartRate: 112.1,
    ...overrides,
  });
}

export function oct2WalkInput(overrides = {}) {
  return workoutInput({
    externalId: "oct2-morning-walk-uuid",
    activityType: "52",
    startedAt: "2026-10-02T15:05:00Z",
    endedAt: "2026-10-02T15:35:00Z",
    activeCalories: 140.2,
    averageHeartRate: 104.6,
    distance: 2600,
    distanceUnit: "m",
    isIndoorWorkout: false,
    ...overrides,
  });
}

export function normalizeOct2Observation(input) {
  return normalizeHealthKitObservationBatch({
    batchId: `batch-${input.externalId}`,
    principalDeviceId: "founder-iphone",
    observations: [input],
  }).observations[0];
}

/** The canonical workout ingestion (or the bounded repair) creates for one input. */
export function oct2CanonicalWorkout(input, { now = OCT2_RECEIVED_AT, activation = null } = {}) {
  return reconcileHealthKitCanonicalWorkout({
    observation: normalizeOct2Observation(input),
    ownerUserId: OCT2_OWNER,
    now,
    activation,
  }).record;
}

/** The stored production shape of an Oct 2 workout the old classifier did not support. */
export function oct2SourceOnlyObservationRecord(input, { version = 1 } = {}) {
  return {
    ...createHealthKitObservationRecord({
      observation: normalizeOct2Observation(input),
      reconciliation: { state: HealthKitReconciliationState.SOURCE_ONLY, reason: "unsupported_workout_type" },
      ownerUserId: OCT2_OWNER,
      receivedAt: OCT2_RECEIVED_AT,
    }),
    version,
  };
}

/** The live Workout activation policy shape (v4: Cardio + Strength, open-ended). */
export function oct2WorkoutPolicyRecord(overrides = {}) {
  return {
    id: OCT2_WORKOUT_POLICY_ID,
    schemaVersion: "healthkit-workout-activation-policy-v1",
    version: 4,
    status: "enabled",
    domains: ["workout"],
    families: ["cardio", "strength"],
    effectiveLocalDate: "2026-09-22",
    endLocalDate: null,
    openEnded: true,
    historicalBackfill: false,
    strategicEvidenceEligibility: "quarantined",
    linkAutoConfirm: false,
    ...overrides,
  };
}

/** A Cardio strategic graduation policy record (evidence + projection scopes). */
export function oct2GraduationPolicyRecord({ evidenceStart = "2026-09-25", projection = { enabled: false } } = {}) {
  return {
    id: "healthkit_canonical_graduation_policy",
    schemaVersion: "healthkit-canonical-graduation-policy-v1",
    version: 3,
    projection,
    evidenceEligibility: { enabled: true, domains: ["activity", "nutrition", "cardio_training"], startLocalDate: evidenceStart, endLocalDate: null },
    historicalBriefingRegeneration: false,
  };
}

/** Apple's whole-day Activity summary for Oct 2, already including every workout's energy. */
export function oct2ActivityDayEvidence({ moveCalories = 905, exerciseMinutes = 52 } = {}) {
  return {
    canonicalId: `activity_day|${OCT2_DATE}`,
    userId: OCT2_OWNER,
    version: 3,
    quality: { status: "active" },
    payload: {
      id: `activity_day|${OCT2_DATE}`,
      evidence_type: "activity_day",
      observed_at: OCT2_DATE,
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      daily_activity: { move_calories: moveCalories, exercise_minutes: exerciseMinutes, stand_hours: 12 },
      derived_metrics: { workout_active_calories: 0, non_workout_active_calories: moveCalories, training_sessions_referenced: 0 },
      references: { training_session_ids: [] },
    },
  };
}

function workoutInput({
  externalId, activityType, startedAt, endedAt, activeCalories, averageHeartRate, distance, distanceUnit, isIndoorWorkout,
}) {
  return {
    observationType: "workout",
    externalId,
    source: { ...SOURCE },
    occurrence: { localDate: OCT2_DATE, timeZone: OCT2_TIME_ZONE, startedAt, endedAt },
    workout: {
      activityType,
      durationSeconds: (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
      activeCalories,
      averageHeartRate,
      ...(distance === undefined ? {} : { distance, distanceUnit }),
      ...(typeof isIndoorWorkout === "boolean" ? { isIndoorWorkout } : {}),
    },
  };
}
