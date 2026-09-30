import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  HealthKitSleepContractError,
  normalizeHealthKitSleepBatch,
} from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_VALIDATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_VALIDATION_CONTRACT_VERSION,
  HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION,
  createHealthKitSleepValidationSampleRecord,
  getHealthKitSleepValidationSampleRecordId,
  isWithinValidationWindow,
  resolveHealthKitSleepValidationPolicy,
} from "../../domain/services/HealthKitSleepHistoricalValidation.js";

/// `healthkit.sleep.historical-validation.ingest.v1`: stores bounded historical
/// Sleep samples for validation/design ONLY, in `healthKitSleepValidationSamples`.
///
/// - Refused (409, nothing stored, no receipt) unless the Server-owned
///   historical-validation window policy is enabled and the request names its
///   exact `runId`.
/// - Samples only: deletions and window manifests belong to ordinary Sleep.
/// - Each sample must END inside the authorized window (which ends exactly at
///   the prospective activation floor); anything else is refused per sample.
/// - Never writes ordinary Sleep collections, never canonicalizes into a
///   stored day, never touches a strategic collection.
export function createHealthKitSleepHistoricalValidationPort({ records, now = () => new Date() } = {}) {
  return async function ingestHealthKitSleepHistoricalValidation(context) {
    if (typeof records?.putIfAbsent !== "function") {
      throw new Error("HealthKit Sleep historical validation requires create-if-absent record storage.");
    }
    const payload = context.payload ?? {};
    if (payload.deletions != null || payload.windowManifest != null) {
      throw new ApplicationProblem({
        status: 400,
        code: "HEALTHKIT_SLEEP_VALIDATION_CONTRACT_INVALID",
        title: "Historical validation accepts samples only.",
      });
    }
    let batch;
    try {
      batch = normalizeHealthKitSleepBatch({ batchId: payload.batchId, samples: payload.samples });
    } catch (error) {
      if (!(error instanceof HealthKitSleepContractError)) throw error;
      throw new ApplicationProblem({
        status: 400,
        code: error.code,
        title: error.message,
        fieldErrors: error.field ? [{ field: error.field, code: "invalid", detail: error.message }] : [],
      });
    }
    const ownerUserId = context.ownerUserId;
    const policy = resolveHealthKitSleepValidationPolicy(await records.get({
      ownerUserId, collection: HEALTHKIT_SLEEP_VALIDATION_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
    }));
    if (!policy.enabled || payload.runId !== policy.runId) {
      throw new ApplicationProblem({
        status: 409,
        code: "HEALTHKIT_SLEEP_HISTORICAL_VALIDATION_NOT_ENABLED",
        title: "HealthKit Sleep historical validation is not enabled for this run.",
      });
    }
    const receivedAt = now().toISOString();
    const deliveryDeviceId = context.principal?.deviceId ?? null;
    const results = [];
    const seen = new Map();
    for (const sample of batch.samples) {
      const first = seen.get(sample.externalId);
      if (first) {
        results.push(Object.freeze({
          externalId: sample.externalId,
          outcome: first.fingerprint === sample.contentFingerprint ? (first.outcome === "stored" ? "replayed" : first.outcome) : "refused_identity_conflict",
        }));
        continue;
      }
      let outcome;
      if (!isWithinValidationWindow(sample, policy)) {
        outcome = "refused_outside_validation_window";
      } else {
        const recordId = getHealthKitSleepValidationSampleRecordId(ownerUserId, policy.runId, sample.externalId);
        const stored = await records.putIfAbsent({
          ownerUserId,
          collection: HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION,
          recordId,
          payload: createHealthKitSleepValidationSampleRecord({
            ownerUserId, runId: policy.runId, sample, receivedAt, batchId: batch.batchId, deliveryDeviceId,
          }),
        });
        outcome = stored.created
          ? "stored"
          : stored.record?.contentFingerprint === sample.contentFingerprint ? "replayed" : "refused_identity_conflict";
      }
      seen.set(sample.externalId, { fingerprint: sample.contentFingerprint, outcome });
      results.push(Object.freeze({ externalId: sample.externalId, outcome }));
    }
    return Object.freeze({
      status: "committed",
      result: Object.freeze({
        contractVersion: HEALTHKIT_SLEEP_VALIDATION_CONTRACT_VERSION,
        batchId: batch.batchId,
        runId: policy.runId,
        samples: Object.freeze(results),
        canonicalProductionHistory: false,
        strategicEvidenceEligibility: "quarantined",
      }),
    });
  };
}
