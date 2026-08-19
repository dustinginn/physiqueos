// Transport-agnostic service boundary for the combined-cutover PREPARATION channel (import, parity,
// provider-prepared acknowledgement, status). HTTP route handlers under
// `src/app/api/v1/operations/combined-cutover/prepare/**` are a thin translation layer over this
// module, mirroring `combinedCutoverTransferService.js`'s pattern from Phase 3.
//
// Every method authenticates first via `authenticateCombinedCutoverPreparation`, and authentication
// binds only the operation ID - it never substitutes for the deeper checks each underlying service
// performs (verified transfer, successful prior phases, correct authority state). Responses never
// include payload contents, credentials, staging keys, or raw Windows/Spaces paths - only status,
// counts, digests, and bounded non-dumping diagnostics.

import { authenticateCombinedCutoverPreparation } from "./combinedCutoverPreparationAuth.js";
import { PreparationErrorCode } from "./combinedCutoverPreparationContract.js";

const HTTP_STATUS_BY_CODE = Object.freeze({
  [PreparationErrorCode.NOT_CONFIGURED]: 503,
  [PreparationErrorCode.AUTHENTICATION_REQUIRED]: 401,
  [PreparationErrorCode.AUTHENTICATION_FAILED]: 401,
  [PreparationErrorCode.CREDENTIAL_EXPIRED]: 401,
  [PreparationErrorCode.OPERATION_FORBIDDEN]: 403,
  [PreparationErrorCode.IDENTITY_INVALID]: 400,
  [PreparationErrorCode.CONTENT_TYPE_REQUIRED]: 400,
  [PreparationErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [PreparationErrorCode.RECEIPT_UNAVAILABLE]: 404,
  [PreparationErrorCode.PACKAGE_DIGEST_CONFLICT]: 409,
  [PreparationErrorCode.INCOMPLETE]: 409,
  [PreparationErrorCode.PACKAGE_IDENTITY_MISMATCH]: 409,
  [PreparationErrorCode.TRANSFER_NOT_VERIFIED]: 409,
  [PreparationErrorCode.IMPORT_NOT_READY]: 409,
  [PreparationErrorCode.IMPORT_FAILED]: 422,
  [PreparationErrorCode.MEDIA_IMPORT_FAILED]: 422,
  [PreparationErrorCode.PARITY_NOT_READY]: 409,
  [PreparationErrorCode.PARITY_MISMATCH]: 422,
  [PreparationErrorCode.MEDIA_PARITY_MISMATCH]: 422,
  [PreparationErrorCode.ACKNOWLEDGE_NOT_ELIGIBLE]: 409,
  [PreparationErrorCode.AUTHORITY_STATE_REJECTED]: 409,
  [PreparationErrorCode.TRANSPORT_FAILED]: 502,
  TRANSFER_RECEIPT_UNAVAILABLE: 404,
});

export function combinedCutoverPreparationHttpStatus(code) {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

export function createCombinedCutoverPreparationService({
  importService, parityService, acknowledgeService, preparationStore, authConfig, now = () => new Date(),
} = {}) {
  if (!importService?.import) throw new Error("The preparation service requires the import service.");
  if (!parityService?.verifyParity) throw new Error("The preparation service requires the parity service.");
  if (!acknowledgeService?.acknowledge) throw new Error("The preparation service requires the acknowledge service.");
  if (!preparationStore?.read) throw new Error("The preparation service requires the durable preparation evidence store.");

  return Object.freeze({
    async import({ authorizationHeader, payload }) {
      return handle(async () => {
        authenticateCombinedCutoverPreparation({ authorizationHeader, requestedOperationId: payload?.migrationOperationId, config: authConfig, now });
        const result = await importService.import(payload ?? {});
        return { status: 200, body: publicImportResult(result) };
      });
    },

    async parity({ authorizationHeader, payload }) {
      return handle(async () => {
        authenticateCombinedCutoverPreparation({ authorizationHeader, requestedOperationId: payload?.migrationOperationId, config: authConfig, now });
        const result = await parityService.verifyParity(payload ?? {});
        return { status: 200, body: publicParityResult(result) };
      });
    },

    async acknowledge({ authorizationHeader, payload }) {
      return handle(async () => {
        authenticateCombinedCutoverPreparation({ authorizationHeader, requestedOperationId: payload?.migrationOperationId, config: authConfig, now });
        const result = await acknowledgeService.acknowledge(payload ?? {});
        return { status: 200, body: result };
      });
    },

    async status({ authorizationHeader, operationId }) {
      return handle(async () => {
        authenticateCombinedCutoverPreparation({ authorizationHeader, requestedOperationId: operationId, config: authConfig, now });
        const { receipt } = await preparationStore.read(operationId);
        return { status: 200, body: publicStatus(receipt) };
      });
    },
  });
}

async function handle(operation) {
  try {
    return await operation();
  } catch (error) {
    const code = /^[A-Z0-9_]{3,80}$/.test(String(error?.code ?? "")) ? error.code : "PREPARATION_INTERNAL_ERROR";
    const body = { code };
    if (error?.parityDiagnostic) body.parityDiagnostic = error.parityDiagnostic;
    return { status: combinedCutoverPreparationHttpStatus(code), body };
  }
}

function publicImportResult(result) {
  return Object.freeze({
    ready: result.ready, outcome: result.outcome, records: result.records,
    collectionCounts: result.collectionCounts, mediaObjectCount: result.mediaObjectCount,
  });
}

function publicParityResult(result) {
  return Object.freeze({
    ready: result.ready, outcome: result.outcome, readParity: result.readParity,
    commandReadiness: result.commandReadiness, mediaValidated: result.mediaValidated,
  });
}

function publicStatus(receipt) {
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    operationId: receipt.operationId,
    packageDigest: receipt.packageDigest,
    importStatus: receipt.importStatus,
    importedCollectionCounts: receipt.importedCollectionCounts,
    mediaStatus: receipt.mediaStatus,
    mediaObjectCount: receipt.mediaObjectCount,
    parityStatus: receipt.parityStatus,
    preparedStatus: receipt.preparedStatus,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
  });
}
