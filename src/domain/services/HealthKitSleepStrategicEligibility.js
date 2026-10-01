import { HealthKitSleepIngestionPurpose } from "./HealthKitSleepContract.js";

// This is the only future-facing Sleep eligibility seam. Historical import and
// validation are categorical exclusions before any policy is considered.
export function assessHealthKitSleepStrategicEligibility(record, policy = null) {
  const purpose = record?.ingestionPurpose ?? record?.origin ?? null;
  if (purpose === HealthKitSleepIngestionPurpose.HISTORICAL_EVIDENCE_IMPORT) {
    return Object.freeze({ eligible: false, permanent: true, reason: "historical_evidence_import_permanently_display_only" });
  }
  if (purpose === HealthKitSleepIngestionPurpose.VALIDATION_ONLY) {
    return Object.freeze({ eligible: false, permanent: false, reason: "prospective_validation_only_quarantined" });
  }
  if (purpose !== HealthKitSleepIngestionPurpose.OPERATIONAL) {
    return Object.freeze({ eligible: false, permanent: false, reason: "sleep_origin_unrecognized" });
  }
  if (policy?.schemaVersion !== "healthkit-sleep-strategic-eligibility-v1" || policy?.enabled !== true ||
      typeof policy?.strategicEffectiveAt !== "string") {
    return Object.freeze({ eligible: false, permanent: false, reason: "sleep_strategic_policy_off" });
  }
  return Object.freeze({
    eligible: String(record.sleepDay ?? record.occurrenceDate ?? "") >= policy.strategicEffectiveAt,
    permanent: false,
    reason: String(record.sleepDay ?? record.occurrenceDate ?? "") >= policy.strategicEffectiveAt
      ? "explicit_future_sleep_policy" : "before_strategic_effective_boundary",
  });
}

export function excludeStrategicSleepRecords(records, policy = null) {
  return (records ?? []).filter((record) => assessHealthKitSleepStrategicEligibility(record, policy).eligible);
}
