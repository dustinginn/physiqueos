// Production-shaped fixture for Part E's whole-day workout-calorie
// accounting: a day with NO Training Logger session at all -- exactly what a
// canonicalized Cardio workout looks like, since Cardio structurally never
// has a Logger session (see HealthKitWorkoutLinkService.js's cardio
// coexistence branch) and therefore never has a confirm/deny step either.
// The raw Activity-day evidence object mirrors what a whole-day HealthKit
// aggregate looked like BEFORE any workout-aware accounting existed: a
// pre-computed `workout_active_calories: 0` sitting on `derived_metrics`
// (the same shape `healthKitSep23StrengthPresentationFixture.js` and
// `healthKitSep24StrengthPresentationFixture.js` already use), so a fixture
// with `canonicalWorkouts: []` is a faithful "before this workout
// canonicalized" snapshot to diff against.

const OWNER = "user_founder_001";
const DAY = "2026-09-25";
const CARDIO_WORKOUT_ID = "healthkit_canonical_workout_c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const OBSERVATION_ID = "healthkit_observation_workout_sep25_cardio_fixture";

const quarantine = () => ({
  state: "quarantined",
  strategic: false,
  decidedBy: "healthkit-strategic-evidence-quarantine-v1",
});

export function createCardioWholeDayAttributionFixture({
  dailyActiveCalories = 900,
  cardioActiveCalories = 300,
  day = DAY,
  workoutId = CARDIO_WORKOUT_ID,
  observationId = OBSERVATION_ID,
  startedAt = "2026-09-25T17:00:00.000Z",
  endedAt = "2026-09-25T17:30:00.000Z",
  // Defaults to the generic (indoor/outdoor-unknown) type this fixture has
  // always used. A caller may override it to a location-specific canonical
  // type (e.g. "indoor_walking") to prove presentation forwards whatever
  // specificity the canonical workout already carries, without this fixture
  // needing to know anything about how that specificity was derived.
  canonicalType = "walking",
} = {}) {
  const cardioWorkout = {
    schemaVersion: "healthkit-canonical-workout-v1",
    id: workoutId,
    userId: OWNER,
    localDate: day,
    revision: 1,
    semanticFingerprint: `sha256_sep25_cardio_fixture_${workoutId.slice(-8)}`,
    priorSemanticFingerprint: null,
    current: {
      sourceObservationId: observationId,
      sourceRevision: 1,
      family: "cardio",
      canonicalType,
      appleActivityType: "52",
      localDate: day,
      timeZone: "America/Los_Angeles",
      startedAt,
      endedAt,
      telemetry: {
        durationSeconds: 1800,
        activeCalories: cardioActiveCalories,
        totalCalories: cardioActiveCalories === null ? null : cardioActiveCalories + 40,
        distance: 1.6,
        distanceUnit: "mi",
        averageHeartRate: 118.4,
      },
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
  const activityDay = {
    canonicalId: `activity_day|${day}`,
    userId: OWNER,
    version: 5,
    quality: { status: "active" },
    payload: {
      id: `activity_day|${day}`,
      evidence_type: "activity_day",
      observed_at: day,
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      daily_activity: { move_calories: dailyActiveCalories, exercise_minutes: 30, stand_hours: 10 },
      // Pre-Part-E snapshot: nothing here has ever attributed any energy to a
      // workout for this day (there is no Logger session, and cardio
      // canonicalization is new), so the raw record already carries the
      // "no known workout energy" shape production evidence objects use.
      derived_metrics: { workout_active_calories: 0, non_workout_active_calories: dailyActiveCalories, training_sessions_referenced: 0 },
      references: { training_session_ids: [] },
    },
  };
  return structuredClone({
    ownerUserId: OWNER,
    day,
    ids: { cardioWorkout: workoutId },
    // No Training Logger session, ever, for Cardio.
    canonicalEvidenceObjects: [activityDay],
    canonicalWorkouts: [cardioWorkout],
    workoutLinks: [],
    workoutLinkClaims: [],
  });
}
