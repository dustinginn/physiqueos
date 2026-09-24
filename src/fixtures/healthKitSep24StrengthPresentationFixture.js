// Production-shaped reproduction of the audited September 24 case. A
// Strength session was logged in the Training Logger before the matching
// Apple Health Strength workout had arrived, so its evidence payload froze a
// synthetic ~94-minute duration (Native Build 55's `finishedAt` was absent,
// so the server-owned commit-instant fallback captured it). Apple Health
// separately, correctly canonicalized the real 27:59 Strength workout plus
// two Indoor Walk workouts before and after it. The Strength workout has NO
// confirmed link to the Logger session (`no_match` stored; a live
// re-assessment lands at `possible_match`, below the confident/auto-confirm
// threshold). Telemetry values mirror the audited production reads; the
// production read remains authoritative.

const OWNER = "user_founder_001";
const DAY = "2026-09-24";
const STRENGTH_WORKOUT_ID = "healthkit_canonical_workout_36a18cc3ea36a18cc3ea36a18cc3ea36a18cc3ea";
const WALK_BEFORE_ID = "healthkit_canonical_workout_walk1walk1walk1walk1walk1walk1walk1walk1wa";
const WALK_AFTER_ID = "healthkit_canonical_workout_walk2walk2walk2walk2walk2walk2walk2walk2wa";
const SESSION_ID = "training|authoritative|training_logger_draft_5C9C6C10-6B0D-4B8B-9B8B-7B2E9B1E5A24";
const SESSION_PAYLOAD_ID = "training_logger_session_5C9C6C10-6B0D-4B8B-9B8B-7B2E9B1E5A24";
const OBSERVATION_ID_STRENGTH = "healthkit_observation_workout_sep24_strength_fixture";
const OBSERVATION_ID_WALK1 = "healthkit_observation_workout_sep24_walk1_fixture";
const OBSERVATION_ID_WALK2 = "healthkit_observation_workout_sep24_walk2_fixture";
const COMMITTED_AT = "2026-09-24T19:56:17.000Z";

const quarantine = () => ({
  state: "quarantined",
  strategic: false,
  decidedBy: "healthkit-strategic-evidence-quarantine-v1",
});

function baseCanonicalWorkout({
  id,
  observationId,
  family,
  canonicalType,
  appleActivityType,
  startedAt,
  endedAt,
  telemetry,
}) {
  return {
    schemaVersion: "healthkit-canonical-workout-v1",
    id,
    userId: OWNER,
    localDate: DAY,
    revision: 1,
    semanticFingerprint: `sha256_sep24_fixture_${id.slice(-8)}`,
    priorSemanticFingerprint: null,
    current: {
      sourceObservationId: observationId,
      sourceRevision: 1,
      family,
      canonicalType,
      appleActivityType,
      localDate: DAY,
      timeZone: "America/Los_Angeles",
      startedAt,
      endedAt,
      telemetry,
      source: {
        bundleIdentifier: "com.apple.health",
        sourceName: "Apple Watch",
        productType: "Watch7,5",
        deliveryDeviceId: "enrolled-device-fixture",
      },
    },
    revisionHistory: [],
    provenance: {
      sourceObservationIds: [observationId],
      currentSourceObservationId: observationId,
      application: "Apple Health",
      integration: "HealthKit",
      modality: "direct",
      bundleIdentifier: "com.apple.health",
      basis: "healthkit_workout_observation",
    },
    contentAuthority: { telemetry: "healthkit", trainingContent: "workout_logger" },
    activityInteraction: { policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false },
    evidenceEligibility: quarantine(),
    activation: null,
    createdAt: startedAt,
    updatedAt: endedAt,
  };
}

export function createSep24StrengthPresentationFixture() {
  const exercises = [
    {
      id: "exercise-1",
      name: "Leg Press Machine",
      sets: Array.from({ length: 4 }, (_, setIndex) => ({
        set_number: setIndex + 1,
        reps: 10,
        weight: 270 + setIndex * 10,
        weight_unit: "lb",
      })),
    },
    {
      id: "exercise-2",
      name: "Walking Lunge",
      sets: Array.from({ length: 2 }, (_, setIndex) => ({
        set_number: setIndex + 1,
        reps: 12,
        weight: 30,
        weight_unit: "lb",
      })),
    },
  ];
  // No `end_time`/`active_calories`/`average_heart_rate`: this session
  // committed before any Apple Health match, so only the server-owned
  // commit-instant fallback (`TrainingLoggerAppleHealthService.js`) produced
  // a synthetic duration. That frozen evidence is never mutated by this
  // fixture or by the presentation fix it exercises.
  const loggerSession = {
    canonicalId: SESSION_ID,
    userId: OWNER,
    version: 3,
    quality: { status: "active" },
    payload: {
      id: SESSION_PAYLOAD_ID,
      evidence_type: "training",
      observed_at: DAY,
      captured_at: COMMITTED_AT,
      source: { application: "Training Logger", modality: "manual" },
      metadata: {
        activity_type: "Traditional Strength Training",
        logger_origin: "training_logger",
        logger_mode: "live",
        start_time: "2026-09-24T11:22:10-07:00",
        duration_seconds: 5647,
      },
      exercises,
      exerciseRelationshipGroups: [],
    },
  };
  const strengthWorkout = baseCanonicalWorkout({
    id: STRENGTH_WORKOUT_ID,
    observationId: OBSERVATION_ID_STRENGTH,
    family: "strength",
    canonicalType: "traditional_strength_training",
    appleActivityType: "50",
    startedAt: "2026-09-24T18:22:10.000Z",
    endedAt: "2026-09-24T18:50:09.000Z",
    telemetry: {
      durationSeconds: 1679,
      activeCalories: 206.205,
      totalCalories: 265,
      distance: null,
      distanceUnit: null,
      averageHeartRate: 120.14,
    },
  });
  // Two correctly-deferred Indoor Walk workouts (`family_not_in_activation_scope`):
  // never lost, never merged, and -- critically -- never eligible to be
  // picked as this Strength session's presentation candidate, whatever their
  // timing, because they are not `family: "strength"`.
  const walkBefore = baseCanonicalWorkout({
    id: WALK_BEFORE_ID,
    observationId: OBSERVATION_ID_WALK1,
    family: "cardio",
    canonicalType: "walking",
    appleActivityType: "52",
    startedAt: "2026-09-24T18:04:00.000Z",
    endedAt: "2026-09-24T18:21:30.000Z",
    telemetry: {
      durationSeconds: 1050,
      activeCalories: 62.4,
      totalCalories: 80,
      distance: 0.8,
      distanceUnit: "mi",
      averageHeartRate: 101.2,
    },
  });
  const walkAfter = baseCanonicalWorkout({
    id: WALK_AFTER_ID,
    observationId: OBSERVATION_ID_WALK2,
    family: "cardio",
    canonicalType: "walking",
    appleActivityType: "52",
    startedAt: "2026-09-24T18:50:30.000Z",
    endedAt: "2026-09-24T19:06:00.000Z",
    telemetry: {
      durationSeconds: 930,
      activeCalories: 55.1,
      totalCalories: 71,
      distance: 0.7,
      distanceUnit: "mi",
      averageHeartRate: 98.6,
    },
  });
  const activityDay = {
    canonicalId: `activity_day|${DAY}`,
    userId: OWNER,
    version: 12,
    quality: { status: "active" },
    payload: {
      id: `activity_day|${DAY}`,
      evidence_type: "activity_day",
      observed_at: DAY,
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      daily_activity: { move_calories: 900, exercise_minutes: 62, stand_hours: 12 },
      derived_metrics: { workout_active_calories: 0, non_workout_active_calories: 900, training_sessions_referenced: 1 },
      references: { training_session_ids: [SESSION_ID] },
    },
  };
  return structuredClone({
    ownerUserId: OWNER,
    day: DAY,
    ids: {
      strengthWorkout: STRENGTH_WORKOUT_ID,
      walkBefore: WALK_BEFORE_ID,
      walkAfter: WALK_AFTER_ID,
      session: SESSION_ID,
    },
    canonicalEvidenceObjects: [activityDay, loggerSession],
    canonicalWorkouts: [strengthWorkout, walkBefore, walkAfter],
    // No confirmed link exists yet -- exactly what the audit found
    // (`storedLinkAssessment: "no_match"`). The presentation resolver must
    // compute the same `possible_match` candidate live, from this same data,
    // exactly as the audit's "live re-assessment" did.
    workoutLinks: [],
    workoutLinkClaims: [],
  });
}
