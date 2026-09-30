import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HealthKitSleepLifecycle,
  createHealthKitSleepSampleRecord,
  deriveHealthKitSleepDay,
  digest,
  isCalendarDateKey,
  isValidTimeZone,
  shiftDateKey,
  sleepDayWindowEndMs,
  sleepDayWindowStartMs,
} from "./HealthKitSleepContract.js";
import { canonicalizeHealthKitSleep } from "./HealthKitSleepCanonicalizer.js";
import { resolveHealthKitSleepSourcePreferencePolicy } from "./HealthKitSleepPolicies.js";

// Bounded HISTORICAL Sleep validation lane (Phase C).
//
// The Founder authorized reading at most 30 sleep days immediately before the
// prospective Sleep start day (D0) to validate Oura-first canonicalization and
// expose real data shapes for a later Evidence design task. This lane is
// STRUCTURALLY separate from ordinary Sleep ingestion:
//
//   - its own command (healthkit.sleep.historical-validation.ingest.v1),
//   - its own collection (healthKitSleepValidationSamples) and id prefix,
//   - its own Server-owned window policy (absent = OFF),
//   - no canonical day collection at all: sleep-canon-v1 runs on demand, in
//     memory, only inside the zero-write shape audit.
//
// Nothing here touches healthKitSleepSamples / healthKitSleepDays, the
// prospective activation floor, or any strategic reader. The window always
// ends at (D0 - 1) 18:00 local -- exactly the prospective activation floor --
// so historical validation and prospective ingestion can never overlap.

export const HEALTHKIT_SLEEP_VALIDATION_COMMAND = "healthkit.sleep.historical-validation.ingest.v1";
export const HEALTHKIT_SLEEP_VALIDATION_CONTRACT_VERSION = "healthkit-sleep-historical-validation-v1";
export const HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION = "healthKitSleepValidationSamples";
export const HEALTHKIT_SLEEP_VALIDATION_SAMPLE_ID_PREFIX = "healthkit_sleep_validation_sample_";
export const HEALTHKIT_SLEEP_VALIDATION_SAMPLE_SCHEMA_VERSION = "healthkit-sleep-validation-sample-v1";
export const HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID = "healthkit_sleep_historical_validation_policy";
export const HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION = "healthkit-sleep-historical-validation-policy-v1";
export const HEALTHKIT_SLEEP_VALIDATION_MAX_DAYS = 30;
export const HEALTHKIT_SLEEP_VALIDATION_PURPOSE = "historical_validation";
export const HEALTHKIT_SLEEP_VALIDATION_CONFIGURATION_COLLECTION = HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION;
const RUN_ID = /^[a-z0-9][a-z0-9-]{6,62}[a-z0-9]$/;

/**
 * Fail-closed, never throws. ABSENT = OFF. The window is exact sleep days
 * [windowStartSleepDay, windowEndSleepDay], at most 30, and must end the day
 * before the prospective D0 it is anchored to.
 */
export function resolveHealthKitSleepValidationPolicy(record) {
  const off = (source, invalidReason = null) => Object.freeze({
    enabled: false, runId: null, windowStartSleepDay: null, windowEndSleepDay: null,
    prospectiveEffectiveSleepDay: null, timeZone: null, windowStart: null, windowEnd: null,
    source, invalidReason,
  });
  if (!record) return off("not_configured");
  try {
    if (record.status !== "enabled") return off("server_owned_configuration", "status_not_enabled");
    if (record.schemaVersion !== HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION) return off("invalid_configuration_fail_closed", "schema_version_unrecognized");
    if (record.purpose !== HEALTHKIT_SLEEP_VALIDATION_PURPOSE) return off("invalid_configuration_fail_closed", "purpose_invalid");
    if (record.strategicEvidenceEligibility !== "quarantined") return off("invalid_configuration_fail_closed", "strategic_eligibility_not_quarantined");
    if (record.canonicalProductionHistory !== false) return off("invalid_configuration_fail_closed", "canonical_production_history_not_false");
    if (typeof record.runId !== "string" || !RUN_ID.test(record.runId)) return off("invalid_configuration_fail_closed", "run_id_invalid");
    if (!isValidTimeZone(record.timeZone)) return off("invalid_configuration_fail_closed", "time_zone_invalid");
    const { windowStartSleepDay: start, windowEndSleepDay: end, prospectiveEffectiveSleepDay: d0 } = record;
    if (![start, end, d0].every(isCalendarDateKey)) return off("invalid_configuration_fail_closed", "window_invalid");
    if (end !== shiftDateKey(d0, -1)) return off("invalid_configuration_fail_closed", "window_must_end_the_day_before_d0");
    const days = Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000) + 1;
    if (days < 1 || days > HEALTHKIT_SLEEP_VALIDATION_MAX_DAYS) return off("invalid_configuration_fail_closed", "window_too_long");
    return Object.freeze({
      enabled: true,
      runId: record.runId,
      windowStartSleepDay: start,
      windowEndSleepDay: end,
      prospectiveEffectiveSleepDay: d0,
      timeZone: record.timeZone,
      // [start-1 18:00, end 18:00) local; end == the prospective floor.
      windowStart: new Date(sleepDayWindowStartMs(start, record.timeZone)).toISOString(),
      windowEnd: new Date(sleepDayWindowEndMs(end, record.timeZone)).toISOString(),
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return off("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

export function getHealthKitSleepValidationSampleRecordId(ownerUserId, runId, externalId) {
  return `${HEALTHKIT_SLEEP_VALIDATION_SAMPLE_ID_PREFIX}${digest(["sleep-validation", String(ownerUserId), String(runId), String(externalId).toLowerCase()].join("\u0000"))}`;
}

/** Validation record built from the same allow-listed sample normalization. */
export function createHealthKitSleepValidationSampleRecord({ ownerUserId, runId, sample, receivedAt, batchId, deliveryDeviceId }) {
  const base = createHealthKitSleepSampleRecord({
    ownerUserId, sample, receivedAt, batchId, deliveryDeviceId, ingestionPurpose: HEALTHKIT_SLEEP_VALIDATION_PURPOSE,
  });
  return Object.freeze({
    ...base,
    schemaVersion: HEALTHKIT_SLEEP_VALIDATION_SAMPLE_SCHEMA_VERSION,
    id: getHealthKitSleepValidationSampleRecordId(ownerUserId, runId, sample.externalId),
    validationRunId: runId,
    purpose: HEALTHKIT_SLEEP_VALIDATION_PURPOSE,
    canonicalProductionHistory: false,
  });
}

export function isWithinValidationWindow(sample, policy) {
  const ended = Date.parse(sample.endedAt);
  return policy.enabled && ended >= Date.parse(policy.windowStart) && ended < Date.parse(policy.windowEnd);
}

/**
 * Sanitized shape of one validation run: counts, proportions, and categories
 * only. No timestamps, durations of a specific night, UUIDs, or source
 * display names ever leave this function. Runs sleep-canon-v1 in memory twice
 * (Server source preference, and generic ranking) for comparison.
 */
export function summarizeHealthKitSleepValidation({ samples = [], preferenceRecord = null, policy } = {}) {
  const live = samples.filter((sample) => sample?.lifecycle?.state === HealthKitSleepLifecycle.LIVE && sample.validationRunId === policy?.runId);
  const inWindow = (sleepDay) => sleepDay >= policy.windowStartSleepDay && sleepDay <= policy.windowEndSleepDay;
  const preference = resolveHealthKitSleepSourcePreferencePolicy(preferenceRecord);
  const preferred = [...canonicalizeHealthKitSleep({ samples: live, preference })].filter(([day]) => inWindow(day));
  const generic = new Map([...canonicalizeHealthKitSleep({ samples: live, preference: null })].filter(([day]) => inWindow(day)));

  const count = (values) => values.reduce((totals, value) => { totals[value] = (totals[value] ?? 0) + 1; return totals; }, {});
  const ratio = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 1000 : null);
  const quantiles = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
    return { min: sorted[0], p50: at(0.5), max: sorted.at(-1) };
  };
  const bucketHours = (seconds) => (seconds == null ? "none" : seconds < 4 * 3600 ? "<4h" : seconds < 6 * 3600 ? "4-6h" : seconds < 8 * 3600 ? "6-8h" : seconds < 10 * 3600 ? "8-10h" : ">=10h");

  const nights = preferred.map(([, day]) => day);
  const mains = nights.map((day) => (day.mainEpisodeIndex === null ? null : day.episodes[day.mainEpisodeIndex]));
  const mainEpisodes = mains.filter(Boolean);
  const reasonsOuraNotPrimary = [];
  let ouraPresentNights = 0;
  let ouraPrimaryWhenPresent = 0;
  let genericDiffers = 0;
  for (const [sleepDay, day] of preferred) {
    const main = day.mainEpisodeIndex === null ? null : day.episodes[day.mainEpisodeIndex];
    if (!main) continue;
    const families = new Set([main.primarySource.sourceFamily, ...main.corroboratingSources.map((source) => source.sourceFamily)]);
    if (families.has("oura")) {
      ouraPresentNights += 1;
      if (main.primarySource.sourceFamily === "oura") ouraPrimaryWhenPresent += 1;
      else reasonsOuraNotPrimary.push(main.corroboratingSources.find((source) => source.sourceFamily === "oura")?.usable ? "oura_usable_but_not_primary" : "oura_insufficient_coverage");
    }
    const genericMain = generic.get(sleepDay);
    const genericPrimary = genericMain?.mainEpisodeIndex === null || !genericMain ? null : genericMain.episodes[genericMain.mainEpisodeIndex].primarySource.sourceFamily;
    if (genericPrimary !== main.primarySource.sourceFamily) genericDiffers += 1;
  }
  const expectedDays = Math.round((Date.parse(`${policy.windowEndSleepDay}T00:00:00Z`) - Date.parse(`${policy.windowStartSleepDay}T00:00:00Z`)) / 86400000) + 1;

  return Object.freeze({
    contractVersion: HEALTHKIT_SLEEP_VALIDATION_CONTRACT_VERSION,
    algorithmVersion: nights[0]?.algorithmVersion ?? "sleep-canon-v1",
    runId: policy.runId,
    window: { sleepDays: expectedDays },
    sourcePreference: { configured: preference.configured, families: preference.preferredSources.map((entry) => entry.sourceFamily ?? "bundle") },
    samples: {
      total: live.length,
      bySourceFamily: count(live.map((sample) => sample.source?.sourceFamily ?? "unknown")),
      byStage: count(live.map((sample) => sample.stage)),
      userEntered: live.filter((sample) => sample.wasUserEntered).length,
      timeZoneSource: count(live.map((sample) => sample.timeZoneSource)),
      distinctTimeZones: new Set(live.map((sample) => sample.timeZone)).size,
      unknownStage: live.filter((sample) => sample.stage === "unknown").length,
    },
    nights: {
      withAnySleepData: nights.length,
      missing: expectedDays - nights.length,
      status: count(nights.map((day) => day.status)),
      timeZoneShift: nights.filter((day) => day.timeZoneShift).length,
      withSecondaryEpisodes: nights.filter((day) => day.episodes.length > 1).length,
      episodesPerNight: quantiles(nights.map((day) => day.episodes.length)),
    },
    mainEpisode: {
      primarySourceFamily: count(mainEpisodes.map((episode) => episode.primarySource.sourceFamily)),
      primaryReason: count(mainEpisodes.map((episode) => episode.reconciliation.reason)),
      primaryUsable: mainEpisodes.filter((episode) => episode.reconciliation.primaryUsable).length,
      candidateSourcesPerEpisode: quantiles(mainEpisodes.map((episode) => episode.reconciliation.candidateCount)),
      multiSourceOverlap: mainEpisodes.filter((episode) => episode.reconciliation.candidateCount > 1).length,
      staged: mainEpisodes.filter((episode) => episode.completeness.stageDetail === "staged").length,
      manualOnly: mainEpisodes.filter((episode) => episode.completeness.sourceBasis === "manual_only").length,
      inBedReported: mainEpisodes.filter((episode) => episode.inBedSeconds !== null).length,
      withAwake: mainEpisodes.filter((episode) => episode.awakeSeconds > 0).length,
      stageCoverage: quantiles(mainEpisodes.map((episode) => episode.stageCoverage)),
      timelineSegments: quantiles(mainEpisodes.map((episode) => episode.timeline.length)),
      asleepDurationBucket: count(mainEpisodes.map((episode) => bucketHours(episode.asleepSeconds))),
      stageSumEqualsAsleep: mainEpisodes.filter((episode) =>
        episode.coreSeconds + episode.deepSeconds + episode.remSeconds + episode.unspecifiedSeconds === episode.asleepSeconds).length,
    },
    oura: {
      nightsPresent: ouraPresentNights,
      primaryWhenPresent: ouraPrimaryWhenPresent,
      primaryWhenPresentRatio: ratio(ouraPrimaryWhenPresent, ouraPresentNights),
      notPrimaryReasons: count(reasonsOuraNotPrimary),
    },
    genericRankingComparison: { nightsWherePrimaryDiffers: genericDiffers },
    fieldsPopulated: {
      mainSleep: nights.filter((day) => day.mainSleep).length,
      windowClosesAt: nights.filter((day) => day.windowClosesAt).length,
      timeline: mainEpisodes.filter((episode) => episode.timeline.length > 0).length,
    },
    strategicEvidenceEligibility: "quarantined",
  });
}

/** Sleep day of a sample end in its own zone (exported for tests). */
export function validationSampleSleepDay(sample) {
  return deriveHealthKitSleepDay(sample.endedAt, sample.timeZone);
}
