import {
  HEALTHKIT_SLEEP_CONTRACT_VERSION,
  HealthKitSleepIngestionPurpose,
  HealthKitSleepSourceFamily,
  digest,
  isCalendarDateKey,
  isValidTimeZone,
  shiftDateKey,
  sleepDayWindowStartMs,
  stable,
} from "./HealthKitSleepContract.js";

// Two independent, Server-owned, fail-closed Sleep records in
// healthKitConfiguration. Neither has a writer in this codebase yet: choosing
// the Founder start sleep day (D0) and any source preference are later,
// separately authorized operations. Both resolvers never throw; any malformed
// value resolves to the safe default (OFF / generic ranking).

// ---------------------------------------------------------------------------
// Activation. ABSENT = OFF: the Sleep command stores nothing and the Native
// manifest advertises Sleep ingestion as disabled.

export const HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID = "healthkit_sleep_canonical_activation_policy";
export const HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION = "healthkit-sleep-activation-policy-v1";
// A bounded (non-open-ended) proving window is at most this many sleep days.
export const HEALTHKIT_SLEEP_ACTIVATION_MAX_DAYS = 7;

export function resolveHealthKitSleepActivationPolicy(record) {
  const disabled = (source, invalidReason = null) => Object.freeze({
    enabled: false,
    mode: null,
    effectiveSleepDay: null,
    endSleepDay: null,
    openEnded: false,
    timeZone: null,
    activationFloor: null,
    source,
    invalidReason,
  });
  if (!record) return disabled("not_configured");
  try {
    if (record.status !== "enabled") return disabled("server_owned_configuration", "status_not_enabled");
    if (record.schemaVersion !== HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION) {
      return disabled("invalid_configuration_fail_closed", "schema_version_unrecognized");
    }
    if (record.strategicEvidenceEligibility !== undefined && record.strategicEvidenceEligibility !== "quarantined") {
      return disabled("invalid_configuration_fail_closed", "strategic_eligibility_not_quarantined");
    }
    if (record.historicalBackfill !== undefined && record.historicalBackfill !== false) {
      return disabled("invalid_configuration_fail_closed", "historical_backfill_not_permitted");
    }
    if (!Object.values(HealthKitSleepIngestionPurpose).includes(record.mode)) {
      return disabled("invalid_configuration_fail_closed", "mode_invalid");
    }
    if (!isCalendarDateKey(record.effectiveSleepDay)) return disabled("invalid_configuration_fail_closed", "effective_sleep_day_invalid");
    // The zone names the prospective floor instant: (D0 - 1) 18:00 local.
    if (!isValidTimeZone(record.timeZone)) return disabled("invalid_configuration_fail_closed", "time_zone_invalid");
    if (record.openEnded !== undefined && typeof record.openEnded !== "boolean") {
      return disabled("invalid_configuration_fail_closed", "open_ended_flag_invalid");
    }
    const openEnded = record.openEnded === true;
    let endSleepDay = null;
    if (openEnded) {
      if (record.endSleepDay !== undefined && record.endSleepDay !== null) {
        return disabled("invalid_configuration_fail_closed", "open_ended_window_must_have_no_end_date");
      }
    } else {
      if (!isCalendarDateKey(record.endSleepDay)) return disabled("invalid_configuration_fail_closed", "window_invalid");
      endSleepDay = record.endSleepDay;
      const days = Math.round((Date.parse(`${endSleepDay}T00:00:00.000Z`) - Date.parse(`${record.effectiveSleepDay}T00:00:00.000Z`)) / 86400000) + 1;
      if (days < 1 || days > HEALTHKIT_SLEEP_ACTIVATION_MAX_DAYS) return disabled("invalid_configuration_fail_closed", "window_invalid");
    }
    const activationFloor = new Date(sleepDayWindowStartMs(record.effectiveSleepDay, record.timeZone)).toISOString();
    return Object.freeze({
      enabled: true,
      mode: record.mode,
      effectiveSleepDay: record.effectiveSleepDay,
      endSleepDay,
      openEnded,
      timeZone: record.timeZone,
      activationFloor,
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return disabled("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

/**
 * Whether one normalized sample may be stored under a resolved policy. There
 * is no backfill: a sample ending before the floor is refused, never stored.
 */
export function assessHealthKitSleepSampleActivation({ sample, policy, sampleSleepDay } = {}) {
  if (!policy?.enabled) return Object.freeze({ admitted: false, reason: "sleep_ingestion_not_activated" });
  if (Date.parse(sample.endedAt) < Date.parse(policy.activationFloor)) {
    return Object.freeze({ admitted: false, reason: "before_activation_floor" });
  }
  if (policy.endSleepDay !== null && sampleSleepDay > shiftDateKey(policy.endSleepDay, 1)) {
    // One day of slack keeps an episode that straddles the last boundary whole.
    return Object.freeze({ admitted: false, reason: "after_activation_window" });
  }
  return Object.freeze({ admitted: true, reason: "within_activation_window" });
}

/**
 * The dormant Native capability block. Native Phase B adds Sleep to its
 * automatic streams only while `enabled` is true, and uses `activationFloor`
 * as its anchored-query floor.
 */
export function describeHealthKitSleepCapability(policy, { commandType } = {}) {
  const resolved = policy ?? resolveHealthKitSleepActivationPolicy(null);
  return Object.freeze({
    commandType,
    contractVersion: HEALTHKIT_SLEEP_CONTRACT_VERSION,
    enabled: resolved.enabled === true,
    mode: resolved.enabled ? resolved.mode : null,
    effectiveSleepDay: resolved.enabled ? resolved.effectiveSleepDay : null,
    endSleepDay: resolved.enabled ? resolved.endSleepDay : null,
    activationFloor: resolved.enabled ? resolved.activationFloor : null,
  });
}

// ---------------------------------------------------------------------------
// Source preference. ABSENT = generic deterministic ranking. A preference only
// changes which source lane is the canonical primary of an episode; every
// observation from every source is preserved either way.

export const HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID = "healthkit_sleep_source_preference_policy";
export const HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION = "healthkit-sleep-source-preference-v1";
export const HEALTHKIT_SLEEP_MAX_PREFERRED_SOURCES = 8;

const PREFERABLE_FAMILIES = Object.freeze(Object.values(HealthKitSleepSourceFamily)
  .filter((family) => family !== HealthKitSleepSourceFamily.MANUAL));

export function resolveHealthKitSleepSourcePreferencePolicy(record) {
  const generic = (source, invalidReason = null) => Object.freeze({
    configured: false,
    preferredSources: Object.freeze([]),
    digest: "generic",
    source,
    invalidReason,
  });
  if (!record) return generic("not_configured");
  try {
    if (record.status !== "enabled") return generic("server_owned_configuration", "status_not_enabled");
    if (record.schemaVersion !== HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION) {
      return generic("invalid_configuration_fail_closed", "schema_version_unrecognized");
    }
    const list = record.preferredSources;
    if (!Array.isArray(list) || list.length === 0 || list.length > HEALTHKIT_SLEEP_MAX_PREFERRED_SOURCES) {
      return generic("invalid_configuration_fail_closed", "preferred_sources_invalid");
    }
    const preferredSources = [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return generic("invalid_configuration_fail_closed", "preferred_sources_invalid");
      const keys = Object.keys(entry);
      if (keys.length !== 1) return generic("invalid_configuration_fail_closed", "preferred_sources_invalid");
      if (keys[0] === "sourceFamily" && PREFERABLE_FAMILIES.includes(entry.sourceFamily)) {
        preferredSources.push(Object.freeze({ sourceFamily: entry.sourceFamily }));
      } else if (keys[0] === "bundleIdentifier" && typeof entry.bundleIdentifier === "string" &&
        entry.bundleIdentifier.trim() && entry.bundleIdentifier.length <= 300) {
        preferredSources.push(Object.freeze({ bundleIdentifier: entry.bundleIdentifier.trim() }));
      } else {
        return generic("invalid_configuration_fail_closed", "preferred_sources_invalid");
      }
    }
    return Object.freeze({
      configured: true,
      preferredSources: Object.freeze(preferredSources),
      digest: `sha256_${digest(stable(preferredSources))}`,
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return generic("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

/** Preference rank of a lane (0 = most preferred); null when not preferred. */
export function sleepSourcePreferenceRank(preference, lane) {
  if (!preference?.configured) return null;
  const index = preference.preferredSources.findIndex((entry) => entry.sourceFamily
    ? entry.sourceFamily === lane.sourceFamily
    : entry.bundleIdentifier.toLowerCase() === String(lane.bundleIdentifier).toLowerCase());
  return index === -1 ? null : index;
}
