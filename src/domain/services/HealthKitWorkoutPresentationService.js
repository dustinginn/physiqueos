import { isActiveCanonicalEvidenceObject } from "./CanonicalReadModel.js";
import {
  HEALTHKIT_CANONICAL_WORKOUT_SCHEMA_VERSION,
  isHealthKitCanonicalWorkoutRecord,
} from "./HealthKitWorkoutService.js";
import { HealthKitWorkoutLinkStatus } from "./HealthKitWorkoutLinkService.js";
import { assertHealthKitWorkoutRelationshipIntegrity } from "./HealthKitWorkoutRelationshipService.js";

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

  const activeTrainingIds = new Set(canonicalEvidenceObjects
    .filter(isActiveCanonicalEvidenceObject)
    .filter((record) => (record.payload ?? record).evidence_type === "training")
    .flatMap((record) => [record.canonicalId, (record.payload ?? record).id])
    .filter(Boolean)
    .map(String));
  const workoutsById = new Map(canonicalWorkouts
    .filter(isPresentableCanonicalWorkout)
    .map((workout) => [workout.id, workout]));

  const output = [];
  for (const link of workoutLinks) {
    if (link.status !== HealthKitWorkoutLinkStatus.CONFIRMED ||
        !activeTrainingIds.has(String(link.loggerSessionCanonicalId))) continue;
    const workout = workoutsById.get(link.canonicalWorkoutId);
    if (!workout) continue;
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
  return isHealthKitCanonicalWorkoutRecord(workout) &&
    workout.schemaVersion === HEALTHKIT_CANONICAL_WORKOUT_SCHEMA_VERSION &&
    workout.evidenceEligibility?.state === "quarantined" &&
    workout.evidenceEligibility?.strategic === false &&
    workout.contentAuthority?.trainingContent === "workout_logger" &&
    workout.contentAuthority?.telemetry === "healthkit" &&
    workout.activityInteraction?.additiveToDailyActivity === false &&
    current && typeof current === "object" &&
    typeof current.family === "string" &&
    typeof current.startedAt === "string";
}

function finiteOrNull(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number)
    ? number
    : null;
}
