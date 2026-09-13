import { createHash } from "node:crypto";
import { assessWorkoutDuplicatePair } from "./WorkoutDuplicateIdentityService.js";

export const HEALTHKIT_OBSERVATION_SCHEMA_VERSION = "healthkit-source-observation-v1";
export const HEALTHKIT_INGESTION_CONTRACT_VERSION = "healthkit-ingestion-v1";
export const HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH = 100;

export const HealthKitObservationType = Object.freeze({
  ACTIVITY_SUMMARY: "activity_summary",
  QUANTITY_SAMPLE: "quantity_sample",
  WORKOUT: "workout",
});

export const HealthKitReconciliationState = Object.freeze({
  SOURCE_ONLY: "source_only",
  ACTIVITY_DAY_CANONICALIZED: "activity_day_canonicalized",
  ACTIVITY_SUMMARY_SUPERSEDED: "activity_summary_superseded",
  WORKOUT_CANONICALIZATION_DEFERRED: "workout_canonicalization_deferred",
  TRAINING_MATCH_CANDIDATE: "training_match_candidate",
  TRAINING_MATCH_AMBIGUOUS: "training_match_ambiguous",
  TRAINING_SESSION_LINKED: "training_session_linked",
});

export class HealthKitObservationError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "HealthKitObservationError";
    this.code = code;
    this.field = field;
  }
}

export function normalizeHealthKitObservationBatch({
  batchId,
  observations,
  principalDeviceId,
} = {}) {
  requiredText(batchId, "batchId");
  requiredText(principalDeviceId, "principal.deviceId");
  if (!Array.isArray(observations) || observations.length === 0) {
    throw invalid("observations", "HealthKit ingestion requires at least one observation.");
  }
  if (observations.length > HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH) {
    throw invalid(
      "observations",
      `HealthKit ingestion accepts at most ${HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH} observations per batch.`
    );
  }

  const byId = new Map();
  for (const [index, value] of observations.entries()) {
    const observation = normalizeObservation(value, {
      batchId: String(batchId),
      principalDeviceId: String(principalDeviceId),
      index,
    });
    const existing = byId.get(observation.id);
    if (existing && existing.semanticFingerprint !== observation.semanticFingerprint) {
      throw new HealthKitObservationError(
        "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION",
        "One HealthKit source identity was reused for different observation content.",
        `observations[${index}].externalId`
      );
    }
    byId.set(observation.id, existing ?? observation);
  }
  return Object.freeze({
    contractVersion: HEALTHKIT_INGESTION_CONTRACT_VERSION,
    batchId: String(batchId),
    observations: Object.freeze([...byId.values()]),
  });
}

export function createHealthKitObservationRecord({
  observation,
  reconciliation,
  ownerUserId,
  receivedAt,
} = {}) {
  return Object.freeze({
    schemaVersion: HEALTHKIT_OBSERVATION_SCHEMA_VERSION,
    id: observation.id,
    userId: ownerUserId,
    observationType: observation.observationType,
    externalId: observation.externalId,
    semanticFingerprint: observation.semanticFingerprint,
    occurredAt: observation.occurrence.startedAt ?? observation.occurrence.localDate,
    occurrenceDate: observation.occurrence.localDate,
    occurrence: structuredClone(observation.occurrence),
    source: structuredClone(observation.source),
    measurement: structuredClone(observation.measurement),
    ingestion: {
      firstReceivedAt: isoDateTime(receivedAt, "receivedAt"),
      batchId: observation.ingestion.batchId,
      deliveryDeviceId: observation.ingestion.deliveryDeviceId,
    },
    reconciliation: structuredClone(reconciliation),
    // Source provenance is not strategic Evidence. A later server-owned policy
    // may assess eligibility; ingestion intentionally does not do so.
    evidenceEligibility: { state: "not_assessed", decidedBy: null },
  });
}

export function createHealthKitActivityDayPayload(observation) {
  if (observation?.observationType !== HealthKitObservationType.ACTIVITY_SUMMARY) {
    throw invalid("observationType", "Only a HealthKit activity summary can canonicalize to ActivityDay.");
  }
  const dailyActivity = observation.measurement.dailyActivity;
  return Object.freeze({
    id: observation.id,
    evidence_type: "activity_day",
    observed_at: observation.occurrence.localDate,
    daily_activity: structuredClone(dailyActivity),
    metadata: {
      date: observation.occurrence.localDate,
      time_zone: observation.occurrence.timeZone,
      aggregation_scope: observation.measurement.aggregationScope,
      coverage: observation.measurement.coverage,
      includes_workout_energy: true,
      source_revision: observation.measurement.sourceRevision,
      source_device_id: observation.ingestion.deliveryDeviceId,
    },
    derived_metrics: {
      aggregation_policy: "authoritative_healthkit_daily_total",
      workout_active_calories_additive: false,
    },
    references: { training_session_ids: [] },
    source: {
      application: "Apple Health",
      integration: "HealthKit",
      modality: "direct",
      bundle_identifier: observation.source.bundleIdentifier,
      source_external_id: observation.externalId,
      source_observation_id: observation.id,
    },
    provenance: { source_observation_ids: [observation.id] },
  });
}

export function reconcileHealthKitWorkoutObservation({
  observation,
  canonicalObjects = [],
} = {}) {
  if (observation?.observationType !== HealthKitObservationType.WORKOUT) {
    return Object.freeze({ state: HealthKitReconciliationState.SOURCE_ONLY });
  }
  if (!isStrengthWorkout(observation.measurement.activityType)) {
    return Object.freeze({
      state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED,
      reason: "canonical_workout_evidence_eligibility_boundary_not_yet_separate",
      canonicalCandidate: createCanonicalWorkoutCandidate(observation),
    });
  }

  const sourceWorkout = createCanonicalWorkoutCandidate(observation);
  const candidates = canonicalObjects
    .filter(isActiveDetailedStrengthSession)
    .map((record) => {
      const payload = record.payload ?? record;
      const assessment = assessWorkoutDuplicatePair(sourceWorkout, payload);
      return Object.freeze({
        canonicalId: record.canonicalId ?? payload.id,
        outcome: assessment.outcome,
        confidence: assessment.confidence,
        reasons: Object.freeze(assessment.reasons),
      });
    })
    .filter((candidate) => candidate.outcome !== "not_duplicate")
    .sort((left, right) => right.confidence - left.confidence || left.canonicalId.localeCompare(right.canonicalId));

  const exact = candidates.filter((candidate) => candidate.confidence === 100);
  if (exact.length === 1) {
    return Object.freeze({
      state: HealthKitReconciliationState.TRAINING_SESSION_LINKED,
      canonicalTrainingSessionId: exact[0].canonicalId,
      candidates: Object.freeze(candidates),
      associationAuthority: "preexisting_canonical_source_identity",
    });
  }
  if (candidates.length === 1) {
    return Object.freeze({
      state: HealthKitReconciliationState.TRAINING_MATCH_CANDIDATE,
      candidates: Object.freeze(candidates),
      confirmationRequired: true,
    });
  }
  if (candidates.length > 1) {
    return Object.freeze({
      state: HealthKitReconciliationState.TRAINING_MATCH_AMBIGUOUS,
      candidates: Object.freeze(candidates),
      confirmationRequired: true,
    });
  }
  return Object.freeze({
    state: HealthKitReconciliationState.SOURCE_ONLY,
    reason: "no_trustworthy_training_session_match",
    candidates: Object.freeze([]),
  });
}

export function getLatestComparableActivityRevision(observations = [], incoming) {
  if (incoming?.observationType !== HealthKitObservationType.ACTIVITY_SUMMARY) return null;
  return observations
    .filter((record) =>
      record.observationType === HealthKitObservationType.ACTIVITY_SUMMARY &&
      record.externalId === incoming.externalId &&
      record.ingestion?.deliveryDeviceId === incoming.ingestion.deliveryDeviceId
    )
    .sort((left, right) =>
      Number(right.measurement?.sourceRevision ?? 0) - Number(left.measurement?.sourceRevision ?? 0)
    )[0] ?? null;
}

function normalizeObservation(value, { batchId, principalDeviceId, index }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`observations[${index}]`, "Each HealthKit observation must be an object.");
  }
  const observationType = requiredEnum(
    value.observationType,
    Object.values(HealthKitObservationType),
    `observations[${index}].observationType`
  );
  const externalId = requiredText(value.externalId, `observations[${index}].externalId`);
  const source = normalizeSource(value.source, index);
  const occurrence = normalizeOccurrence(value.occurrence, observationType, index);
  const measurement = normalizeMeasurement(value, observationType, index);
  const identityParts = [source.bundleIdentifier, observationType, externalId];
  if (observationType === HealthKitObservationType.ACTIVITY_SUMMARY) {
    identityParts.push(principalDeviceId, String(measurement.sourceRevision));
  }
  const id = `healthkit_observation_${digest(identityParts.join("\u0000"))}`;
  const semantic = { observationType, externalId, source, occurrence, measurement };
  return Object.freeze({
    id,
    observationType,
    externalId,
    source: Object.freeze(source),
    occurrence: Object.freeze(occurrence),
    measurement: Object.freeze(measurement),
    semanticFingerprint: `sha256_${digest(stable(semantic))}`,
    ingestion: Object.freeze({ batchId, deliveryDeviceId: principalDeviceId }),
  });
}

function normalizeSource(source, index) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw invalid(`observations[${index}].source`, "HealthKit source provenance is required.");
  }
  return compact({
    bundleIdentifier: requiredText(source.bundleIdentifier, `observations[${index}].source.bundleIdentifier`),
    productType: optionalText(source.productType),
    deviceModel: optionalText(source.deviceModel),
    operatingSystemVersion: optionalText(source.operatingSystemVersion),
  });
}

function normalizeOccurrence(occurrence, observationType, index) {
  if (!occurrence || typeof occurrence !== "object" || Array.isArray(occurrence)) {
    throw invalid(`observations[${index}].occurrence`, "HealthKit occurrence timing is required.");
  }
  const localDate = calendarDate(occurrence.localDate, `observations[${index}].occurrence.localDate`);
  const timeZone = validTimeZone(occurrence.timeZone, `observations[${index}].occurrence.timeZone`);
  const startedAt = occurrence.startedAt == null ? null : isoDateTime(occurrence.startedAt, `observations[${index}].occurrence.startedAt`);
  const endedAt = occurrence.endedAt == null ? null : isoDateTime(occurrence.endedAt, `observations[${index}].occurrence.endedAt`);
  if (observationType !== HealthKitObservationType.ACTIVITY_SUMMARY && !startedAt) {
    throw invalid(`observations[${index}].occurrence.startedAt`, "Workout and sample occurrence time is required.");
  }
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
    throw invalid(`observations[${index}].occurrence.endedAt`, "Occurrence end must not precede its start.");
  }
  return compact({ localDate, timeZone, startedAt, endedAt });
}

function normalizeMeasurement(value, observationType, index) {
  if (observationType === HealthKitObservationType.ACTIVITY_SUMMARY) {
    const summary = value.activitySummary;
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      throw invalid(`observations[${index}].activitySummary`, "Activity summary metrics are required.");
    }
    if (summary.aggregationScope !== "daily_total_including_workouts") {
      throw invalid(
        `observations[${index}].activitySummary.aggregationScope`,
        "Activity summaries must be HealthKit daily totals that already include workout energy."
      );
    }
    const sourceRevision = positiveInteger(summary.sourceRevision, `observations[${index}].activitySummary.sourceRevision`);
    const dailyActivity = numericObject(summary.dailyActivity, `observations[${index}].activitySummary.dailyActivity`);
    if (finite(dailyActivity.move_calories) == null) {
      throw invalid(`observations[${index}].activitySummary.dailyActivity.move_calories`, "HealthKit daily active calories are required.");
    }
    return {
      aggregationScope: summary.aggregationScope,
      coverage: requiredEnum(summary.coverage, ["partial_day", "complete_day"], `observations[${index}].activitySummary.coverage`),
      sourceRevision,
      dailyActivity,
    };
  }
  if (observationType === HealthKitObservationType.WORKOUT) {
    const workout = value.workout;
    if (!workout || typeof workout !== "object" || Array.isArray(workout)) {
      throw invalid(`observations[${index}].workout`, "Workout metrics are required.");
    }
    return compact({
      activityType: requiredText(workout.activityType, `observations[${index}].workout.activityType`),
      durationSeconds: optionalFinite(workout.durationSeconds, `observations[${index}].workout.durationSeconds`),
      activeCalories: optionalFinite(workout.activeCalories, `observations[${index}].workout.activeCalories`),
      totalCalories: optionalFinite(workout.totalCalories, `observations[${index}].workout.totalCalories`),
      distance: optionalFinite(workout.distance, `observations[${index}].workout.distance`),
      distanceUnit: optionalText(workout.distanceUnit),
      averageHeartRate: optionalFinite(workout.averageHeartRate, `observations[${index}].workout.averageHeartRate`),
    });
  }
  const sample = value.quantitySample;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    throw invalid(`observations[${index}].quantitySample`, "Quantity sample data is required.");
  }
  return {
    sampleType: requiredText(sample.sampleType, `observations[${index}].quantitySample.sampleType`),
    value: requiredFinite(sample.value, `observations[${index}].quantitySample.value`),
    unit: requiredText(sample.unit, `observations[${index}].quantitySample.unit`),
    workoutExternalId: optionalText(sample.workoutExternalId),
  };
}

function createCanonicalWorkoutCandidate(observation) {
  const measurement = observation.measurement;
  return Object.freeze({
    id: observation.id,
    evidence_type: "training",
    observed_at: observation.occurrence.localDate,
    source: {
      application: "Apple Health",
      integration: "HealthKit",
      modality: "direct",
      source_workout_id: observation.externalId,
    },
    metadata: compact({
      activity_type: measurement.activityType,
      start_time: observation.occurrence.startedAt,
      end_time: observation.occurrence.endedAt,
      duration_seconds: measurement.durationSeconds,
      active_calories: measurement.activeCalories,
      total_calories: measurement.totalCalories,
      distance: measurement.distance,
      distance_unit: measurement.distanceUnit,
      average_heart_rate: measurement.averageHeartRate,
      source_workout_id: observation.externalId,
    }),
    exercises: [],
    provenance: {
      source_workout_id: observation.externalId,
      source_observation_ids: [observation.id],
    },
  });
}

function isActiveDetailedStrengthSession(record) {
  const payload = record?.payload ?? record;
  return payload?.evidence_type === "training" &&
    record?.quality?.status !== "superseded" &&
    payload?.quality?.status !== "superseded" &&
    isStrengthWorkout(payload?.metadata?.activity_type) &&
    Array.isArray(payload?.exercises) && payload.exercises.length > 0;
}

function isStrengthWorkout(value) {
  return /strength|resistance|weight training|functional strength|traditional strength/i.test(String(value ?? ""));
}

function numericObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(field, `${field} must be an object.`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === "ring_completion") return [key, numericObject(item, `${field}.${key}`)];
    return [key, requiredFinite(item, `${field}.${key}`)];
  }));
}

function requiredFinite(value, field) {
  const number = finite(value);
  if (number == null || number < 0) throw invalid(field, `${field} must be a non-negative finite number.`);
  return number;
}
function optionalFinite(value, field) { return value == null ? null : requiredFinite(value, field); }
function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw invalid(field, `${field} must be a positive integer.`);
  return number;
}
function requiredText(value, field) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 300) throw invalid(field, `${field} must be a non-empty bounded string.`);
  return text;
}
function optionalText(value) { const text = String(value ?? "").trim(); return text || null; }
function requiredEnum(value, values, field) {
  const text = requiredText(value, field);
  if (!values.includes(text)) throw invalid(field, `${field} is unsupported.`);
  return text;
}
function calendarDate(value, field) {
  const text = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw invalid(field, `${field} must be YYYY-MM-DD.`);
  }
  const [year, month, day] = text.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== text) {
    throw invalid(field, `${field} must be YYYY-MM-DD.`);
  }
  return text;
}
function isoDateTime(value, field) {
  const time = Date.parse(String(value ?? ""));
  if (!Number.isFinite(time)) throw invalid(field, `${field} must be an ISO date-time.`);
  return new Date(time).toISOString();
}
function validTimeZone(value, field) {
  const timeZone = requiredText(value, field);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw invalid(field, `${field} must be an IANA time zone.`);
  }
  return timeZone;
}
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "")); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function invalid(field, message) { return new HealthKitObservationError("HEALTHKIT_CONTRACT_INVALID", message, field); }
