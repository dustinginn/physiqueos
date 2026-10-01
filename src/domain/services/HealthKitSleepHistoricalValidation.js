import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_ASLEEP_STAGES,
  HealthKitSleepStage,
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
import {
  canonicalizeHealthKitSleep,
  canonicalizeHealthKitSleepV1,
} from "./HealthKitSleepCanonicalizer.js";
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
  // A night "has Oura" when any live Oura sample belongs to that sleep day,
  // whether or not it landed in the main episode.
  const ouraNights = new Set(live.filter((sample) => sample.source?.sourceFamily === "oura")
    .map((sample) => validationSampleSleepDay(sample)).filter(inWindow));
  let ouraPresentNights = 0;
  let ouraPrimaryWhenPresent = 0;
  let genericDiffers = 0;
  for (const [sleepDay, day] of preferred) {
    const main = day.mainEpisodeIndex === null ? null : day.episodes[day.mainEpisodeIndex];
    if (!main) continue;
    if (ouraNights.has(sleepDay)) {
      ouraPresentNights += 1;
      const ouraInMain = main.corroboratingSources.find((source) => source.sourceFamily === "oura");
      if (main.primarySource.sourceFamily === "oura") ouraPrimaryWhenPresent += 1;
      else reasonsOuraNotPrimary.push(!ouraInMain ? "oura_outside_main_episode" : ouraInMain.usable ? "oura_usable_but_not_primary" : "oura_insufficient_coverage");
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

/**
 * Privacy-safe v1/v2 correctness comparison for the isolated historical run.
 * It returns counts only: never dates, UUIDs, timestamps, source identifiers,
 * or per-night durations. Selected-copy totals are independently swept from
 * the selected provenance IDs rather than read back from mainSleep.
 */
export function compareHealthKitSleepValidationV1V2({ samples = [], preferenceRecord = null, policy } = {}) {
  const live = samples.filter((sample) => sample?.lifecycle?.state === HealthKitSleepLifecycle.LIVE && sample.validationRunId === policy?.runId);
  const inWindow = (sleepDay) => sleepDay >= policy.windowStartSleepDay && sleepDay <= policy.windowEndSleepDay;
  const preference = resolveHealthKitSleepSourcePreferencePolicy(preferenceRecord);
  const v1 = new Map([...canonicalizeHealthKitSleepV1({ samples: live, preference })].filter(([day]) => inWindow(day)));
  const v2 = new Map([...canonicalizeHealthKitSleep({ samples: live, preference })].filter(([day]) => inWindow(day)));
  const samplesById = new Map(live.map((sample) => [sample.id, sample]));
  const count = (values) => values.reduce((totals, value) => { totals[value] = (totals[value] ?? 0) + 1; return totals; }, {});
  const deltaFields = ["asleepSeconds", "awakeSeconds", "coreSeconds", "deepSeconds", "remSeconds", "unspecifiedSeconds", "inBedSeconds"];
  const changed = Object.fromEntries(deltaFields.map((field) => [field, 0]));
  const candidateCounts = [];
  let affected = 0;
  let selectedExactlyOne = 0;
  let selectedConflictFree = 0;
  let selectedTotalsMatch = 0;
  let asleepStable = 0;
  let unaffected = 0;
  let unaffectedEquivalent = 0;

  for (const [sleepDay, dayV2] of v2) {
    const dayV1 = v1.get(sleepDay);
    const mainV2 = mainEpisode(dayV2);
    const mainV1 = mainEpisode(dayV1);
    const selection = mainV2?.reconciliation?.copySelection;
    if (!selection?.applied) {
      unaffected += 1;
      if (semanticallyEquivalentDay(dayV1, dayV2)) unaffectedEquivalent += 1;
      continue;
    }
    affected += 1;
    candidateCounts.push(selection.candidateCount);
    if (selection.selectedSampleCount > 0 && selection.corroboratingSampleCount > 0) selectedExactlyOne += 1;
    const selected = mainV2.sourceSampleIds.map((id) => samplesById.get(id)).filter(Boolean);
    const independentlyResolved = independentlyResolveSelectedCopy(selected, mainV2.start, mainV2.end);
    if (independentlyResolved.conflictingSpecificIntervals === 0) selectedConflictFree += 1;
    if (deltaFields.every((field) => withinTolerance(mainV2[field], independentlyResolved[field]))) selectedTotalsMatch += 1;
    if (withinTolerance(mainV2.asleepSeconds, mainV1?.asleepSeconds)) asleepStable += 1;
    for (const field of deltaFields) if (!withinTolerance(mainV2[field], mainV1?.[field])) changed[field] += 1;
  }

  return Object.freeze({
    algorithmVersions: { before: "sleep-canon-v1", candidate: "sleep-canon-v2" },
    samples: live.length,
    nights: {
      v1: v1.size,
      v2: v2.size,
      affectedDuplicateCopies: affected,
      affectedResolvedToOneSelectedCopy: selectedExactlyOne,
      affectedSelectedCopyConflictFree: selectedConflictFree,
      affectedSelectedTotalsWithinTolerance: selectedTotalsMatch,
      affectedAsleepStableWithinTolerance: asleepStable,
      unaffected: unaffected,
      unaffectedSemanticallyEquivalent: unaffectedEquivalent,
    },
    duplicateCopyCandidates: count(candidateCounts),
    v1VsV2NightsChangedBeyondTolerance: changed,
  });
}

function mainEpisode(day) {
  return day && day.mainEpisodeIndex !== null ? day.episodes[day.mainEpisodeIndex] : null;
}

function semanticallyEquivalentDay(left, right) {
  if (!left || !right) return false;
  const projectEpisode = (episode) => ({
    kind: episode.kind,
    start: episode.start,
    end: episode.end,
    timeZone: episode.timeZone,
    timeZoneSource: episode.timeZoneSource,
    primarySource: episode.primarySource,
    asleepSeconds: episode.asleepSeconds,
    awakeSeconds: episode.awakeSeconds,
    coreSeconds: episode.coreSeconds,
    deepSeconds: episode.deepSeconds,
    remSeconds: episode.remSeconds,
    unspecifiedSeconds: episode.unspecifiedSeconds,
    inBedSeconds: episode.inBedSeconds,
    stageCoverage: episode.stageCoverage,
    timeline: episode.timeline,
    completeness: episode.completeness,
  });
  return JSON.stringify({
    status: left.status,
    timeZone: left.timeZone,
    timeZoneShift: left.timeZoneShift,
    windowClosesAt: left.windowClosesAt,
    mainEpisodeIndex: left.mainEpisodeIndex,
    totalAsleepIncludingSecondarySeconds: left.totalAsleepIncludingSecondarySeconds,
    episodes: left.episodes.map(projectEpisode),
  }) === JSON.stringify({
    status: right.status,
    timeZone: right.timeZone,
    timeZoneShift: right.timeZoneShift,
    windowClosesAt: right.windowClosesAt,
    mainEpisodeIndex: right.mainEpisodeIndex,
    totalAsleepIncludingSecondarySeconds: right.totalAsleepIncludingSecondarySeconds,
    episodes: right.episodes.map(projectEpisode),
  });
}

function independentlyResolveSelectedCopy(samples, start, end) {
  const clipStart = Date.parse(start);
  const clipEnd = Date.parse(end);
  const active = samples.map((sample) => ({
    stage: sample.stage,
    start: Math.max(clipStart, Date.parse(sample.startedAt)),
    end: Math.min(clipEnd, Date.parse(sample.endedAt)),
  })).filter((sample) => sample.end > sample.start && sample.stage !== HealthKitSleepStage.IN_BED && sample.stage !== HealthKitSleepStage.UNKNOWN);
  const specific = active.filter((sample) => sample.stage !== HealthKitSleepStage.ASLEEP_UNSPECIFIED);
  let conflictingSpecificIntervals = 0;
  for (let left = 0; left < specific.length; left += 1) {
    for (let right = left + 1; right < specific.length; right += 1) {
      if (Math.min(specific[left].end, specific[right].end) > Math.max(specific[left].start, specific[right].start)) {
        conflictingSpecificIntervals += 1;
      }
    }
  }
  const precedence = new Map([[HealthKitSleepStage.ASLEEP_DEEP, 0], [HealthKitSleepStage.ASLEEP_REM, 1], [HealthKitSleepStage.ASLEEP_CORE, 2], [HealthKitSleepStage.AWAKE, 3], [HealthKitSleepStage.ASLEEP_UNSPECIFIED, 4]]);
  const boundaries = [...new Set(active.flatMap((sample) => [sample.start, sample.end]))].sort((a, b) => a - b);
  const totals = { asleepSeconds: 0, awakeSeconds: 0, coreSeconds: 0, deepSeconds: 0, remSeconds: 0, unspecifiedSeconds: 0 };
  const field = {
    [HealthKitSleepStage.AWAKE]: "awakeSeconds",
    [HealthKitSleepStage.ASLEEP_CORE]: "coreSeconds",
    [HealthKitSleepStage.ASLEEP_DEEP]: "deepSeconds",
    [HealthKitSleepStage.ASLEEP_REM]: "remSeconds",
    [HealthKitSleepStage.ASLEEP_UNSPECIFIED]: "unspecifiedSeconds",
  };
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    const covering = active.filter((sample) => sample.start <= segmentStart && sample.end >= segmentEnd)
      .sort((left, right) => precedence.get(left.stage) - precedence.get(right.stage));
    const stage = covering[0]?.stage;
    if (!stage) continue;
    const duration = Math.round((segmentEnd - segmentStart) / 1000);
    totals[field[stage]] += duration;
    if (HEALTHKIT_SLEEP_ASLEEP_STAGES.includes(stage)) totals.asleepSeconds += duration;
  }
  const inBed = samples.filter((sample) => sample.stage === HealthKitSleepStage.IN_BED)
    .map((sample) => ({ start: Date.parse(sample.startedAt), end: Date.parse(sample.endedAt) }));
  totals.inBedSeconds = inBed.length ? Math.round(unionDurationMs(inBed) / 1000) : null;
  return { ...totals, conflictingSpecificIntervals };
}

function unionDurationMs(intervals) {
  const ordered = intervals.filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let total = 0;
  let end = null;
  for (const interval of ordered) {
    if (end === null || interval.start > end) {
      total += interval.end - interval.start;
      end = interval.end;
    } else if (interval.end > end) {
      total += interval.end - end;
      end = interval.end;
    }
  }
  return total;
}

function withinTolerance(actual, expected) {
  if (actual == null || expected == null) return actual == null && expected == null;
  return Math.abs(actual - expected) <= Math.max(2, Math.abs(expected) * 0.02);
}

/** Sleep day of a sample end in its own zone (exported for tests). */
export function validationSampleSleepDay(sample) {
  return deriveHealthKitSleepDay(sample.endedAt, sample.timeZone);
}
