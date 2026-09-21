import { createHash } from "node:crypto";
import {
  NUTRITION_RECONCILIATION_TOLERANCE,
  NutritionDailyTotalsScope,
} from "../models/nutritionDayEvidence.js";
import { resolveNutritionDayAuthority } from "../models/nutritionDayAuthority.js";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayReadModel.js";
import { selectActiveCanonicalNutritionDays } from "./CanonicalNutritionDayService.js";
import {
  createHealthKitQuarantinedEligibility,
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
} from "./HealthKitEvidenceEligibilityPolicy.js";

// Canonical HealthKit Activity and Nutrition days.
//
// One record per Founder-local date and domain, stored in the application-only
// `healthKitCanonicalDays` collection. This is the canonical PhysiqueOS record
// layer of
//   source observation -> canonical day -> (separate) Evidence eligibility.
// Nothing here writes, merges into, or reads strategic Evidence for meaning:
// the Evidence collections are only read to *assess coexistence* (never to
// overwrite either side).

export const HEALTHKIT_CANONICAL_DAY_SCHEMA_VERSION = "healthkit-canonical-day-v1";
export { HEALTHKIT_CANONICAL_DAY_COLLECTION };

export const HealthKitCanonicalDomain = Object.freeze({
  ACTIVITY: "activity",
  NUTRITION: "nutrition",
});

// Approved HealthKit daily Activity contract (Native activity summary +
// supplemental statistics). Anything else is retained in the raw source
// observation and reported, never silently canonicalized.
export const HEALTHKIT_CANONICAL_ACTIVITY_METRICS = Object.freeze([
  "move_calories",
  "exercise_minutes",
  "stand_hours",
  "steps",
  "walking_running_distance",
  "flights_climbed",
]);

// Nutrition daily totals only: calories, protein, carbohydrates, fat.
export const HEALTHKIT_CANONICAL_NUTRITION_FIELDS = Object.freeze([
  "calories", "protein_g", "carbs_g", "fat_g",
]);

// Coexistence tolerances. Nutrition reuses the established reconciliation
// tolerance. Activity has no established tolerance; a Fitness screenshot and
// HealthKit are the same Apple quantity, so only rounding-level differences
// agree.
export const HEALTHKIT_ACTIVITY_COEXISTENCE_TOLERANCE = Object.freeze({
  move_calories: 1,
  exercise_minutes: 1,
  stand_hours: 0,
});

export const HealthKitCoexistenceState = Object.freeze({
  NO_OTHER_SOURCE: "no_other_source",
  CONSISTENT: "consistent",
  CONFLICT_SURFACED: "conflict_surfaced",
  OTHER_SOURCE_NOT_COMPARABLE: "other_source_not_comparable",
});

export function getHealthKitCanonicalDayRecordId(domain, localDate) {
  return `healthkit_canonical_day_${domain}_${localDate}`;
}

// Same logical key shapes the Evidence store uses, so a later, separately
// authorized promotion maps one-to-one and never guesses a day identity.
export function getHealthKitCanonicalDayLogicalKey(domain, localDate) {
  return domain === HealthKitCanonicalDomain.ACTIVITY
    ? `activity_day|${localDate}`
    : `nutrition|${localDate}`;
}

export function compareHealthKitDailySnapshotPrecedence(current, incoming) {
  const coverage = coverageRank(incoming.coverage) - coverageRank(current.coverage);
  if (coverage !== 0) return coverage;
  if (current.deliveryDeviceId && current.deliveryDeviceId === incoming.deliveryDeviceId) {
    return Number(incoming.sourceRevision ?? 0) - Number(current.sourceRevision ?? 0);
  }
  // Equal coverage from a different delivery device cannot be ordered by a
  // device-scoped revision. Deterministic rule: the existing canonical day is
  // kept and the newcomer stays raw (never a silent overwrite).
  return 0;
}

/**
 * Reconcile one HealthKit daily-snapshot observation into the canonical day.
 * Pure: returns the action and the record to persist; the caller persists it.
 *
 *   create        no canonical day exists for this date and domain
 *   update        the snapshot outranks the current one (coverage, then revision)
 *   replay        this exact source observation is already the/an applied source
 *   superseded    a higher-precedence snapshot is already canonical
 */
export function reconcileHealthKitCanonicalDay({
  observation,
  existing = null,
  ownerUserId,
  now,
  activation = null,
  canonicalEvidenceObjects = [],
} = {}) {
  const domain = domainOf(observation);
  if (!domain) throw new TypeError("Only HealthKit daily snapshot observations can canonicalize.");
  const localDate = observation.occurrence.localDate;
  const incoming = snapshotOf(observation, domain);
  const at = new Date(now).toISOString();

  const coexistenceFor = (snapshot) => assessHealthKitCoexistence({
    domain,
    localDate,
    healthKitDay: { current: snapshot },
    canonicalEvidenceObjects,
    at,
  });

  if (!existing) {
    return Object.freeze({
      action: "create",
      reason: "first_canonical_snapshot_for_day",
      record: buildRecord({
        domain, localDate, ownerUserId, at, activation, coexistence: coexistenceFor(incoming),
        current: incoming, revision: 1, priorFingerprint: null, history: [],
        sourceObservationIds: [observation.id], createdAt: at,
      }),
    });
  }
  if ((existing.provenance?.sourceObservationIds ?? []).includes(observation.id)) {
    return Object.freeze({ action: "replay", reason: "source_observation_already_applied", record: existing });
  }
  const current = existing.current;
  const order = compareHealthKitDailySnapshotPrecedence(current, incoming);
  if (order < 0 || (order === 0 && !sameDevice(current, incoming))) {
    return Object.freeze({
      action: "superseded",
      reason: coverageRank(current.coverage) > coverageRank(incoming.coverage)
        ? "complete_day_summary_already_received"
        : order === 0
          ? "cross_device_equal_coverage_kept_existing"
          : "newer_device_revision_already_received",
      record: existing,
    });
  }
  if (order === 0) {
    // Same device, same coverage, same revision, different observation id:
    // cannot happen for an immutable identity; keep the existing day.
    return Object.freeze({ action: "replay", reason: "equal_precedence_kept_existing", record: existing });
  }
  const priorFingerprint = existing.semanticFingerprint;
  const nextFingerprint = fingerprintOf(domain, localDate, incoming);
  const semanticChanged = nextFingerprint !== priorFingerprint;
  const history = semanticChanged
    ? [...(existing.revisionHistory ?? []), historyEntry(existing)]
    : [...(existing.revisionHistory ?? [])];
  return Object.freeze({
    action: "update",
    reason: coverageRank(incoming.coverage) > coverageRank(current.coverage)
      ? "higher_coverage_snapshot"
      : "newer_device_revision",
    record: buildRecord({
      domain, localDate, ownerUserId, at, activation, coexistence: coexistenceFor(incoming),
      current: incoming,
      revision: semanticChanged ? Number(existing.revision ?? 1) + 1 : Number(existing.revision ?? 1),
      priorFingerprint: semanticChanged ? priorFingerprint : existing.priorSemanticFingerprint ?? null,
      history,
      sourceObservationIds: [...(existing.provenance?.sourceObservationIds ?? []), observation.id],
      createdAt: existing.createdAt ?? at,
      version: existing.version,
    }),
  });
}

/**
 * Coexistence between a HealthKit canonical day and the strategic Evidence
 * store's Activity/Nutrition day for the same date. Read-only and
 * deterministic. It records agreement or a surfaced conflict; it never picks a
 * winner, rewrites either side, or feeds anything strategic.
 */
export function assessHealthKitCoexistence({
  domain,
  localDate,
  healthKitDay,
  canonicalEvidenceObjects = [],
  at = null,
} = {}) {
  const basis = Object.freeze({
    provingPeriodAuthority: "evidence_store_remains_strategic_authority",
    resolutionApplied: "none",
    ...(at ? { assessedAt: new Date(at).toISOString() } : {}),
  });
  const selection = domain === HealthKitCanonicalDomain.ACTIVITY
    ? selectActiveCanonicalActivityDays(canonicalEvidenceObjects, { date: localDate })
    : selectActiveCanonicalNutritionDays(canonicalEvidenceObjects, { date: localDate });
  const other = selection.records[0] ?? null;
  if (!other) {
    return Object.freeze({ state: HealthKitCoexistenceState.NO_OTHER_SOURCE, ...basis });
  }
  const otherDescriptor = describeOtherSource(other);
  const fields = domain === HealthKitCanonicalDomain.ACTIVITY
    ? compareActivity(healthKitDay.current.values.dailyActivity, other)
    : compareNutrition(healthKitDay.current, other);
  if (!fields || fields.length === 0) {
    return Object.freeze({
      state: HealthKitCoexistenceState.OTHER_SOURCE_NOT_COMPARABLE,
      otherSource: otherDescriptor,
      duplicateEvidenceDays: selection.diagnostics.length > 0,
      ...basis,
    });
  }
  const conflicting = fields.filter((field) => !field.withinTolerance).map((field) => field.field);
  return Object.freeze({
    state: conflicting.length > 0
      ? HealthKitCoexistenceState.CONFLICT_SURFACED
      : HealthKitCoexistenceState.CONSISTENT,
    otherSource: otherDescriptor,
    fields: Object.freeze(fields),
    conflictingFields: Object.freeze(conflicting),
    // A partial HealthKit snapshot legitimately trails a complete source.
    healthKitCoverage: healthKitDay.current.coverage,
    duplicateEvidenceDays: selection.diagnostics.length > 0,
    ...basis,
  });
}

export function createHealthKitCanonicalDayProjection(record) {
  return Object.freeze({
    id: record.id,
    domain: record.domain,
    localDate: record.localDate,
    revision: record.revision,
    coverage: record.current.coverage,
    sourceRevision: record.current.sourceRevision,
    values: record.current.values,
    provenance: record.provenance,
    evidenceEligibility: record.evidenceEligibility,
    coexistence: record.coexistence,
  });
}

function buildRecord({
  domain, localDate, ownerUserId, at, activation, coexistence, current, revision,
  priorFingerprint, history, sourceObservationIds, createdAt, version = undefined,
}) {
  const semanticFingerprint = fingerprintOf(domain, localDate, current);
  return Object.freeze({
    schemaVersion: HEALTHKIT_CANONICAL_DAY_SCHEMA_VERSION,
    id: getHealthKitCanonicalDayRecordId(domain, localDate),
    ...(version == null ? {} : { version }),
    userId: ownerUserId,
    domain,
    localDate,
    timeZone: current.timeZone,
    logicalDayKey: getHealthKitCanonicalDayLogicalKey(domain, localDate),
    revision,
    semanticFingerprint,
    priorSemanticFingerprint: priorFingerprint,
    current,
    revisionHistory: history,
    provenance: {
      sourceObservationIds,
      currentSourceObservationId: current.sourceObservationId,
      application: "Apple Health",
      integration: "HealthKit",
      modality: "direct",
      bundleIdentifier: current.bundleIdentifier,
      basis: current.basis,
      deliveryDeviceId: current.deliveryDeviceId,
    },
    // Separate, fail-closed strategic gate. See HealthKitEvidenceEligibilityPolicy.
    evidenceEligibility: createHealthKitQuarantinedEligibility(),
    activation: activation ? structuredClone(activation) : null,
    coexistence: coexistence ? structuredClone(coexistence) : null,
    createdAt,
    updatedAt: at,
  });
}

function snapshotOf(observation, domain) {
  const measurement = observation.measurement;
  const base = {
    sourceObservationId: observation.id,
    coverage: measurement.coverage,
    sourceRevision: measurement.sourceRevision,
    deliveryDeviceId: observation.ingestion.deliveryDeviceId,
    bundleIdentifier: observation.source.bundleIdentifier,
    timeZone: observation.occurrence.timeZone,
    aggregationScope: measurement.aggregationScope,
  };
  if (domain === HealthKitCanonicalDomain.ACTIVITY) {
    const dailyActivity = {};
    const unrecognizedMetricKeys = [];
    for (const [key, value] of Object.entries(measurement.dailyActivity ?? {})) {
      if (HEALTHKIT_CANONICAL_ACTIVITY_METRICS.includes(key)) dailyActivity[key] = value;
      else unrecognizedMetricKeys.push(key);
    }
    return {
      ...base,
      basis: "healthkit_activity_summary_daily_total",
      workoutActiveCaloriesAdditive: false,
      values: { dailyActivity },
      unrecognizedMetricKeys: unrecognizedMetricKeys.sort(),
    };
  }
  const dailyTotals = Object.fromEntries(HEALTHKIT_CANONICAL_NUTRITION_FIELDS.map((field) => [
    field, finite(measurement.dailyNutrition?.[field]) ? Number(measurement.dailyNutrition[field]) : null,
  ]));
  const complete = measurement.coverage === "complete_day";
  const scope = complete
    ? NutritionDailyTotalsScope.FULL_DAY_SUMMARY
    : NutritionDailyTotalsScope.PARTIAL_MEAL_SUBTOTAL;
  // Same source-neutral interpretation the rest of PhysiqueOS uses, so a
  // HealthKit daily aggregate is a daily-total assertion with no meal objects.
  const authority = resolveNutritionDayAuthority({
    observed_at: observation.occurrence.localDate,
    daily_totals: dailyTotals,
    meals: [],
    source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
    metadata: {
      date: observation.occurrence.localDate,
      daily_totals_scope: scope,
      completeness: complete ? "complete" : "partial",
    },
  });
  return {
    ...base,
    basis: "healthkit_dietary_daily_statistics",
    values: {
      dailyTotals,
      dailyTotalsScope: scope,
      assertion: {
        tier: authority.assertion.tier,
        origin: authority.assertion.origin,
        basis: authority.assertion.basis,
        reliability: authority.reliability,
        energyUsable: authority.energyUsable,
        energyCompleteness: authority.energyCompleteness,
      },
      mealObjects: 0,
    },
    unrecognizedMetricKeys: [],
  };
}

function fingerprintOf(domain, localDate, snapshot) {
  // Coverage participates: a partial snapshot becoming complete with identical
  // numbers is still a material state change for Energy pairing.
  const semantic = { domain, localDate, coverage: snapshot.coverage, values: snapshot.values };
  return `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

function historyEntry(record) {
  return {
    revision: record.revision,
    semanticFingerprint: record.semanticFingerprint,
    coverage: record.current.coverage,
    sourceRevision: record.current.sourceRevision,
    sourceObservationId: record.current.sourceObservationId,
    values: structuredClone(record.current.values),
    supersededAt: record.updatedAt ?? null,
  };
}

function compareActivity(healthKitActivity = {}, other) {
  const payload = other.payload ?? other;
  const daily = payload.daily_activity ?? {};
  return Object.entries(HEALTHKIT_ACTIVITY_COEXISTENCE_TOLERANCE)
    .filter(([field]) => finite(healthKitActivity[field]) && finite(daily[field]))
    .map(([field, tolerance]) => compareField(field, healthKitActivity[field], daily[field], tolerance));
}

function compareNutrition(current, other) {
  const authority = resolveNutritionDayAuthority(other);
  const otherTotals = authority.dailyTotals ?? {};
  const totals = current.values.dailyTotals;
  // A partial HealthKit snapshot is expected to trail a full-day source; it is
  // reported field by field but a shortfall is not by itself a conflict.
  const partial = current.coverage !== "complete_day";
  return HEALTHKIT_CANONICAL_NUTRITION_FIELDS
    .filter((field) => finite(totals[field]) && finite(otherTotals[field]))
    .map((field) => {
      const entry = compareField(field, totals[field], otherTotals[field], NUTRITION_RECONCILIATION_TOLERANCE[field] ?? 0);
      return partial && entry.delta < 0 ? { ...entry, withinTolerance: true, partialSnapshotShortfall: true } : entry;
    });
}

function compareField(field, healthKit, other, tolerance) {
  const delta = round(Number(healthKit) - Number(other));
  return {
    field,
    healthKit: Number(healthKit),
    other: Number(other),
    delta,
    tolerance,
    withinTolerance: Math.abs(delta) <= tolerance,
  };
}

function describeOtherSource(record) {
  const payload = record.payload ?? record;
  return {
    canonicalId: record.canonicalId ?? payload.id ?? null,
    application: payload.source?.application ?? null,
    modality: payload.source?.modality ?? null,
    integration: payload.source?.integration ?? null,
  };
}

function domainOf(observation) {
  if (observation?.observationType === "activity_summary") return HealthKitCanonicalDomain.ACTIVITY;
  if (observation?.observationType === "nutrition_daily_total") return HealthKitCanonicalDomain.NUTRITION;
  return null;
}

function sameDevice(left, right) {
  return Boolean(left.deliveryDeviceId) && left.deliveryDeviceId === right.deliveryDeviceId;
}

function coverageRank(value) {
  if (value === "complete_day") return 2;
  if (value === "partial_day") return 1;
  return 0;
}

function finite(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
