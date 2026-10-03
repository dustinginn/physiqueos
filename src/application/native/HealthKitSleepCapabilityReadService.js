import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  resolveHealthKitSleepActivationPolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import { HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION } from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  resolveHealthKitSleepValidationPolicy,
} from "../../domain/services/HealthKitSleepHistoricalValidation.js";
import { HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT } from "../commands/HealthKitSleepHistoricalEvidenceImportPort.js";
import {
  HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
  resolveHealthKitTrustedWatchWorkoutCorrelationPolicy,
} from "../../domain/services/HealthKitTrustedWatchWorkoutCorrelationPolicy.js";

/**
 * Resolves the owner's Sleep activation policy for the Native manifest. One
 * point read of one configuration record; it never reads Sleep data. The
 * resolver is fail-closed, so an absent or malformed policy is disabled.
 */
export function createHealthKitSleepCapabilityReadService({ records, ownerUserId } = {}) {
  if (!records?.get || !ownerUserId) {
    throw new Error("The HealthKit Sleep capability reader requires record storage and owner authority.");
  }
  return Object.freeze({
    async getCapability() {
      return resolveHealthKitSleepActivationPolicy(await records.get({
        ownerUserId,
        collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
        recordId: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
      }));
    },
    /** The bounded historical-validation window (absent = disabled). */
    async getHistoricalValidationCapability() {
      return resolveHealthKitSleepValidationPolicy(await records.get({
        ownerUserId,
        collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
        recordId: HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
      }));
    },
    async getHistoricalEvidenceCapability() {
      return Object.freeze({ enabled: true, ...HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT });
    },
    async getTrustedWatchWorkoutCorrelationCapability() {
      return resolveHealthKitTrustedWatchWorkoutCorrelationPolicy(await records.get({
        ownerUserId,
        collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
        recordId: HEALTHKIT_TRUSTED_WATCH_CORRELATION_POLICY_RECORD_ID,
      }));
    },
  });
}
