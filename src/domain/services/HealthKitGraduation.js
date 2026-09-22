import { createCanonicalActivityDayRecord } from "./CanonicalActivityDayService.js";
import { resolveNutritionDayAuthority } from "../models/nutritionDayAuthority.js";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayReadModel.js";
import { selectActiveCanonicalNutritionDays } from "./CanonicalNutritionDayService.js";
import { assessHealthKitCoexistence, HealthKitCanonicalDomain } from "./HealthKitCanonicalDayService.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "./HealthKitEvidenceEligibilityPolicy.js";

// Graduation of accepted HealthKit Activity and Nutrition canonical days into
// ordinary PhysiqueOS data.
//
//   HealthKit canonical day (healthKitCanonicalDays, unchanged, quarantined)
//     -> READ-TIME projection into the ordinary activity_day / nutrition shape
//     -> the existing selectors, presentation, Energy pairing and V3 adapters
//
// There is deliberately no HealthKit-specific strategic category and nothing
// here writes the strategic Evidence collection: the projected object exists
// only in the array a reader is about to consume, so turning a switch OFF
// stops future use immediately and deletes nothing. Stored canonical history,
// published briefings and Training/Workout records are never touched.
//
// Two independent Server-owned switches (one policy record, two scopes):
//   projection          what the normal Log / detail / history / Evidence Hub
//                       read models may show (a partial "so far" day included);
//   evidenceEligibility what V3 / Energy / briefings may consume as ordinary
//                       evidence (a complete day only). It does not require
//                       projection, and projection never implies it.
// Both are exact-domain, exact-start-date scopes with an optional end date, are
// fail-closed (any malformed value disables everything and never throws), and
// have no writer other than the reviewed policy operation.

export const HEALTHKIT_GRADUATION_POLICY_RECORD_ID = "healthkit_canonical_graduation_policy";
export const HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION = "healthkit-canonical-graduation-policy-v1";
export const HEALTHKIT_GRADUATION_PROJECTION_VERSION = "healthkit-graduation-projection-v1";
export const HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION = "healthKitConfiguration";
export { HEALTHKIT_CANONICAL_DAY_COLLECTION };

export const HealthKitGraduationPurpose = Object.freeze({
  PROJECTION: "projection",
  EVIDENCE: "evidence",
});

const SUPPORTED_DOMAINS = Object.freeze(["activity", "nutrition"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const HEALTHKIT_SOURCE = Object.freeze({ application: "Apple Health", integration: "HealthKit", modality: "direct" });

const disabledScope = Object.freeze({
  enabled: false, domains: Object.freeze([]), startLocalDate: null, endLocalDate: null,
});

/**
 * Fail-closed and never throwing. Any structural problem disables BOTH scopes.
 * `historicalBriefingRegeneration` is not a parameter: a record that names it
 * anything other than false is invalid.
 */
export function resolveHealthKitGraduationPolicy(record) {
  const off = (source, invalidReason = null) => Object.freeze({
    valid: invalidReason === null,
    source,
    invalidReason,
    projection: disabledScope,
    evidenceEligibility: disabledScope,
  });
  if (!record) return off("not_configured");
  try {
    if (record.schemaVersion !== HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION) return off("invalid_configuration_fail_closed", "schema_version_unrecognized");
    if (record.historicalBriefingRegeneration !== undefined && record.historicalBriefingRegeneration !== false) {
      return off("invalid_configuration_fail_closed", "historical_briefing_regeneration_not_permitted");
    }
    const projection = resolveScope(record.projection);
    const evidenceEligibility = resolveScope(record.evidenceEligibility);
    if (projection === null || evidenceEligibility === null) return off("invalid_configuration_fail_closed", "scope_invalid");
    return Object.freeze({ valid: true, source: "server_owned_configuration", invalidReason: null, projection, evidenceEligibility });
  } catch {
    return off("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

function resolveScope(raw) {
  if (raw === undefined || raw === null) return disabledScope;
  if (typeof raw !== "object" || typeof raw.enabled !== "boolean") return null;
  if (!raw.enabled) return disabledScope;
  const domains = Array.isArray(raw.domains) ? [...new Set(raw.domains)].sort() : [];
  if (domains.length === 0 || domains.some((domain) => !SUPPORTED_DOMAINS.includes(domain))) return null;
  if (!DATE.test(String(raw.startLocalDate ?? "")) || Number.isNaN(Date.parse(`${raw.startLocalDate}T00:00:00.000Z`))) return null;
  const end = raw.endLocalDate ?? null;
  if (end !== null && (!DATE.test(String(end)) || String(end) < raw.startLocalDate)) return null;
  return Object.freeze({ enabled: true, domains: Object.freeze(domains), startLocalDate: raw.startLocalDate, endLocalDate: end });
}

export function isHealthKitGraduationInScope(scope, { domain, localDate } = {}) {
  if (!scope?.enabled) return false;
  if (!scope.domains.includes(domain)) return false;
  if (!DATE.test(String(localDate ?? ""))) return false;
  if (localDate < scope.startLocalDate) return false;
  return scope.endLocalDate === null || localDate <= scope.endLocalDate;
}

/**
 * The single decision for one canonical day and purpose. Strategic use also
 * requires a complete day: a partial "so far" day may be shown but never feeds
 * V3, Energy, Confidence or a briefing.
 */
export function assessHealthKitGraduation({ policy, day, purpose } = {}) {
  const resolved = policy?.projection ? policy : resolveHealthKitGraduationPolicy(policy);
  const scope = purpose === HealthKitGraduationPurpose.EVIDENCE ? resolved.evidenceEligibility : resolved.projection;
  const inScope = isHealthKitGraduationInScope(scope, { domain: day?.domain, localDate: day?.localDate });
  if (!inScope) return Object.freeze({ graduated: false, reason: "not_in_graduation_scope" });
  if (purpose === HealthKitGraduationPurpose.EVIDENCE && day?.current?.coverage !== "complete_day") {
    return Object.freeze({ graduated: false, reason: "strategic_use_requires_complete_day" });
  }
  return Object.freeze({ graduated: true, reason: "in_graduation_scope" });
}

/** Ordinary activity_day / nutrition canonical evidence object for a canonical HealthKit day. */
export function projectHealthKitCanonicalDay(day, { purpose = HealthKitGraduationPurpose.PROJECTION } = {}) {
  return day.domain === HealthKitCanonicalDomain.ACTIVITY
    ? projectActivity(day, purpose)
    : projectNutrition(day, purpose);
}

function projectActivity(day, purpose) {
  const values = day.current.values.dailyActivity ?? {};
  const complete = day.current.coverage === "complete_day";
  const dailyActivity = {};
  for (const key of ["move_calories", "exercise_minutes", "stand_hours"]) {
    if (isFinite(values[key])) dailyActivity[key] = Number(values[key]);
  }
  // Steps, distance and flights are retained for provenance only: no ordinary
  // Activity reader consumes them, so they never change what V3 sees.
  const supplemental = {};
  for (const key of ["steps", "walking_running_distance", "flights_climbed"]) {
    if (isFinite(values[key])) supplemental[key] = Number(values[key]);
  }
  const payload = {
    id: day.id,
    evidence_type: "activity_day",
    observed_at: day.localDate,
    source: { ...HEALTHKIT_SOURCE },
    daily_activity: dailyActivity,
    derived_metrics: {},
    metadata: {
      coverage: day.current.coverage,
      source_device_id: day.current.deliveryDeviceId ?? null,
      source_revision: day.current.sourceRevision ?? null,
      source_basis: day.current.basis,
      // Workout energy is inside the daily active-energy total; never additive.
      workout_active_calories_additive: false,
      ...(Object.keys(supplemental).length ? { healthkit_supplemental: supplemental } : {}),
    },
    quality: { status: complete ? "complete" : "partial" },
    provenance: provenanceOf(day),
    evidenceEligibility: eligibilityOf(purpose),
  };
  return Object.freeze({
    canonicalId: `activity_day|${day.localDate}`,
    evidence_type: "activity_day",
    createdAt: day.createdAt,
    updatedAt: day.updatedAt,
    firstObservedAt: day.localDate,
    lastObservedAt: day.localDate,
    activityRevision: {
      logicalDayKey: `activity_day|${day.localDate}`,
      revision: Number(day.revision ?? 1),
      semanticFingerprint: day.semanticFingerprint,
      sourceClass: "health_provider",
      sourceAuthorityRank: 4,
    },
    activityRevisionHistory: [],
    payload,
    provenance: provenanceOf(day),
    quality: { status: "active" },
    userId: day.userId,
    healthKitProjection: projectionMarker(day, purpose),
  });
}

function projectNutrition(day, purpose) {
  const values = day.current.values;
  const complete = day.current.coverage === "complete_day";
  const totals = Object.fromEntries(Object.entries(values.dailyTotals ?? {}).filter(([, value]) => isFinite(value)).map(([key, value]) => [key, Number(value)]));
  const payload = {
    id: day.id,
    evidence_type: "nutrition",
    observed_at: day.localDate,
    source: { ...HEALTHKIT_SOURCE },
    daily_totals: totals,
    // A device daily aggregate is a complete assertion with no meal objects.
    // No meal is ever fabricated.
    meals: [],
    metadata: {
      date: day.localDate,
      daily_totals_scope: values.dailyTotalsScope,
      completeness: complete ? "complete" : "partial",
      meal_count: 0,
      coverage: day.current.coverage,
      source_device_id: day.current.deliveryDeviceId ?? null,
      source_revision: day.current.sourceRevision ?? null,
      source_basis: day.current.basis,
    },
    quality: { status: complete ? "complete" : "partial" },
    provenance: provenanceOf(day),
    evidenceEligibility: eligibilityOf(purpose),
  };
  return Object.freeze({
    canonicalId: `nutrition|${day.localDate}|nutrition-day`,
    evidence_type: "nutrition",
    createdAt: day.createdAt,
    updatedAt: day.updatedAt,
    firstObservedAt: day.localDate,
    lastObservedAt: day.localDate,
    payload,
    provenance: provenanceOf(day),
    quality: { status: "active" },
    userId: day.userId,
    healthKitProjection: projectionMarker(day, purpose),
  });
}

/**
 * Overlay graduated HealthKit days onto the ordinary canonical evidence array a
 * reader is about to consume. Pure and non-mutating. The result contains at
 * most ONE active representation per domain and date:
 *
 *   projected_alone      no ordinary day exists for the date
 *   merged_into_existing a complete HealthKit day is the same underlying
 *                        measurement as an ordinary one; the ordinary
 *                        precedence decides (Activity: source authority, then
 *                        coverage; Nutrition: assertion tier and origin), the
 *                        other source is retained as provenance, nothing stacks
 *   existing_kept        a partial HealthKit day never outranks an ordinary
 *                        day, or the ordinary source is the stronger assertion
 *
 * Precedence is semantic, never last-write-wins, and the observed local date
 * owns the day, never the ingestion time.
 */
export function overlayGraduatedHealthKitDays({
  canonicalObjects = [],
  healthKitDays = [],
  policy = null,
  purpose = HealthKitGraduationPurpose.PROJECTION,
} = {}) {
  const resolved = policy?.projection ? policy : resolveHealthKitGraduationPolicy(policy);
  const scope = purpose === HealthKitGraduationPurpose.EVIDENCE ? resolved.evidenceEligibility : resolved.projection;
  if (!scope.enabled || healthKitDays.length === 0) {
    return Object.freeze({ objects: canonicalObjects, applied: Object.freeze([]) });
  }
  const applied = [];
  let objects = canonicalObjects;
  const ordered = [...healthKitDays].sort((left, right) =>
    `${left.localDate}|${left.domain}`.localeCompare(`${right.localDate}|${right.domain}`));
  for (const day of ordered) {
    if (!assessHealthKitGraduation({ policy: resolved, day, purpose }).graduated) continue;
    const step = day.domain === HealthKitCanonicalDomain.ACTIVITY
      ? graduateActivityDay({ objects, day, purpose })
      : graduateNutritionDay({ objects, day, purpose });
    objects = step.objects;
    applied.push(Object.freeze({ domain: day.domain, localDate: day.localDate, mode: step.mode, coexistence: step.coexistence ?? null }));
  }
  return Object.freeze({ objects, applied: Object.freeze(applied) });
}

function graduateActivityDay({ objects, day, purpose }) {
  const existing = selectActiveCanonicalActivityDays(objects, { date: day.localDate }).records[0] ?? null;
  const projected = projectHealthKitCanonicalDay(day, { purpose });
  if (!existing) return { objects: [...objects, projected], mode: "projected_alone" };
  const coexistence = assessHealthKitCoexistence({ domain: day.domain, localDate: day.localDate, healthKitDay: day, canonicalObjects: objects });
  // A partial "so far" HealthKit snapshot never outranks an ordinary day.
  if (day.current.coverage !== "complete_day") return { objects, mode: "existing_kept", coexistence };
  const merged = createCanonicalActivityDayRecord({
    canonicalId: existing.canonicalId,
    canonicalProvenance: existing.provenance,
    evidenceObject: { ...projected.payload, id: existing.payload?.id ?? projected.payload.id },
    existingObject: existing,
    now: existing.updatedAt ?? projected.updatedAt,
    userId: existing.userId ?? projected.userId,
  });
  const mergedObject = Object.freeze({
    ...merged,
    payload: {
      ...merged.payload,
      metadata: {
        ...(merged.payload.metadata ?? {}),
        healthkit_reconciliation: { state: coexistence.state, conflictingFields: coexistence.conflictingFields ?? [] },
      },
    },
    healthKitProjection: projectionMarker(day, purpose, "merged_into_existing"),
  });
  return { objects: objects.map((object) => (object === existing ? mergedObject : object)), mode: "merged_into_existing", coexistence };
}

function graduateNutritionDay({ objects, day, purpose }) {
  const existing = selectActiveCanonicalNutritionDays(objects, { date: day.localDate }).records[0] ?? null;
  const projected = projectHealthKitCanonicalDay(day, { purpose });
  if (!existing) return { objects: [...objects, projected], mode: "projected_alone" };
  const coexistence = assessHealthKitCoexistence({ domain: day.domain, localDate: day.localDate, healthKitDay: day, canonicalObjects: objects });
  if (day.current.coverage !== "complete_day") return { objects, mode: "existing_kept", coexistence };
  const other = resolveNutritionDayAuthority(existing);
  const incoming = resolveNutritionDayAuthority(projected);
  // An existing full-day assertion keeps the day when it is the same
  // precedence class (another device aggregate: the incumbent stays and the
  // newcomer is provenance) or a Founder-typed total (an explicit statement is
  // never overridden by a device). Anything weaker (meal-derived, partial, an
  // OCR summary) is superseded by the device's full-day total.
  if (other.assertion.tier === "full_day_asserted" &&
    (other.assertion.origin === incoming.assertion.origin || other.assertion.origin === "manual_entry")) {
    return { objects, mode: "existing_kept", coexistence };
  }
  const existingPayload = existing.payload ?? existing;
  const mergedPayload = {
    ...existingPayload,
    daily_totals: { ...projected.payload.daily_totals },
    source: { ...HEALTHKIT_SOURCE },
    metadata: {
      ...(existingPayload.metadata ?? {}),
      daily_totals_scope: projected.payload.metadata.daily_totals_scope,
      completeness: "complete",
      daily_totals_reconciliation: {
        daily_totals_scope: projected.payload.metadata.daily_totals_scope,
        source_daily_totals: { ...projected.payload.daily_totals },
        competing_source: {
          application: existingPayload.source?.application ?? null,
          modality: existingPayload.source?.modality ?? null,
          totals: { ...(existingPayload.daily_totals ?? {}) },
        },
      },
      meal_detail_source: {
        application: existingPayload.source?.application ?? null,
        modality: existingPayload.source?.modality ?? null,
      },
      healthkit_reconciliation: { state: coexistence.state, conflictingFields: coexistence.conflictingFields ?? [] },
    },
    quality: { ...(existingPayload.quality ?? {}), status: "complete" },
    provenance: { ...(existingPayload.provenance ?? {}), ...provenanceOf(day),
      source_artifact_refs: existingPayload.provenance?.source_artifact_refs ?? [] },
    evidenceEligibility: eligibilityOf(purpose),
  };
  const mergedObject = Object.freeze({
    ...existing,
    payload: mergedPayload,
    healthKitProjection: projectionMarker(day, purpose, "merged_into_existing"),
  });
  return { objects: objects.map((object) => (object === existing ? mergedObject : object)), mode: "merged_into_existing", coexistence };
}

function eligibilityOf(purpose) {
  return purpose === HealthKitGraduationPurpose.EVIDENCE
    ? { state: "eligible", strategic: true, decidedBy: HEALTHKIT_GRADUATION_PROJECTION_VERSION }
    : { state: "quarantined", strategic: false, decidedBy: HEALTHKIT_GRADUATION_PROJECTION_VERSION };
}

function provenanceOf(day) {
  return {
    source_observation_ids: [...(day.provenance?.sourceObservationIds ?? [])],
    source_artifact_refs: [],
    healthkit_canonical_day_id: day.id,
    healthkit_canonical_day_revision: Number(day.revision ?? 1),
    application: "Apple Health",
    integration: "HealthKit",
    modality: "direct",
  };
}

function projectionMarker(day, purpose, mode = "projected_alone") {
  return Object.freeze({
    version: HEALTHKIT_GRADUATION_PROJECTION_VERSION,
    purpose,
    mode,
    healthKitCanonicalDayId: day.id,
    revision: Number(day.revision ?? 1),
    coverage: day.current.coverage,
    readOnly: true,
  });
}

/** A projected object must never be persisted: the marker exists so a write guard can refuse it. */
export function isHealthKitGraduationProjection(record) {
  return record?.healthKitProjection?.readOnly === true;
}

function isFinite(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}
