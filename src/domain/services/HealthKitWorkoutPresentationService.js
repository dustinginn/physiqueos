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

/**
 * Presentation-only HK telemetry resolution for a Logger Strength session:
 * the one authority every Training / Workout-Detail / Activity-Linked-
 * Training-Context / Logged Today view reads.
 *
 * Only a CONFIRMED relationship may change how a Logger session is
 * presented (2026-10-04 Founder correction). A candidate, a possible or
 * confident matcher result, a Founder "No match" (unlinked) relationship, or
 * no relationship at all leaves the structured Logger session's own canonical
 * start/end/duration/energy presentation untouched -- an unconfirmed Apple
 * workout (for example one started late by hand) can never replace it. This
 * never creates, confirms, or alters a `healthKitWorkoutLinks` row, the
 * Logger session, or its sets/exercises.
 */
export function projectHealthKitStrengthWorkoutPresentationBySession({
  canonicalEvidenceObjects = [],
  canonicalWorkouts = [],
  workoutLinks = [],
  workoutLinkClaims = [],
} = {}) {
  return Object.freeze(indexConfirmedHealthKitWorkoutAttachments({
    canonicalEvidenceObjects,
    canonicalWorkouts,
    workoutLinks,
    workoutLinkClaims,
  }));
}

function isPresentableCanonicalWorkout(workout) {
  return isPresentableCanonicalWorkoutOfFamily(workout, HealthKitWorkoutFamily.STRENGTH);
}

// The same structural-integrity gate Activity's whole-day accounting applies to a Cardio
// workout, exported so Training Day presents exactly the Cardio workouts Activity counts.
export function isPresentableCanonicalCardioWorkout(workout) {
  return isPresentableCanonicalWorkoutOfFamily(workout, HealthKitWorkoutFamily.CARDIO);
}

// Canonical standalone workout-history rows include Cardio plus exact
// non-Cardio history such as Cooldown. Keeping this gate separate from the
// Cardio-specific helper prevents a history row from acquiring Cardio
// semantics merely because the same read surface presents both.
export function isPresentableCanonicalWorkoutHistory(workout) {
  return [HealthKitWorkoutFamily.CARDIO, HealthKitWorkoutFamily.OTHER]
    .some((family) => isPresentableCanonicalWorkoutOfFamily(workout, family));
}

// Same structural-integrity check `isPresentableCanonicalWorkout` has always
// used for a Strength presentation candidate, generalized to any family so
// Part E's whole-day-accounting eligibility (see
// `projectWholeDayEligibleHealthKitWorkouts` below) can reuse it for Cardio
// too, without weakening what Strength presentation itself accepts. Pure
// refactor of the existing checks -- `isPresentableCanonicalWorkout`'s own
// behavior for Strength is unchanged.
function isPresentableCanonicalWorkoutOfFamily(workout, family) {
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
    current.family === family &&
    workout.localDate === current.localDate &&
    typeof current.startedAt === "string" && Number.isFinite(Date.parse(current.startedAt)) &&
    typeof current.sourceObservationId === "string" && current.sourceObservationId.length > 0 &&
    provenance?.currentSourceObservationId === current.sourceObservationId &&
    Array.isArray(sourceObservationIds) && sourceObservationIds.includes(current.sourceObservationId) &&
    provenance?.application === "Apple Health" && provenance?.integration === "HealthKit" &&
    provenance?.modality === "direct" && provenance?.basis === "healthkit_workout_observation" &&
    provenance?.bundleIdentifier === current.source?.bundleIdentifier;
}

/**
 * Part E: whole-day workout-calorie-accounting eligibility. This answers a
 * different, narrower question than
 * `projectHealthKitStrengthWorkoutPresentationBySession` above -- not "what
 * should Training / Workout-Detail DISPLAY for this Logger session" but
 * "whose energy, already inside the whole-day HealthKit active-energy total,
 * may be broken out as Activity's `workout_active_calories`". It never
 * creates, confirms, or reads any relationship beyond what already exists.
 *
 * Eligibility (a deliberate, documented product decision -- see the Part E
 * report for full reasoning):
 *  - Strength: CONFIRMED link only, reusing
 *    `projectConfirmedHealthKitWorkoutAttachments` unchanged. Strength has an
 *    explicit confirm/deny step for exactly this reason (and, since the
 *    2026-10-04 correction, an unconfirmed candidate is not shown either).
 *  - Cardio: every canonicalized Cardio workout, confirmed or not. Cardio
 *    structurally has no Logger session and no confirm/deny step at all (see
 *    `HealthKitWorkoutLinkService.js`'s cardio-coexistence branch) --
 *    canonicalization IS Cardio's inclusion decision.
 *  - Other history: exact canonical non-Cardio workout types (currently only
 *    Cooldown). They are descriptive Activity workout history only and never
 *    become Cardio sessions, minutes, totals, flags, targets or strategy.
 * One canonical workout identity contributes at most once, defensively
 * deduped by id even though today's shape cannot produce a duplicate.
 */
export function projectWholeDayEligibleHealthKitWorkouts({
  canonicalEvidenceObjects = [],
  canonicalWorkouts = [],
  workoutLinks = [],
  workoutLinkClaims = [],
} = {}) {
  const confirmedStrength = projectConfirmedHealthKitWorkoutAttachments({
    canonicalEvidenceObjects, canonicalWorkouts, workoutLinks, workoutLinkClaims,
  });
  const workoutsById = new Map(canonicalWorkouts.map((workout) => [workout.id, workout]));
  const seen = new Set();
  const output = [];

  for (const attachment of confirmedStrength) {
    const workout = workoutsById.get(attachment.canonicalWorkoutId);
    if (!workout || !isPresentableCanonicalWorkoutOfFamily(workout, HealthKitWorkoutFamily.STRENGTH)) continue;
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    output.push(buildEligibleWholeDayWorkout({
      workout,
      basis: "confirmed_strength_link",
      loggerSessionCanonicalId: attachment.loggerSessionCanonicalId,
    }));
  }

  for (const workout of canonicalWorkouts) {
    if (!isPresentableCanonicalWorkoutHistory(workout)) continue;
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    output.push(buildEligibleWholeDayWorkout({
      workout,
      basis: workout.current.family === HealthKitWorkoutFamily.CARDIO
        ? "canonicalized_cardio"
        : "canonicalized_workout_history",
      loggerSessionCanonicalId: null,
    }));
  }

  return Object.freeze(output.sort((left, right) => left.canonicalWorkoutId.localeCompare(right.canonicalWorkoutId)));
}

function buildEligibleWholeDayWorkout({ workout, basis, loggerSessionCanonicalId }) {
  const current = workout.current;
  return Object.freeze({
    canonicalWorkoutId: workout.id,
    loggerSessionCanonicalId,
    family: current.family,
    canonicalType: current.canonicalType,
    localDate: workout.localDate,
    eligibility: Object.freeze({
      basis,
      includedInWholeDayEnergy: true,
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
  });
}

/**
 * Same eligible-workout set as `projectWholeDayEligibleHealthKitWorkouts`,
 * grouped by the workout's own canonical `localDate` -- the grouping
 * `ProgressReportingService.js` needs to merge Cardio (which has no Logger
 * session, and therefore no date to group by via any training session) into
 * a day's whole-day workout-energy accounting.
 */
export function indexWholeDayEligibleHealthKitWorkoutsByDate(input = {}) {
  const eligible = projectWholeDayEligibleHealthKitWorkouts(input);
  const byDate = new Map();
  for (const entry of eligible) {
    if (!entry.localDate) continue;
    if (!byDate.has(entry.localDate)) byDate.set(entry.localDate, []);
    byDate.get(entry.localDate).push(entry);
  }
  for (const [date, list] of byDate) byDate.set(date, Object.freeze(list));
  return Object.freeze(byDate);
}

function isPresentableConfirmedStrengthLink({ link, workout, loggerSession }) {
  const payload = loggerSession.payload ?? loggerSession;
  const loggerUserId = loggerSession.userId ?? payload.userId;
  const loggerDate = String(payload.observed_at ?? "").slice(0, 10);
  return hasExactNativeLoggerIdentityPair(loggerSession.canonicalId, payload.id) &&
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

function hasExactNativeLoggerIdentityPair(canonicalId, payloadId) {
  const canonicalPrefix = "training|authoritative|training_logger_draft_";
  const payloadPrefix = "training_logger_session_";
  if (!String(canonicalId ?? "").startsWith(canonicalPrefix) ||
      !String(payloadId ?? "").startsWith(payloadPrefix)) return false;
  const canonicalSessionId = String(canonicalId).slice(canonicalPrefix.length);
  const payloadSessionId = String(payloadId).slice(payloadPrefix.length);
  return canonicalSessionId.length > 0 && canonicalSessionId === payloadSessionId;
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
