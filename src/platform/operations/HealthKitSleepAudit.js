import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_DAY_COLLECTION,
  HEALTHKIT_SLEEP_SAMPLE_COLLECTION,
} from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  describeHealthKitSleepCapability,
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepSourcePreferencePolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import {
  HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION,
  resolveHealthKitSleepValidationPolicy,
  compareHealthKitSleepValidationV1V2,
  summarizeHealthKitSleepValidation,
} from "../../domain/services/HealthKitSleepHistoricalValidation.js";

// Strategic collections a Sleep record must never appear in.
const STRATEGIC_COLLECTIONS = Object.freeze([
  "canonicalEvidenceObjects", "evidencePackages", "evidenceReviews", "dailyBriefings",
  "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses", "healthKitCanonicalDays",
]);
const SLEEP_ID = /^healthkit_sleep_/;

/**
 * Zero-write Sleep audit. Output is sanitized: policy resolutions, counts,
 * and (for `historical-shape`) the aggregate validation shape only. It never
 * returns a timestamp of a specific night, a UUID, or a source display name.
 */
export async function auditHealthKitSleep({ records, ownerUserId, kind = "dormancy" } = {}) {
  if (!["dormancy", "historical-shape"].includes(kind)) {
    throw Object.assign(new Error("Unsupported Sleep audit kind."), { code: "AUDIT_KIND_INVALID" });
  }
  const get = (recordId) => records.get({ ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId });
  const list = (collection) => records.list({ ownerUserId, collection });
  const [activationRecord, preferenceRecord, validationRecord] = await Promise.all([
    get(HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID),
    get(HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID),
    get(HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID),
  ]);
  const activation = resolveHealthKitSleepActivationPolicy(activationRecord);
  const preference = resolveHealthKitSleepSourcePreferencePolicy(preferenceRecord);
  const validation = resolveHealthKitSleepValidationPolicy(validationRecord);
  const [sleepSamples, sleepDays, validationSamples] = await Promise.all([
    list(HEALTHKIT_SLEEP_SAMPLE_COLLECTION),
    list(HEALTHKIT_SLEEP_DAY_COLLECTION),
    list(HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION),
  ]);
  const strategicLeaks = {};
  for (const collection of STRATEGIC_COLLECTIONS) {
    const rows = await list(collection);
    strategicLeaks[collection] = rows.filter((row) => SLEEP_ID.test(String(row?.id ?? "")) ||
      String(row?.schemaVersion ?? row?.payload?.schemaVersion ?? "").startsWith("healthkit-sleep-")).length;
  }
  const base = {
    kind,
    policies: {
      activation: { present: Boolean(activationRecord), enabled: activation.enabled, invalidReason: activation.invalidReason, mode: activation.mode, effectiveSleepDay: activation.effectiveSleepDay },
      sourcePreference: { present: Boolean(preferenceRecord), configured: preference.configured, families: preference.preferredSources.map((entry) => entry.sourceFamily ?? "bundle") },
      historicalValidation: {
        present: Boolean(validationRecord), enabled: validation.enabled, runId: validation.runId,
        windowStartSleepDay: validation.windowStartSleepDay, windowEndSleepDay: validation.windowEndSleepDay,
        prospectiveEffectiveSleepDay: validation.prospectiveEffectiveSleepDay,
      },
    },
    servedCapability: { enabled: describeHealthKitSleepCapability(activation).enabled },
    counts: {
      healthKitSleepSamples: sleepSamples.length,
      healthKitSleepDays: sleepDays.length,
      healthKitSleepValidationSamples: validationSamples.length,
    },
    strategicLeaks,
    strategicLeakTotal: Object.values(strategicLeaks).reduce((sum, value) => sum + value, 0),
    recordStoreMutations: typeof records.getMutationCount === "function" ? records.getMutationCount() : null,
  };
  if (kind === "dormancy") return Object.freeze(base);
  if (!validation.enabled && !validationRecord?.runId) {
    return Object.freeze({ ...base, historicalShape: null, reason: "historical_validation_not_configured" });
  }
  const policy = validation.enabled ? validation : resolveHealthKitSleepValidationPolicy({ ...validationRecord, status: "enabled" });
  return Object.freeze({
    ...base,
    historicalShape: policy.enabled ? summarizeHealthKitSleepValidation({ samples: validationSamples, preferenceRecord, policy }) : null,
    historicalComparison: policy.enabled ? compareHealthKitSleepValidationV1V2({ samples: validationSamples, preferenceRecord, policy }) : null,
  });
}
