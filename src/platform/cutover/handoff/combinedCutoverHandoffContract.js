// Shared identifiers, error codes, and HTTP status mapping for the combined-cutover
// AUTHORITY/ROUTING HANDOFF phase. Reuses the transfer contract's identifier validators and several
// error codes by value, exactly like Phase 4's preparation contract does, so operation IDs and
// SHA-256 digests mean the same thing everywhere in the combined-cutover source tree.

export const COMBINED_CUTOVER_HANDOFF_ROUTE_PREFIX = "/api/v1/operations/combined-cutover/handoff";

export const HandoffErrorCode = Object.freeze({
  NOT_CONFIGURED: "TRANSFER_NOT_CONFIGURED",
  AUTHENTICATION_REQUIRED: "TRANSFER_AUTHENTICATION_REQUIRED",
  AUTHENTICATION_FAILED: "TRANSFER_AUTHENTICATION_FAILED",
  CREDENTIAL_EXPIRED: "TRANSFER_CREDENTIAL_EXPIRED",
  OPERATION_FORBIDDEN: "TRANSFER_OPERATION_FORBIDDEN",
  IDENTITY_INVALID: "TRANSFER_IDENTITY_INVALID",
  RECEIPT_UNAVAILABLE: "TRANSFER_RECEIPT_UNAVAILABLE",
  PACKAGE_DIGEST_CONFLICT: "TRANSFER_PACKAGE_DIGEST_CONFLICT",
  // New to the handoff phase.
  AUTHORITY_STATE_REJECTED: "HANDOFF_AUTHORITY_STATE_REJECTED",
  PREPARATION_NOT_ELIGIBLE: "HANDOFF_PREPARATION_NOT_ELIGIBLE",
  CONFLICTING_OPERATION: "HANDOFF_CONFLICTING_OPERATION",
  ROUTING_FAILED: "HANDOFF_ROUTING_FAILED",
  ROUTING_VERIFICATION_AMBIGUOUS: "HANDOFF_ROUTING_VERIFICATION_AMBIGUOUS",
});

export function handoffError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}
