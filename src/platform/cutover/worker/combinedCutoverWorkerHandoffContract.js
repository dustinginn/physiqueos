// Shared error codes for the Phase 6C combined-cutover WORKER HANDOFF (phase N/O). Reuses the
// transfer contract's identifier validators and several error codes by value, exactly like the
// handoff/preparation contracts do, so operation IDs and SHA-256 digests mean the same thing
// everywhere in the combined-cutover source tree.
export const WorkerHandoffErrorCode = Object.freeze({
  IDENTITY_INVALID: "TRANSFER_IDENTITY_INVALID",
  OPERATION_FORBIDDEN: "TRANSFER_OPERATION_FORBIDDEN",
  RECEIPT_UNAVAILABLE: "TRANSFER_RECEIPT_UNAVAILABLE",
  PACKAGE_DIGEST_CONFLICT: "TRANSFER_PACKAGE_DIGEST_CONFLICT",
  // New to the worker-handoff phase.
  AUTHORITY_STATE_REJECTED: "WORKER_HANDOFF_AUTHORITY_STATE_REJECTED",
  BOUNDARY_NOT_YET_CROSSED: "WORKER_HANDOFF_BOUNDARY_NOT_YET_CROSSED",
  DEPLOYMENT_IDENTITY_MISMATCH: "WORKER_HANDOFF_DEPLOYMENT_IDENTITY_MISMATCH",
  ACTIVATION_FAILED: "WORKER_HANDOFF_ACTIVATION_FAILED",
  VERIFICATION_AMBIGUOUS: "WORKER_HANDOFF_VERIFICATION_AMBIGUOUS",
  RETIREMENT_FAILED: "WORKER_HANDOFF_RETIREMENT_FAILED",
});

export function workerHandoffError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}
