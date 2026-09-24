// Production-shaped reproduction of the confirmed September 23 graph. The
// durable record identities, relationship status/version, confidence/basis,
// four-exercise/sixteen-set Logger shape, quarantines, and stale 606-calorie
// Activity total mirror the audited production state. Telemetry values are
// deterministic fixture values; the production read remains authoritative.

const OWNER = "user_founder_001";
const DAY = "2026-09-23";
const WORKOUT_ID = "healthkit_canonical_workout_9e609fffe3d46943d0b5d5525a89c99c441f9efe";
const SESSION_ID = "training|authoritative|training_logger_draft_E0E5F723-E306-4CC1-9D35-7F867514A406";
const LINK_ID = "healthkit_workout_link_10d4b9fb207974242a4277816460eb076fa4a7dd";
const WORKOUT_CLAIM_ID = "healthkit_link_claim_w_0bf0a0e59c84c0dbd7f1638e6d967caee6356264";
const SESSION_CLAIM_ID = "healthkit_link_claim_s_12126799d47847ac87c7b702828eafe458a21a4a";
const CANDIDATE_AT = "2026-09-23T18:00:00.000Z";
const CONFIRMED_AT = "2026-09-24T02:46:00.000Z";

const quarantine = () => ({
  state: "quarantined",
  strategic: false,
  decidedBy: "healthkit-strategic-evidence-quarantine-v1",
});

export function createSep23StrengthPresentationFixture({
  dailyActiveCalories = 606,
  workoutActiveCalories = 410,
} = {}) {
  const exercises = ["Bench Press", "Chest Press", "Lateral Raise", "Triceps Pressdown"]
    .map((name, exerciseIndex) => ({
      id: `exercise-${exerciseIndex + 1}`,
      name,
      sets: Array.from({ length: 4 }, (_, setIndex) => ({
        set_number: setIndex + 1,
        reps: 10,
        weight: 100 + exerciseIndex * 10,
        weight_unit: "lb",
      })),
    }));
  const loggerSession = {
    canonicalId: SESSION_ID,
    userId: OWNER,
    version: 7,
    quality: { status: "active" },
    payload: {
      id: SESSION_ID,
      evidence_type: "training",
      observed_at: DAY,
      source: { application: "Training Logger", modality: "manual" },
      metadata: {
        activity_type: "Traditional Strength Training",
        logger_origin: "training_logger",
        logger_mode: "live",
        start_time: "2026-09-23T10:01:00-07:00",
      },
      exercises,
      exerciseRelationshipGroups: [],
    },
  };
  const canonicalWorkout = {
    schemaVersion: "healthkit-canonical-workout-v1",
    id: WORKOUT_ID,
    userId: OWNER,
    localDate: DAY,
    revision: 1,
    current: {
      family: "strength",
      canonicalType: "traditional_strength_training",
      appleActivityType: "50",
      localDate: DAY,
      timeZone: "America/Los_Angeles",
      startedAt: "2026-09-23T17:00:00.000Z",
      endedAt: "2026-09-23T18:00:00.000Z",
      telemetry: {
        durationSeconds: 3600,
        activeCalories: workoutActiveCalories,
        totalCalories: 515,
        distance: null,
        distanceUnit: null,
        averageHeartRate: 122,
      },
      source: { sourceName: "Apple Watch", productType: "Watch7,5" },
    },
    contentAuthority: { telemetry: "healthkit", trainingContent: "workout_logger" },
    activityInteraction: { policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false },
    evidenceEligibility: quarantine(),
  };
  const link = {
    schemaVersion: "healthkit-workout-link-v1",
    id: LINK_ID,
    userId: OWNER,
    localDate: DAY,
    canonicalWorkoutId: WORKOUT_ID,
    loggerSessionCanonicalId: SESSION_ID,
    status: "confirmed",
    matchOutcome: "confident_match",
    matchBasis: "logger_session_window",
    confidence: 95,
    reasons: ["The only same-day live Logger strength session starts inside the Apple workout window"],
    matcherVersion: "healthkit-strength-matcher-v5",
    contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
    createdBy: { kind: "system_matcher", ref: "healthkit-strength-matcher-v5" },
    statusHistory: [
      { status: "candidate", at: CANDIDATE_AT, by: { kind: "system_matcher", ref: "healthkit-strength-matcher-v5" } },
      { status: "confirmed", at: CONFIRMED_AT, by: { kind: "system_matcher", ref: "healthkit-strength-auto-confirm-v1" } },
    ],
    evidenceEligibility: quarantine(),
    createdAt: CANDIDATE_AT,
    updatedAt: CONFIRMED_AT,
    version: 2,
  };
  const claim = (id, kind) => ({
    schemaVersion: "healthkit-workout-link-claim-v1",
    id,
    userId: OWNER,
    kind,
    status: "held",
    holderLinkId: LINK_ID,
    history: [{ status: "held", holderLinkId: LINK_ID, at: CONFIRMED_AT }],
    evidenceEligibility: quarantine(),
    createdAt: CONFIRMED_AT,
    updatedAt: CONFIRMED_AT,
    version: 1,
  });
  const activityDay = {
    canonicalId: `activity_day|${DAY}`,
    userId: OWNER,
    version: 50,
    quality: { status: "active" },
    payload: {
      id: `activity_day|${DAY}`,
      evidence_type: "activity_day",
      observed_at: DAY,
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      daily_activity: { move_calories: dailyActiveCalories, exercise_minutes: 60, stand_hours: 11 },
      derived_metrics: { workout_active_calories: 0, non_workout_active_calories: dailyActiveCalories, training_sessions_referenced: 1 },
      references: { training_session_ids: [SESSION_ID] },
    },
  };
  return structuredClone({
    ownerUserId: OWNER,
    day: DAY,
    ids: { workout: WORKOUT_ID, session: SESSION_ID, link: LINK_ID },
    canonicalEvidenceObjects: [activityDay, loggerSession],
    canonicalWorkouts: [canonicalWorkout],
    workoutLinks: [link],
    workoutLinkClaims: [claim(WORKOUT_CLAIM_ID, "workout"), claim(SESSION_CLAIM_ID, "session")],
  });
}
