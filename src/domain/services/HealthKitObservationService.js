import { createHash } from "node:crypto";
import { assessWorkoutDuplicatePair } from "./WorkoutDuplicateIdentityService.js";

export const HEALTHKIT_OBSERVATION_SCHEMA_VERSION = "healthkit-source-observation-v1";
export const HEALTHKIT_INGESTION_CONTRACT_VERSION = "healthkit-ingestion-v1";
export const HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH = 100;
// Field bounds. Every string and object the ingestion command accepts is
// explicitly bounded so the maximum encoded request can be derived from the
// contract (see nativeCommandRequestBounds.js) instead of being guessed.
export const HEALTHKIT_MAX_TEXT_LENGTH = 300;
export const HEALTHKIT_MAX_TIMESTAMP_LENGTH = 64;
export const HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH = 32;
export const HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS = 32;
export const HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH = 64;
export const HEALTHKIT_MAX_RING_COMPLETION_METRICS = 8;
export const HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID = "healthkit_canonical_daily_activation_policy";
export const HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION = "healthkit-canonical-activation-policy-v1";
// One explicitly bounded proving window. It is a date range only so a test day
// can finish after midnight; it is never an open-ended activation.
export const HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS = 7;
// Workout canonicalization is activated independently of the daily domains: its
// own record, its own exact window, and its own audit trail. OFF by default.
export const HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID = "healthkit_workout_canonical_activation_policy";
export const HEALTHKIT_WORKOUT_ACTIVATION_POLICY_SCHEMA_VERSION = "healthkit-workout-activation-policy-v1";
export const HEALTHKIT_WORKOUT_ACTIVATION_MAX_DAYS = 3;
export const HEALTHKIT_NUTRITION_MAX_FIELDS = 4;
export const HEALTHKIT_NUTRITION_DAILY_TOTAL_SCOPE = "daily_total_all_sources";
export const HealthKitCanonicalizationDomain = Object.freeze({
  ACTIVITY: "activity",
  NUTRITION: "nutrition",
});
const NUTRITION_FIELDS = Object.freeze(["calories", "protein_g", "carbs_g", "fat_g"]);

export const HealthKitIngestionPurpose = Object.freeze({
  OPERATIONAL: "operational",
  VALIDATION_ONLY: "validation_only",
});

export const HealthKitObservationType = Object.freeze({
  ACTIVITY_SUMMARY: "activity_summary",
  NUTRITION_DAILY_TOTAL: "nutrition_daily_total",
  QUANTITY_SAMPLE: "quantity_sample",
  WORKOUT: "workout",
});

export const HealthKitReconciliationState = Object.freeze({
  SOURCE_ONLY: "source_only",
  ACTIVITY_DAY_CANONICALIZED: "activity_day_canonicalized",
  ACTIVITY_CANONICALIZATION_PENDING: "activity_canonicalization_pending",
  ACTIVITY_CANONICALIZATION_DEFERRED: "activity_canonicalization_deferred",
  ACTIVITY_VALIDATION_ONLY: "activity_validation_only",
  ACTIVITY_SUMMARY_SUPERSEDED: "activity_summary_superseded",
  NUTRITION_DAY_CANONICALIZED: "nutrition_day_canonicalized",
  NUTRITION_CANONICALIZATION_PENDING: "nutrition_canonicalization_pending",
  NUTRITION_CANONICALIZATION_DEFERRED: "nutrition_canonicalization_deferred",
  NUTRITION_VALIDATION_ONLY: "nutrition_validation_only",
  NUTRITION_SUMMARY_SUPERSEDED: "nutrition_summary_superseded",
  WORKOUT_CANONICALIZATION_DEFERRED: "workout_canonicalization_deferred",
  WORKOUT_CANONICALIZATION_PENDING: "workout_canonicalization_pending",
  WORKOUT_CANONICALIZED: "workout_canonicalized",
  WORKOUT_SUMMARY_SUPERSEDED: "workout_summary_superseded",
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
    if (existing && existing.ingestionPurpose !== observation.ingestionPurpose) {
      throw new HealthKitObservationError(
        "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE",
        "One HealthKit source identity cannot be reused under a different ingestion purpose.",
        `observations[${index}].ingestionPurpose`
      );
    }
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
    ingestionPurpose: observation.ingestionPurpose,
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

export function resolveHealthKitCanonicalActivationPolicy(record) {
  const disabled = (source, invalidReason = null) => Object.freeze({
    enabled: false,
    domains: Object.freeze([]),
    effectiveLocalDate: null,
    endLocalDate: null,
    openEnded: false,
    source,
    invalidReason,
  });
  if (!record) return disabled("not_configured");
  // Fail closed and never throw: a malformed policy must not turn every
  // HealthKit delivery into a 4xx that Native would treat as permanent.
  try {
    if (record.status !== "enabled") return disabled("server_owned_configuration", "status_not_enabled");
    if (record.schemaVersion !== HEALTHKIT_CANONICAL_ACTIVATION_POLICY_SCHEMA_VERSION) {
      return disabled("invalid_configuration_fail_closed", "schema_version_unrecognized");
    }
    // The policy carries no strategic-eligibility control. A value other than
    // the quarantine marker, or any backfill request, invalidates the record.
    if (record.strategicEvidenceEligibility !== undefined && record.strategicEvidenceEligibility !== "quarantined") {
      return disabled("invalid_configuration_fail_closed", "strategic_eligibility_not_quarantined");
    }
    if (record.historicalBackfill !== undefined && record.historicalBackfill !== false) {
      return disabled("invalid_configuration_fail_closed", "historical_backfill_not_permitted");
    }
    const domains = Array.isArray(record.domains) ? [...new Set(record.domains)].sort() : [];
    const supported = Object.values(HealthKitCanonicalizationDomain);
    if (domains.length === 0 || domains.some((domain) => !supported.includes(domain))) {
      return disabled("invalid_configuration_fail_closed", "domains_invalid");
    }
    if (record.openEnded !== undefined && typeof record.openEnded !== "boolean") {
      return disabled("invalid_configuration_fail_closed", "open_ended_flag_invalid");
    }
    const openEnded = record.openEnded === true;
    // calendarDate() only ever returns a valid YYYY-MM-DD string or throws
    // (caught below), so effectiveLocalDate is never falsy here.
    const effectiveLocalDate = calendarDate(record.effectiveLocalDate, "effectiveLocalDate");
    // Open-ended (permanent, forward-only) operation: no end date, exactly the
    // capability normal daily-driver ingestion needs. Still no backfill -- a
    // date before effectiveLocalDate is refused exactly as the bounded case,
    // by assessHealthKitCanonicalization below.
    if (openEnded) {
      if (record.endLocalDate !== undefined && record.endLocalDate !== null) {
        return disabled("invalid_configuration_fail_closed", "open_ended_window_must_have_no_end_date");
      }
      return Object.freeze({
        enabled: true,
        domains: Object.freeze(domains),
        effectiveLocalDate,
        endLocalDate: null,
        openEnded: true,
        source: "server_owned_configuration",
        invalidReason: null,
      });
    }
    // Bounded (proving-period) window: unchanged semantics, exact end date
    // required, capped at HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS.
    const endLocalDate = calendarDate(record.endLocalDate, "endLocalDate");
    const days = Math.round((Date.parse(`${endLocalDate}T00:00:00.000Z`) - Date.parse(`${effectiveLocalDate}T00:00:00.000Z`)) / 86400000) + 1;
    if (days < 1 || days > HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS) {
      return disabled("invalid_configuration_fail_closed", "window_invalid");
    }
    return Object.freeze({
      enabled: true,
      domains: Object.freeze(domains),
      effectiveLocalDate,
      endLocalDate,
      openEnded: false,
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return disabled("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

export function assessHealthKitCanonicalization({ observation, activationPolicy } = {}) {
  const domain = canonicalizationDomain(observation?.observationType);
  if (!domain) return Object.freeze({ eligible: false, reason: "not_a_canonical_daily_snapshot" });
  if (observation.ingestionPurpose === HealthKitIngestionPurpose.VALIDATION_ONLY) {
    return Object.freeze({
      eligible: false,
      domain,
      permanent: true,
      reason: "validation_only_permanently_raw",
    });
  }
  const policy = resolveHealthKitCanonicalActivationPolicy(activationPolicy);
  if (!policy.enabled) {
    return Object.freeze({ eligible: false, domain, permanent: false, reason: "canonicalization_not_activated" });
  }
  const scope = {
    effectiveLocalDate: policy.effectiveLocalDate,
    endLocalDate: policy.endLocalDate,
  };
  if (!policy.domains.includes(domain)) {
    return Object.freeze({ eligible: false, domain, permanent: true, reason: "domain_not_in_activation_scope", ...scope });
  }
  const localDate = observation.occurrence.localDate;
  if (localDate < policy.effectiveLocalDate) {
    return Object.freeze({ eligible: false, domain, permanent: true, reason: "before_activation_date", ...scope });
  }
  // An open-ended (null endLocalDate) policy has no upper bound; the window
  // never closes prospectively, so nothing is ever "after" it.
  if (policy.endLocalDate !== null && localDate > policy.endLocalDate) {
    return Object.freeze({ eligible: false, domain, permanent: true, reason: "after_activation_window", ...scope });
  }
  return Object.freeze({
    eligible: true,
    domain,
    permanent: false,
    reason: "within_activation_window",
    ...scope,
  });
}

export function resolveHealthKitWorkoutActivationPolicy(record) {
  const disabled = (source, invalidReason = null) => Object.freeze({
    enabled: false,
    effectiveLocalDate: null,
    endLocalDate: null,
    source,
    invalidReason,
  });
  if (!record) return disabled("not_configured");
  // Same fail-closed, never-throws contract as the daily policy.
  try {
    if (record.status !== "enabled") return disabled("server_owned_configuration", "status_not_enabled");
    if (record.schemaVersion !== HEALTHKIT_WORKOUT_ACTIVATION_POLICY_SCHEMA_VERSION) {
      return disabled("invalid_configuration_fail_closed", "schema_version_unrecognized");
    }
    if (record.strategicEvidenceEligibility !== undefined && record.strategicEvidenceEligibility !== "quarantined") {
      return disabled("invalid_configuration_fail_closed", "strategic_eligibility_not_quarantined");
    }
    if (record.historicalBackfill !== undefined && record.historicalBackfill !== false) {
      return disabled("invalid_configuration_fail_closed", "historical_backfill_not_permitted");
    }
    // A confirmed link is always a separate, explicit act; it is never a policy option.
    if (record.linkAutoConfirm !== undefined && record.linkAutoConfirm !== false) {
      return disabled("invalid_configuration_fail_closed", "link_auto_confirm_not_permitted");
    }
    if (!Array.isArray(record.domains) || record.domains.length !== 1 || record.domains[0] !== "workout") {
      return disabled("invalid_configuration_fail_closed", "domains_invalid");
    }
    const effectiveLocalDate = calendarDate(record.effectiveLocalDate, "effectiveLocalDate");
    const endLocalDate = calendarDate(record.endLocalDate, "endLocalDate");
    const days = Math.round((Date.parse(`${endLocalDate}T00:00:00.000Z`) - Date.parse(`${effectiveLocalDate}T00:00:00.000Z`)) / 86400000) + 1;
    if (days < 1 || days > HEALTHKIT_WORKOUT_ACTIVATION_MAX_DAYS) {
      return disabled("invalid_configuration_fail_closed", "window_invalid");
    }
    return Object.freeze({
      enabled: true,
      effectiveLocalDate,
      endLocalDate,
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return disabled("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

/**
 * Whether one workout may be canonicalized. The effective local date is
 * supplied by the caller, derived from the workout's own start and time zone,
 * never from the client label or the ingestion time.
 */
export function assessHealthKitWorkoutCanonicalization({ observation, effectiveLocalDate, activationPolicy } = {}) {
  if (observation?.observationType !== HealthKitObservationType.WORKOUT) {
    return Object.freeze({ eligible: false, reason: "not_a_workout" });
  }
  if (observation.ingestionPurpose === HealthKitIngestionPurpose.VALIDATION_ONLY) {
    return Object.freeze({ eligible: false, permanent: true, reason: "validation_only_permanently_raw" });
  }
  const policy = resolveHealthKitWorkoutActivationPolicy(activationPolicy);
  if (!policy.enabled) {
    return Object.freeze({ eligible: false, permanent: false, reason: "workout_canonicalization_not_activated" });
  }
  const scope = { effectiveLocalDate: policy.effectiveLocalDate, endLocalDate: policy.endLocalDate };
  if (effectiveLocalDate < policy.effectiveLocalDate) {
    return Object.freeze({ eligible: false, permanent: true, reason: "before_activation_date", ...scope });
  }
  if (effectiveLocalDate > policy.endLocalDate) {
    return Object.freeze({ eligible: false, permanent: true, reason: "after_activation_window", ...scope });
  }
  return Object.freeze({ eligible: true, permanent: false, reason: "within_activation_window", ...scope });
}

export function isCompatibleHealthKitReplay(existing, incoming) {
  const existingPurpose = existing?.ingestionPurpose ?? HealthKitIngestionPurpose.OPERATIONAL;
  if (existingPurpose !== incoming?.ingestionPurpose) return false;
  if (existing?.semanticFingerprint === incoming?.semanticFingerprint) return true;
  return existingPurpose === HealthKitIngestionPurpose.OPERATIONAL &&
    existing?.semanticFingerprint === incoming?.legacySemanticFingerprint;
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

function normalizeObservation(value, { batchId, principalDeviceId, index }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`observations[${index}]`, "Each HealthKit observation must be an object.");
  }
  const observationType = requiredEnum(
    value.observationType,
    Object.values(HealthKitObservationType),
    `observations[${index}].observationType`
  );
  const ingestionPurpose = value.ingestionPurpose == null
    ? HealthKitIngestionPurpose.OPERATIONAL
    : requiredEnum(
      value.ingestionPurpose,
      Object.values(HealthKitIngestionPurpose),
      `observations[${index}].ingestionPurpose`
    );
  const externalId = requiredText(value.externalId, `observations[${index}].externalId`);
  const source = normalizeSource(value.source, index);
  const occurrence = normalizeOccurrence(value.occurrence, observationType, index);
  const measurement = normalizeMeasurement(value, observationType, index);
  const identityParts = [source.bundleIdentifier, observationType, externalId];
  if (canonicalizationDomain(observationType)) {
    // Daily snapshots legitimately change; device and revision are identity.
    identityParts.push(principalDeviceId, String(measurement.sourceRevision));
  } else if (observationType === HealthKitObservationType.WORKOUT && measurement.sourceRevision > 1) {
    // A workout revision is a new observation of the same source workout. A
    // first (or unstated) revision keeps the exact V1 identity.
    identityParts.push(String(measurement.sourceRevision));
  }
  // V1 compatibility boundary: this NUL separator is deliberately preserved.
  const id = `healthkit_observation_${digest(identityParts.join("\u0000"))}`;
  const legacySemantic = {
    observationType,
    externalId,
    source: compact({
      bundleIdentifier: source.bundleIdentifier,
      productType: source.productType,
      deviceModel: source.deviceModel,
      operatingSystemVersion: source.operatingSystemVersion,
    }),
    occurrence: compact({
      localDate: occurrence.localDate,
      timeZone: occurrence.timeZone,
      startedAt: occurrence.startedAt,
      endedAt: occurrence.endedAt,
    }),
    measurement,
  };
  const semantic = { observationType, externalId, source, occurrence, measurement, ingestionPurpose };
  return Object.freeze({
    id,
    observationType,
    externalId,
    source: Object.freeze(source),
    occurrence: Object.freeze(occurrence),
    measurement: Object.freeze(measurement),
    semanticFingerprint: `sha256_${digest(stable(semantic))}`,
    legacySemanticFingerprint: `sha256_${digest(stable(legacySemantic))}`,
    ingestionPurpose,
    ingestion: Object.freeze({ batchId, deliveryDeviceId: principalDeviceId }),
  });
}

function normalizeSource(source, index) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw invalid(`observations[${index}].source`, "HealthKit source provenance is required.");
  }
  return compact({
    bundleIdentifier: requiredText(source.bundleIdentifier, `observations[${index}].source.bundleIdentifier`),
    sourceName: optionalText(source.sourceName, `observations[${index}].source.sourceName`),
    sourceRevision: optionalText(source.sourceRevision, `observations[${index}].source.sourceRevision`),
    productType: optionalText(source.productType, `observations[${index}].source.productType`),
    deviceModel: optionalText(source.deviceModel, `observations[${index}].source.deviceModel`),
    operatingSystemVersion: optionalText(source.operatingSystemVersion, `observations[${index}].source.operatingSystemVersion`),
    privacySafeDeviceProvenance: optionalText(source.privacySafeDeviceProvenance, `observations[${index}].source.privacySafeDeviceProvenance`),
  });
}

function normalizeOccurrence(occurrence, observationType, index) {
  if (!occurrence || typeof occurrence !== "object" || Array.isArray(occurrence)) {
    throw invalid(`observations[${index}].occurrence`, "HealthKit occurrence timing is required.");
  }
  const localDate = calendarDate(occurrence.localDate, `observations[${index}].occurrence.localDate`);
  const timeZone = validTimeZone(occurrence.timeZone, `observations[${index}].occurrence.timeZone`);
  const startedAt = occurrence.startedAt == null ? null : boundedIsoDateTime(occurrence.startedAt, `observations[${index}].occurrence.startedAt`);
  const endedAt = occurrence.endedAt == null ? null : boundedIsoDateTime(occurrence.endedAt, `observations[${index}].occurrence.endedAt`);
  if (!canonicalizationDomain(observationType) && !startedAt) {
    throw invalid(`observations[${index}].occurrence.startedAt`, "Workout and sample occurrence time is required.");
  }
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
    throw invalid(`observations[${index}].occurrence.endedAt`, "Occurrence end must not precede its start.");
  }
  const utcOffsetSeconds = occurrence.utcOffsetSeconds == null
    ? null
    : boundedInteger(occurrence.utcOffsetSeconds, -86400, 86400, `observations[${index}].occurrence.utcOffsetSeconds`);
  return compact({ localDate, timeZone, utcOffsetSeconds, startedAt, endedAt });
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
    const dailyActivity = numericObject(summary.dailyActivity, `observations[${index}].activitySummary.dailyActivity`, { maximumEntries: HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS });
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
  if (observationType === HealthKitObservationType.NUTRITION_DAILY_TOTAL) {
    const summary = value.nutritionDailyTotal;
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      throw invalid(`observations[${index}].nutritionDailyTotal`, "Nutrition daily totals are required.");
    }
    if (summary.aggregationScope !== HEALTHKIT_NUTRITION_DAILY_TOTAL_SCOPE) {
      throw invalid(
        `observations[${index}].nutritionDailyTotal.aggregationScope`,
        "Nutrition daily totals must be HealthKit daily statistics across all sources."
      );
    }
    const sourceRevision = positiveInteger(summary.sourceRevision, `observations[${index}].nutritionDailyTotal.sourceRevision`);
    const dailyNutrition = nutritionTotals(summary.dailyNutrition, `observations[${index}].nutritionDailyTotal.dailyNutrition`);
    return {
      aggregationScope: summary.aggregationScope,
      coverage: requiredEnum(summary.coverage, ["partial_day", "complete_day"], `observations[${index}].nutritionDailyTotal.coverage`),
      sourceRevision,
      dailyNutrition,
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
      distanceUnit: optionalText(workout.distanceUnit, `observations[${index}].workout.distanceUnit`),
      averageHeartRate: optionalFinite(workout.averageHeartRate, `observations[${index}].workout.averageHeartRate`),
      // A first revision is the same observation whether stated or not.
      sourceRevision: workout.sourceRevision == null
        ? null
        : (positiveInteger(workout.sourceRevision, `observations[${index}].workout.sourceRevision`) > 1
          ? positiveInteger(workout.sourceRevision, `observations[${index}].workout.sourceRevision`)
          : null),
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
    workoutExternalId: optionalText(sample.workoutExternalId, `observations[${index}].quantitySample.workoutExternalId`),
  };
}

export function createCanonicalWorkoutCandidate(observation) {
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

export function isActiveDetailedStrengthSession(record) {
  const payload = record?.payload ?? record;
  return payload?.evidence_type === "training" &&
    record?.quality?.status !== "superseded" &&
    payload?.quality?.status !== "superseded" &&
    isStrengthWorkout(payload?.metadata?.activity_type) &&
    Array.isArray(payload?.exercises) && payload.exercises.length > 0;
}

// Native sends HKWorkoutActivityType as its numeric raw value (for example "50"),
// so the numeric form must classify exactly like the display name.
export function isStrengthWorkout(value) {
  const text = String(value ?? "").trim();
  if (text === "50" || text === "20") return true;
  return /strength|resistance|weight training|functional strength|traditional strength/i.test(text);
}

function canonicalizationDomain(observationType) {
  if (observationType === HealthKitObservationType.ACTIVITY_SUMMARY) return HealthKitCanonicalizationDomain.ACTIVITY;
  if (observationType === HealthKitObservationType.NUTRITION_DAILY_TOTAL) return HealthKitCanonicalizationDomain.NUTRITION;
  return null;
}

// Nutrition daily totals are exactly calories, protein, carbohydrates, fat.
// An unlisted field is a contract violation, not something to drop silently.
function nutritionTotals(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(field, `${field} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > HEALTHKIT_NUTRITION_MAX_FIELDS) {
    throw invalid(field, `${field} accepts only ${NUTRITION_FIELDS.join(", ")}.`);
  }
  const totals = {};
  for (const [key, item] of entries) {
    if (!NUTRITION_FIELDS.includes(key)) throw invalid(field, `${field} accepts only ${NUTRITION_FIELDS.join(", ")}.`);
    totals[key] = requiredFinite(item, `${field}.${key}`);
  }
  if (totals.calories === undefined) throw invalid(`${field}.calories`, "HealthKit daily dietary energy is required.");
  return totals;
}

function numericObject(value, field, { maximumEntries, nested = false }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(field, `${field} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length > maximumEntries) {
    throw invalid(field, `${field} accepts at most ${maximumEntries} metrics.`);
  }
  return Object.fromEntries(entries.map(([key, item]) => {
    if (key.length > HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH) {
      throw invalid(field, `${field} metric names must be at most ${HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH} characters.`);
    }
    // ring_completion is the one nested metric group; it cannot nest further,
    // so a nested object falls through to the numeric check and is rejected.
    if (key === "ring_completion" && !nested) {
      return [key, numericObject(item, `${field}.${key}`, {
        maximumEntries: HEALTHKIT_MAX_RING_COMPLETION_METRICS,
        nested: true,
      })];
    }
    return [key, requiredFinite(item, `${field}.${key}`)];
  }));
}

// A numeric field may arrive as a JSON number or a numeric string. Bound the
// string form so its encoded size is derivable; a JSON number's canonical
// encoding is already at most 24 bytes.
function numericInput(value, field) {
  if (typeof value === "string" && value.length > HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH) {
    throw invalid(field, `${field} must be a bounded number.`);
  }
  return value;
}

function requiredFinite(value, field) {
  const number = finite(numericInput(value, field));
  if (number == null || number < 0) throw invalid(field, `${field} must be a non-negative finite number.`);
  return number;
}
function optionalFinite(value, field) { return value == null ? null : requiredFinite(value, field); }
function positiveInteger(value, field) {
  const number = Number(numericInput(value, field));
  if (!Number.isSafeInteger(number) || number < 1) throw invalid(field, `${field} must be a positive integer.`);
  return number;
}
function boundedInteger(value, minimum, maximum, field) {
  const number = Number(numericInput(value, field));
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw invalid(field, `${field} must be an integer from ${minimum} through ${maximum}.`);
  }
  return number;
}
function requiredText(value, field) {
  const raw = String(value ?? "");
  // Bound the raw length: surrounding whitespace is trimmed but still travels
  // in the request, so it must count toward the derivable request maximum.
  if (raw.length > HEALTHKIT_MAX_TEXT_LENGTH) throw invalid(field, `${field} must be a non-empty bounded string.`);
  const text = raw.trim();
  if (!text) throw invalid(field, `${field} must be a non-empty bounded string.`);
  return text;
}
function optionalText(value, field) {
  const raw = String(value ?? "");
  if (raw.length > HEALTHKIT_MAX_TEXT_LENGTH) throw invalid(field, `${field} must be a bounded string.`);
  return raw.trim() || null;
}
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
// Observation timestamps travel in the request body, so their raw length is
// bounded. The server receipt time (metadata.clientOccurredAt) keeps the
// original unbounded check: it is not observation payload.
function boundedIsoDateTime(value, field) {
  if (String(value ?? "").length > HEALTHKIT_MAX_TIMESTAMP_LENGTH) {
    throw invalid(field, `${field} must be an ISO date-time.`);
  }
  return isoDateTime(value, field);
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
