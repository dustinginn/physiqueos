import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";
import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_DAY_COLLECTION,
} from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID,
} from "../../domain/services/HealthKitSleepPolicies.js";

// Read-only inputs for the Recovery Briefing composer (RecoveryBriefingComposerV1).
//
// Reads exactly what the existing Sleep graduation reader already reads, and
// nothing more: the bounded ordinary canonical-day range by sleep day
// (`healthKitSleepDays`; never the historical-evidence collections), the Sleep
// activation record and the canonical-algorithm record, plus the single
// Recovery publication authority record. It has no write method.
//
// Wired into the provider briefing cadence composition for Weekly and Monthly
// only. It reads Sleep only after the Recovery publication authority is found
// valid; that record does not exist in production (absent = OFF).

export const RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID = "recovery_briefing_publication_authority";
// The Server-owned configuration collection the Sleep policies already live in.
export const RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION = HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION;
// Monthly: 28 baseline nights + at most 31 period nights.
const MAXIMUM_RANGE_DAYS = 59;

export function createRecoverySleepInputReaderV1({ records, query, ownerUserId } = {}) {
  const store = records ?? (query ? createPhase4CanonicalRecordStore({ query }) : null);
  if (!store || !ownerUserId) throw new Error("Recovery Sleep input reads require a record store and owner.");
  const configuration = (recordId) => store.get({
    ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId,
  });
  return Object.freeze({
    async readAuthorityRecord() {
      return (await store.get({
        ownerUserId,
        collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
        recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
      })) ?? null;
    },
    async readSleepInputs({ ownerUserId: requested = ownerUserId, startDate, endDate } = {}) {
      if (requested !== ownerUserId) throw new Error("Recovery Sleep input owner mismatch.");
      const span = Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86_400_000) + 1;
      if (!Number.isFinite(span) || span < 1 || span > MAXIMUM_RANGE_DAYS) {
        throw new Error("Recovery Sleep input reads require a bounded range.");
      }
      const [sleepDays, activationPolicyRecord, algorithmPolicyRecord] = await Promise.all([
        store.listByOccurrenceDateRange({ ownerUserId, collection: HEALTHKIT_SLEEP_DAY_COLLECTION, startDate, endDate }),
        configuration(HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID),
        configuration(HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID),
      ]);
      return Object.freeze({
        sleepDays: sleepDays ?? [],
        activationPolicyRecord: activationPolicyRecord ?? null,
        algorithmPolicyRecord: algorithmPolicyRecord ?? null,
      });
    },
  });
}
