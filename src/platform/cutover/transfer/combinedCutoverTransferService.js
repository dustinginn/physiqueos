// Transport-agnostic service boundary for the combined-cutover transfer channel. HTTP route
// handlers are a thin translation layer over this module (see the sibling `route.js` files under
// `src/app/api/v1/operations/combined-cutover/transfer/`), so every semantic rule below is testable
// without Next.js and is exercised identically regardless of transport.
//
// Every method authenticates first, via `authenticateCombinedCutoverTransfer`, and authentication
// binds only the operation ID - it never substitutes for the operation/package/digest validation
// performed by the receipt store on every call. A valid credential for the wrong operation, package,
// or digest is rejected exactly like an invalid credential would be for the right one.

import {
  authenticateCombinedCutoverTransfer,
  readCombinedCutoverTransferAuthConfig,
} from "./combinedCutoverTransferAuth.js";
import {
  MAXIMUM_TRANSFER_CHUNK_BYTES,
  TransferErrorCode,
  requireTransferInteger,
  requireTransferOperationId,
  requireTransferPackageId,
  transferError,
} from "./combinedCutoverTransferContract.js";

const HTTP_STATUS_BY_CODE = Object.freeze({
  [TransferErrorCode.NOT_CONFIGURED]: 503,
  [TransferErrorCode.AUTHENTICATION_REQUIRED]: 401,
  [TransferErrorCode.AUTHENTICATION_FAILED]: 401,
  [TransferErrorCode.CREDENTIAL_EXPIRED]: 401,
  [TransferErrorCode.OPERATION_FORBIDDEN]: 403,
  [TransferErrorCode.IDENTITY_INVALID]: 400,
  [TransferErrorCode.ROUTE_INVALID]: 400,
  [TransferErrorCode.CONTENT_TYPE_REQUIRED]: 400,
  [TransferErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [TransferErrorCode.CHUNK_RANGE_INVALID]: 400,
  [TransferErrorCode.CHUNK_SIZE_MISMATCH]: 409,
  [TransferErrorCode.CHUNK_DIGEST_MISMATCH]: 409,
  [TransferErrorCode.CHUNK_CONFLICT]: 409,
  [TransferErrorCode.PACKAGE_DIGEST_CONFLICT]: 409,
  [TransferErrorCode.PACKAGE_SIZE_CONFLICT]: 409,
  [TransferErrorCode.CHUNK_COUNT_CONFLICT]: 409,
  [TransferErrorCode.RECEIPT_UNAVAILABLE]: 404,
  [TransferErrorCode.RECEIPT_OPERATION_CONFLICT]: 409,
  [TransferErrorCode.INCOMPLETE]: 409,
  [TransferErrorCode.ASSEMBLED_DIGEST_MISMATCH]: 409,
  [TransferErrorCode.STAGING_UNAVAILABLE]: 503,
  [TransferErrorCode.STAGING_KEY_FORBIDDEN]: 400,
  [TransferErrorCode.PACKAGE_IDENTITY_MISMATCH]: 409,
  [TransferErrorCode.TRANSPORT_FAILED]: 502,
  // Error codes raised directly by the reused operation-level `PostgresCombinedTransferReceiptStore`
  // (migration 000005). Its codes already follow the same `TRANSFER_*` convention, so they are
  // mapped alongside this module's own codes rather than translated.
  TRANSFER_MANIFEST_MISMATCH: 400,
  TRANSFER_MANIFEST_INVALID: 400,
  TRANSFER_OPERATION_CONFLICT: 409,
  TRANSFER_CONTROL_TUPLE_MISMATCH: 409,
  TRANSFER_RECEIPT_STATE_INVALID: 409,
  TRANSFER_VERIFICATION_MISMATCH: 409,
  TRANSFER_VERIFICATION_INCOMPLETE: 409,
});

export function createCombinedCutoverTransferService({ receiptStore, authConfig, now = () => new Date() } = {}) {
  if (!receiptStore) throw new Error("The transfer service requires a receipt store.");

  return Object.freeze({
    async declare({ authorizationHeader, payload }) {
      return handle(async () => {
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: payload?.operationId, config: authConfig, now });
        const result = await receiptStore.declare(payload ?? {});
        return { status: result.outcome === "declared" ? 201 : 200, body: publicReceipt(result.receipt, result.outcome) };
      });
    },

    async receiveChunk({ authorizationHeader, operationId, packageId, chunkIndex, chunkDigest, contentLength, bytes }) {
      return handle(async () => {
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: operationId, config: authConfig, now });
        const declaredLength = requireTransferInteger(contentLength, "contentLength", { minimum: 1, maximum: MAXIMUM_TRANSFER_CHUNK_BYTES });
        if (!bytes || bytes.length !== declaredLength) {
          throw transferError(TransferErrorCode.PAYLOAD_TOO_LARGE, "The chunk body did not match its declared Content-Length.");
        }
        const result = await receiptStore.receiveChunk({
          operationId: requireTransferOperationId(operationId),
          packageId: requireTransferPackageId(packageId),
          chunkIndex,
          chunkDigest,
          bytes,
        });
        return { status: result.outcome === "received" ? 201 : 200, body: { outcome: result.outcome, chunkIndex: result.chunkIndex, receipt: publicReceipt(result.receipt) } };
      });
    },

    async complete({ authorizationHeader, operationId, packageId }) {
      return handle(async () => {
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: operationId, config: authConfig, now });
        const result = await receiptStore.completeAndVerify({
          operationId: requireTransferOperationId(operationId),
          packageId: requireTransferPackageId(packageId),
        });
        return { status: 200, body: publicReceipt(result.receipt, result.outcome) };
      });
    },

    async status({ authorizationHeader, operationId, packageId }) {
      return handle(async () => {
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: operationId, config: authConfig, now });
        const result = await receiptStore.status(requireTransferOperationId(operationId), requireTransferPackageId(packageId));
        return { status: 200, body: publicReceipt(result.receipt) };
      });
    },
  });
}

export function loadCombinedCutoverTransferAuthConfig(env = process.env) {
  return readCombinedCutoverTransferAuthConfig(env);
}

export function combinedCutoverTransferHttpStatus(code) {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

// Shared by this module and `combinedCutoverManifestTransferService.js` so both layers of the
// channel map failures to HTTP responses identically.
export async function handleTransferRequest(operation) {
  try {
    return await operation();
  } catch (error) {
    const code = /^[A-Z0-9_]{3,80}$/.test(String(error?.code ?? "")) ? error.code : "TRANSFER_INTERNAL_ERROR";
    return { status: combinedCutoverTransferHttpStatus(code), body: { code } };
  }
}
const handle = handleTransferRequest;

// Never echoes staged bytes, credentials, staging keys, or Windows/Spaces paths - only the
// caller-supplied identity and byte/status accounting the contract promises.
function publicReceipt(receipt, outcome) {
  if (!receipt) return null;
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    operationId: receipt.operationId,
    packageId: receipt.packageId,
    overallDigest: receipt.overallDigest,
    expectedBytes: receipt.expectedBytes,
    receivedBytes: receipt.receivedBytes,
    expectedChunkCount: receipt.expectedChunkCount,
    receivedChunkCount: receipt.receivedChunkCount,
    status: receipt.status,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    completedAt: receipt.completedAt,
    verifiedAt: receipt.verifiedAt,
    ...(outcome ? { outcome } : {}),
  });
}
