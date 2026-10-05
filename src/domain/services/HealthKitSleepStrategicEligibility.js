import { HealthKitSleepIngestionPurpose } from "./HealthKitSleepContract.js";

export const HEALTHKIT_SLEEP_STRATEGIC_POLICY_SCHEMA_VERSION = "healthkit-sleep-strategic-eligibility-v1";

// This is the only future-facing Sleep eligibility seam. Historical import is a
// categorical, permanent exclusion before any policy is considered.
//
// Ingestion purpose is provenance, never meaning: a prospective ordinary day
// (`validation_only` while the D0 canary ran, or `operational`) is quarantined
// unless an explicit strategic policy is on, and then is eligible only on or
// after its `strategicEffectiveAt` sleep day (and on or before `endSleepDay`
// when the policy names one). The policy is resolved by the Sleep graduation
// overlay (HealthKitSleepGraduation.js); nothing stored on a Sleep record can
// make it strategic.
export function assessHealthKitSleepStrategicEligibility(record, policy = null) {
  const purpose = record?.ingestionPurpose ?? record?.origin ?? null;
  if (purpose === HealthKitSleepIngestionPurpose.HISTORICAL_EVIDENCE_IMPORT) {
    return Object.freeze({ eligible: false, permanent: true, reason: "historical_evidence_import_permanently_display_only" });
  }
  if (purpose !== HealthKitSleepIngestionPurpose.VALIDATION_ONLY && purpose !== HealthKitSleepIngestionPurpose.OPERATIONAL) {
    return Object.freeze({ eligible: false, permanent: false, reason: "sleep_origin_unrecognized" });
  }
  if (policy?.schemaVersion !== HEALTHKIT_SLEEP_STRATEGIC_POLICY_SCHEMA_VERSION || policy?.enabled !== true ||
      typeof policy?.strategicEffectiveAt !== "string") {
    return Object.freeze({
      eligible: false,
      permanent: false,
      reason: purpose === HealthKitSleepIngestionPurpose.VALIDATION_ONLY
        ? "prospective_validation_only_quarantined" : "sleep_strategic_policy_off",
    });
  }
  const sleepDay = String(record.sleepDay ?? record.occurrenceDate ?? "");
  if (sleepDay < policy.strategicEffectiveAt) {
    return Object.freeze({ eligible: false, permanent: false, reason: "before_strategic_effective_boundary" });
  }
  if (typeof policy.endSleepDay === "string" && sleepDay > policy.endSleepDay) {
    return Object.freeze({ eligible: false, permanent: false, reason: "after_strategic_end_boundary" });
  }
  return Object.freeze({ eligible: true, permanent: false, reason: "explicit_sleep_strategic_policy" });
}

export function excludeStrategicSleepRecords(records, policy = null) {
  return (records ?? []).filter((record) => assessHealthKitSleepStrategicEligibility(record, policy).eligible);
}
