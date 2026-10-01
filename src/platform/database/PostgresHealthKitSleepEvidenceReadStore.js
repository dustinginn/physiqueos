import {
  HEALTHKIT_SLEEP_DAY_COLLECTION,
  HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION,
} from "../../domain/services/HealthKitSleepContract.js";
import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

export function createPostgresHealthKitSleepEvidenceReadStore({ pool } = {}) {
  if (!pool?.query) throw new Error("Sleep Evidence storage requires PostgreSQL.");
  const records = createPhase4CanonicalRecordStore({ query: (text, values) => pool.query(text, values) });
  return Object.freeze({
    async listDays({ ownerUserId, startDate, endDate }) {
      const [prospective, historical] = await Promise.all([
        records.listByOccurrenceDateRange({ ownerUserId, collection: HEALTHKIT_SLEEP_DAY_COLLECTION, startDate, endDate }),
        records.listByOccurrenceDateRange({ ownerUserId, collection: HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION, startDate, endDate }),
      ]);
      return Object.freeze([...historical, ...prospective]);
    },
  });
}
