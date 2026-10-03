export const HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID = "healthkit_trusted_watch_workout_correlation_policy";
export const HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_SCHEMA_VERSION = "healthkit-trusted-watch-workout-correlation-policy-v1";
export const HEALTHKIT_TRUSTED_WATCH_CORRELATION_CONTRACT_VERSION = "healthkit-trusted-watch-workout-correlation-v1";

const EXACT_TRADITIONAL_STRENGTH_TYPES = Object.freeze(["50"]);
export const HEALTHKIT_TRUSTED_WATCH_SOURCE_BUNDLE = "com.physiqueos.native.dev";

export function resolveHealthKitTrustedWatchWorkoutCorrelationPolicy(record) {
  const disabled = (source, invalidReason = null) => Object.freeze({
    enabled: false,
    trustedSourceBundleIdentifiers: Object.freeze([]),
    traditionalStrengthTrainingActivityTypes: EXACT_TRADITIONAL_STRENGTH_TYPES,
    clockToleranceSeconds: 0,
    effectiveAt: null,
    prospectiveOnly: true,
    source,
    invalidReason,
  });
  if (!record) return disabled("not_configured");
  try {
    if (record.status !== "enabled") return disabled("server_owned_configuration", "status_not_enabled");
    if (record.schemaVersion !== HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_SCHEMA_VERSION) {
      return disabled("invalid_configuration_fail_closed", "schema_version_unrecognized");
    }
    if (record.prospectiveOnly !== true || record.historicalBackfill !== false) {
      return disabled("invalid_configuration_fail_closed", "prospective_boundary_invalid");
    }
    if (JSON.stringify(record.trustedSourceBundleIdentifiers) !==
      JSON.stringify([HEALTHKIT_TRUSTED_WATCH_SOURCE_BUNDLE])) {
      return disabled("invalid_configuration_fail_closed", "trusted_source_bundle_invalid");
    }
    if (JSON.stringify(record.traditionalStrengthTrainingActivityTypes) !== JSON.stringify(EXACT_TRADITIONAL_STRENGTH_TYPES)) {
      return disabled("invalid_configuration_fail_closed", "activity_types_invalid");
    }
    if (!Number.isFinite(record.clockToleranceSeconds) || record.clockToleranceSeconds < 0 || record.clockToleranceSeconds > 300) {
      return disabled("invalid_configuration_fail_closed", "clock_tolerance_invalid");
    }
    const effectiveAt = new Date(record.effectiveAt);
    if (!record.effectiveAt || Number.isNaN(effectiveAt.getTime()) || effectiveAt.toISOString() !== record.effectiveAt) {
      return disabled("invalid_configuration_fail_closed", "effective_at_invalid");
    }
    return Object.freeze({
      enabled: true,
      trustedSourceBundleIdentifiers: Object.freeze([...record.trustedSourceBundleIdentifiers]),
      traditionalStrengthTrainingActivityTypes: EXACT_TRADITIONAL_STRENGTH_TYPES,
      clockToleranceSeconds: record.clockToleranceSeconds,
      effectiveAt: record.effectiveAt,
      prospectiveOnly: true,
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return disabled("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

export function describeHealthKitTrustedWatchWorkoutCorrelationCapability(policy) {
  const resolved = policy ?? resolveHealthKitTrustedWatchWorkoutCorrelationPolicy(null);
  return Object.freeze({
    contractVersion: HEALTHKIT_TRUSTED_WATCH_CORRELATION_CONTRACT_VERSION,
    enabled: resolved.enabled === true,
    prospectiveOnly: true,
    trustedSourceBundleIdentifiers: resolved.enabled ? [...resolved.trustedSourceBundleIdentifiers] : [],
    traditionalStrengthTrainingActivityTypes: [...EXACT_TRADITIONAL_STRENGTH_TYPES],
    clockToleranceSeconds: resolved.enabled ? resolved.clockToleranceSeconds : 0,
    effectiveAt: resolved.enabled ? resolved.effectiveAt : null,
  });
}
