import {
  DEXA_HEALTHKIT_WRITEBACK_POLICY_RECORD_ID,
  DEXA_HEALTHKIT_WRITEBACK_RECEIPT_COLLECTION,
  projectDexaHealthKitWriteback,
} from "../../domain/services/DexaHealthKitWritebackService.js";

export function createDexaHealthKitWritebackReadService({ records, ownerUserId } = {}) {
  if (!records || !ownerUserId) throw new Error("DEXA HealthKit writeback reads require records and owner authority.");
  return Object.freeze({
    async getWriteback({ mode = "permanent", validationAction = null } = {}) {
      if (!['permanent', 'validation'].includes(mode)) throw invalid("mode");
      if (mode === "permanent" && validationAction != null) throw invalid("validationAction");
      const [canonicalEvidenceObjects, executionItems, users, policyRecord, receipts] = await Promise.all([
        records.list({ ownerUserId, collection: "canonicalEvidenceObjects" }),
        records.list({ ownerUserId, collection: "executionItems" }),
        records.list({ ownerUserId, collection: "user" }),
        records.get({ ownerUserId, collection: "healthKitConfiguration", recordId: DEXA_HEALTHKIT_WRITEBACK_POLICY_RECORD_ID }),
        records.list({ ownerUserId, collection: DEXA_HEALTHKIT_WRITEBACK_RECEIPT_COLLECTION }),
      ]);
      return projectDexaHealthKitWriteback({
        canonicalEvidenceObjects,
        executionItems,
        ownerUserId,
        ownerTimeZone: users[0]?.timeZone,
        policyRecord,
        receipts,
        mode,
        validationAction,
      });
    },
  });
}

function invalid(field) {
  return Object.assign(new Error(`DEXA HealthKit writeback ${field} is invalid.`), {
    code: "DEXA_HEALTHKIT_WRITEBACK_REQUEST_INVALID",
  });
}
