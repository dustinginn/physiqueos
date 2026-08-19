// Shared identifiers, error codes, and HTTP status mapping for the combined-cutover PREPARATION
// phase (import, parity, provider-prepared acknowledgement). Deliberately reuses the identifier
// validators and several error codes from the Phase 3 transfer contract
// (`../transfer/combinedCutoverTransferContract.js`) rather than redefining them, since operation
// IDs and SHA-256 digests mean exactly the same thing here as they do there.

export const COMBINED_CUTOVER_PREPARATION_CONTRACT = "combined-cutover-preparation-v1";
export const COMBINED_CUTOVER_PREPARATION_ROUTE_PREFIX = "/api/v1/operations/combined-cutover/prepare";

export const PreparationErrorCode = Object.freeze({
  // Shared with the transfer contract by value, so a single HTTP status map covers both layers.
  NOT_CONFIGURED: "TRANSFER_NOT_CONFIGURED",
  AUTHENTICATION_REQUIRED: "TRANSFER_AUTHENTICATION_REQUIRED",
  AUTHENTICATION_FAILED: "TRANSFER_AUTHENTICATION_FAILED",
  CREDENTIAL_EXPIRED: "TRANSFER_CREDENTIAL_EXPIRED",
  OPERATION_FORBIDDEN: "TRANSFER_OPERATION_FORBIDDEN",
  IDENTITY_INVALID: "TRANSFER_IDENTITY_INVALID",
  CONTENT_TYPE_REQUIRED: "TRANSFER_CONTENT_TYPE_REQUIRED",
  PAYLOAD_TOO_LARGE: "TRANSFER_PAYLOAD_TOO_LARGE",
  RECEIPT_UNAVAILABLE: "TRANSFER_RECEIPT_UNAVAILABLE",
  PACKAGE_DIGEST_CONFLICT: "TRANSFER_PACKAGE_DIGEST_CONFLICT",
  INCOMPLETE: "TRANSFER_INCOMPLETE",
  PACKAGE_IDENTITY_MISMATCH: "TRANSFER_PACKAGE_IDENTITY_MISMATCH",
  // New to the preparation phase.
  TRANSFER_NOT_VERIFIED: "PREPARATION_TRANSFER_NOT_VERIFIED",
  IMPORT_NOT_READY: "PREPARATION_IMPORT_NOT_READY",
  IMPORT_FAILED: "PREPARATION_IMPORT_FAILED",
  MEDIA_IMPORT_FAILED: "PREPARATION_MEDIA_IMPORT_FAILED",
  PARITY_NOT_READY: "PREPARATION_PARITY_NOT_READY",
  PARITY_MISMATCH: "PREPARATION_PARITY_MISMATCH",
  MEDIA_PARITY_MISMATCH: "PREPARATION_MEDIA_PARITY_MISMATCH",
  ACKNOWLEDGE_NOT_ELIGIBLE: "PREPARATION_ACKNOWLEDGE_NOT_ELIGIBLE",
  AUTHORITY_STATE_REJECTED: "PREPARATION_AUTHORITY_STATE_REJECTED",
  TRANSPORT_FAILED: "PREPARATION_TRANSPORT_FAILED",
});

const RETRYABLE_CODES = new Set([
  PreparationErrorCode.TRANSPORT_FAILED,
]);

export function isRetryablePreparationFailure(code) {
  return RETRYABLE_CODES.has(String(code ?? ""));
}

export function preparationError(code, message, { retryable = RETRYABLE_CODES.has(code) } = {}) {
  return Object.assign(new Error(message), { code, retryable });
}
