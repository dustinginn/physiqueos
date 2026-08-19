// Shared error codes for the Phase 6A combined-cutover POST-HANDOFF RECOVERY trio
// (verifyPostHandoff, restoreWindowsAuthority, enterProviderRecovery). Reuses the transfer contract's
// identifier validators by value, exactly like the Phase 4/5 contracts do, so operation IDs and
// SHA-256 digests mean the same thing everywhere in the combined-cutover source tree.

export const RecoveryErrorCode = Object.freeze({
  IDENTITY_INVALID: "TRANSFER_IDENTITY_INVALID",
  CONFLICTING_OPERATION: "RECOVERY_CONFLICTING_OPERATION",
  ROLLBACK_ILLEGAL: "RECOVERY_ROLLBACK_ILLEGAL",
  FORWARD_RECOVERY_NOT_YET_REQUIRED: "RECOVERY_FORWARD_NOT_YET_REQUIRED",
});

export function recoveryError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}
