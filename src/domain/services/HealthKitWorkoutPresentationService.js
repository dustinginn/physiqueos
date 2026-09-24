import { isActiveCanonicalEvidenceObject } from "./CanonicalReadModel.js";
import {
  HEALTHKIT_CANONICAL_WORKOUT_SCHEMA_VERSION,
  HealthKitWorkoutFamily,
  isHealthKitCanonicalWorkoutRecord,
} from "./HealthKitWorkoutService.js";
import {
  HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION,
  HEALTHKIT_WORKOUT_MATCHER_VERSION,
  HealthKitWorkoutLinkStatus,
  getHealthKitWorkoutLinkRecordId,
  isTrustedNativeLiveLoggerSession,
} from "./HealthKitWorkoutLinkService.js";
import { assertHealthKitWorkoutRelationshipIntegrity } from "./HealthKitWorkoutRelationshipService.js";
import { isActiveDetailedStrengthSession } from "./HealthKitObservationService.js";
import { createHealthKitQuarantinedEligibility } from "./HealthKitEvidenceEligibilityPolicy.js";

// Read-only projection boundary for a confirmed Apple workout relationship.
// It deliberately exposes no matching evidence, private HealthKit identity,
// claim/history rows, or strategic eligibility. A malformed relationship
// graph yields no provenance at all: presentation never weakens the guarded
// confirmation boundary.
export function projectConfirmedHealthKitWorkoutAttachments({
  canonicalEvidenceObjects = [],
  canonicalWorkouts = [],
  workoutLinks = [],
  workoutLinkClaims = [],
} = {}) {
  try {
    assertHealthKitWorkoutRelationshipIntegrity({
      links: workoutLinks,
      claims: workoutLinkClaims,
    });
  } catch {
    return Object.freeze([]);
  }

  const activeStrengthSessions = canonicalEvidenceObjects
    .filter(isActiveCanonicalEvidenceObject)
    .filter(isActiveDetailedStrengthSession)
    .filter((record) => isTrustedNativeLiveLoggerSession(record.payload ?? record));
  const activeTrainingById = new Map(activeStrengthSessions.flatMap((record) =>
    [record.canonicalId, (record.payload ?? record).id]
      .filter(Boolean)
      .map((id) => [String(id), record])));
  const workoutsById = new Map(canonicalWorkouts
    .filter(isPresentableCanonicalWorkout)
    .map((workout) => [workout.id, workout]));

  const output = [];
  for (const link of workoutLinks) {
    if (link.status !== HealthKitWorkoutLinkStatus.CONFIRMED) continue;
    const workout = workoutsById.get(link.canonicalWorkoutId);
    const loggerSession = activeTrainingById.get(String(link.loggerSessionCanonicalId));
    if (!workout || !loggerSession || !isPresentableConfirmedStrengthLink({ link, workout, loggerSession })) continue;
    const current = workout.current;
    output.push(Object.freeze({
      canonicalWorkoutId: workout.id,
      loggerSessionCanonicalId: link.loggerSessionCanonicalId,
      family: current.family,
      canonicalType: current.canonicalType,
      relationship: Object.freeze({
        status: "confirmed",
        confirmedAt: link.updatedAt,
        contentAuthority: Object.freeze({
          trainingContent: "workout_logger",
          telemetry: "healthkit",
        }),
      }),
      source: Object.freeze({
        application: "Apple Health",
        sourceName: current.source?.sourceName ?? "Apple Health",
        productType: current.source?.productType ?? null,
      }),
      session: Object.freeze({
        startedAt: current.startedAt ?? null,
        endedAt: current.endedAt ?? null,
        durationSeconds: finiteOrNull(current.telemetry?.durationSeconds),
        activeCalories: finiteOrNull(current.telemetry?.activeCalories),
        totalCalories: finiteOrNull(current.telemetry?.totalCalories),
        distance: finiteOrNull(current.telemetry?.distance),
        distanceUnit: current.telemetry?.distanceUnit ?? null,
        averageHeartRate: finiteOrNull(current.telemetry?.averageHeartRate),
      }),
    }));
  }
  return Object.freeze(output.sort((left, right) =>
    left.loggerSessionCanonicalId.localeCompare(right.loggerSessionCanonicalId)));
}

export function indexConfirmedHealthKitWorkoutAttachments(input = {}) {
  return new Map(projectConfirmedHealthKitWorkoutAttachments(input)
    .map((attachment) => [attachment.loggerSessionCanonicalId, attachment]));
}

function isPresentableCanonicalWorkout(workout) {
  const current = workout?.current;
  const provenance = workout?.provenance;
  const sourceObservationIds = provenance?.sourceObservationIds;
  return isHealthKitCanonicalWorkoutRecord(workout) &&
    workout.schemaVersion === HEALTHKIT_CANONICAL_WORKOUT_SCHEMA_VERSION &&
    typeof workout.userId === "string" && workout.userId.length > 0 &&
    Number.isSafeInteger(workout.revision) && workout.revision > 0 &&
    typeof workout.semanticFingerprint === "string" && workout.semanticFingerprint.startsWith("sha256_") &&
    exactObject(workout.evidenceEligibility, createHealthKitQuarantinedEligibility()) &&
    exactObject(workout.contentAuthority, { telemetry: "healthkit", trainingContent: "workout_logger" }) &&
    exactObject(workout.activityInteraction, {
      policy: "workout_energy_is_descriptive_never_additive",
      additiveToDailyActivity: false,
    }) &&
    current && typeof current === "object" &&
    current.family === HealthKitWorkoutFamily.STRENGTH &&
    workout.localDate === current.localDate &&
    typeof current.startedAt === "string" && Number.isFinite(Date.parse(current.startedAt)) &&
    typeof current.sourceObservationId === "string" && current.sourceObservationId.length > 0 &&
    provenance?.currentSourceObservationId === current.sourceObservationId &&
    Array.isArray(sourceObservationIds) && sourceObservationIds.includes(current.sourceObservationId) &&
    provenance?.application === "Apple Health" && provenance?.integration === "HealthKit" &&
    provenance?.modality === "direct" && provenance?.basis === "healthkit_workout_observation" &&
    provenance?.bundleIdentifier === current.source?.bundleIdentifier;
}

function isPresentableConfirmedStrengthLink({ link, workout, loggerSession }) {
  const payload = loggerSession.payload ?? loggerSession;
  const loggerUserId = loggerSession.userId ?? payload.userId;
  const loggerDate = String(payload.observed_at ?? "").slice(0, 10);
  return loggerSession.canonicalId === payload.id &&
    link.loggerSessionCanonicalId === loggerSession.canonicalId &&
    link.schemaVersion === HEALTHKIT_WORKOUT_LINK_SCHEMA_VERSION &&
    link.matcherVersion === HEALTHKIT_WORKOUT_MATCHER_VERSION &&
    link.id === getHealthKitWorkoutLinkRecordId(link.canonicalWorkoutId, link.loggerSessionCanonicalId) &&
    link.canonicalWorkoutId === workout.id &&
    link.userId === workout.userId && link.userId === loggerUserId &&
    link.localDate === workout.localDate && link.localDate === workout.current.localDate &&
    link.localDate === loggerDate &&
    exactObject(link.contentAuthority, { trainingContent: "workout_logger", telemetry: "healthkit" }) &&
    exactObject(link.evidenceEligibility, createHealthKitQuarantinedEligibility());
}

function exactObject(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) =>
    key === expectedKeys[index] && value[key] === expected[key]);
}

function finiteOrNull(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number)
    ? number
    : null;
}
