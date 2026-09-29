import { timingSafeEqual } from "node:crypto";

/**
 * Non-production architecture model for sender-constrained refresh recovery.
 *
 * This is deliberately not wired into FounderAuthService. The model makes a
 * bearer-only grace period unrepresentable: normal rotation and lost-reply
 * recovery both require a fresh proof from the enrolled installation key.
 */

export const RefreshRotationDecision = Object.freeze({
  ROTATE: "rotate",
  RECOVER_LOST_REPLY: "recover_lost_reply",
  REVOKE_FAMILY: "revoke_family",
  REJECT_DEVICE_PROOF: "reject_device_proof",
  REQUIRE_REAUTHORIZATION: "require_reauthorization",
  REJECT_REVOKED: "reject_revoked",
  REJECT_EXPIRED: "reject_expired",
});

export const RefreshRotationReason = Object.freeze({
  CURRENT_UNUSED: "current_unused",
  EXACT_DEVICE_BOUND_INTENT_RETRY: "exact_device_bound_intent_retry",
  CREDENTIAL_OR_AUTHORITY_REVOKED: "credential_or_authority_revoked",
  CREDENTIAL_EXPIRED: "credential_expired",
  DEVICE_PROOF_INVALID: "device_proof_invalid",
  INTENT_MISMATCH: "intent_mismatch",
  SUCCESSOR_COMMITMENT_MISMATCH: "successor_commitment_mismatch",
  RETRY_WINDOW_EXPIRED: "retry_window_expired",
  SUCCESSOR_UNAVAILABLE: "successor_unavailable",
  SUCCESSOR_USED: "successor_used",
  SUCCESSOR_AUTHORITY_MISMATCH: "successor_authority_mismatch",
  ACCESS_RESPONSE_UNAVAILABLE: "access_response_unavailable",
  EXCHANGE_ACCESS_USED: "exchange_access_used",
  RECOVERY_ATTEMPTS_EXHAUSTED: "recovery_attempts_exhausted",
});

export const DEFAULT_EXACT_RETRY_WINDOW_MS = 2 * 60 * 1000;
export const DEFAULT_MAXIMUM_RECOVERY_ATTEMPTS = 2;

/**
 * Classifies one refresh presentation using Server-observable state only.
 *
 * `presentedIntentDigest` and `presentedSuccessorCommitment` are digests of
 * Native state committed before the first request. `proof` represents a fresh
 * application-level signature over the method, canonical URL, body digest,
 * intent, successor commitment, Server nonce, and unique proof ID. A captured
 * request cannot be replayed because its nonce/proof ID are no longer fresh,
 * and an attacker cannot construct a new proof without the enrolled private
 * key.
 */
export function classifyRefreshRotation({
  current,
  successor = null,
  exchangeAccessResponses = [],
  proof,
  presentedIntentDigest,
  presentedSuccessorCommitment,
  now,
  retryWindowMs = DEFAULT_EXACT_RETRY_WINDOW_MS,
  recoveryAttemptCount = 0,
  maximumRecoveryAttempts = DEFAULT_MAXIMUM_RECOVERY_ATTEMPTS,
}) {
  assertInputs({
    current,
    proof,
    presentedIntentDigest,
    presentedSuccessorCommitment,
    now,
    retryWindowMs,
    recoveryAttemptCount,
    maximumRecoveryAttempts,
  });

  if (current.revokedAt || current.sessionStatus !== "active" || current.deviceStatus !== "active") {
    return decision(RefreshRotationDecision.REJECT_REVOKED, RefreshRotationReason.CREDENTIAL_OR_AUTHORITY_REVOKED);
  }

  if (isAtOrAfter(now, current.idleExpiresAt) || isAtOrAfter(now, current.absoluteExpiresAt)) {
    return decision(RefreshRotationDecision.REJECT_EXPIRED, RefreshRotationReason.CREDENTIAL_EXPIRED);
  }

  if (!proof.valid || !proof.keyMatchesDevice || !proof.serverNonceFresh || !proof.proofIdFresh) {
    return decision(RefreshRotationDecision.REJECT_DEVICE_PROOF, RefreshRotationReason.DEVICE_PROOF_INVALID);
  }

  if (!current.usedAt) {
    return decision(RefreshRotationDecision.ROTATE, RefreshRotationReason.CURRENT_UNUSED);
  }

  if (!current.rotationIntentDigest || !secureEqual(presentedIntentDigest, current.rotationIntentDigest)) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.INTENT_MISMATCH);
  }

  if (!current.successorCommitment || !secureEqual(presentedSuccessorCommitment, current.successorCommitment)) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.SUCCESSOR_COMMITMENT_MISMATCH);
  }

  const retryAgeMs = now.getTime() - asDate(current.usedAt, "current.usedAt").getTime();
  if (retryAgeMs < 0 || retryAgeMs > retryWindowMs) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.RETRY_WINDOW_EXPIRED);
  }

  if (!successor || successor.id !== current.replacedById || successor.revokedAt) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.SUCCESSOR_UNAVAILABLE);
  }

  if (!sameAuthority(current, successor)) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.SUCCESSOR_AUTHORITY_MISMATCH);
  }

  if (successor.usedAt) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.SUCCESSOR_USED);
  }

  const expectedAccessIds = current.exchangeAccessCredentialIds;
  if (!Array.isArray(expectedAccessIds) || expectedAccessIds.length === 0 ||
      !Array.isArray(exchangeAccessResponses) || exchangeAccessResponses.length !== expectedAccessIds.length ||
      exchangeAccessResponses.some((access) => !expectedAccessIds.includes(access.id) || !sameAuthority(current, access))) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.ACCESS_RESPONSE_UNAVAILABLE);
  }

  if (exchangeAccessResponses.some((access) => access.firstUsedAt)) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.EXCHANGE_ACCESS_USED);
  }

  if (recoveryAttemptCount >= maximumRecoveryAttempts) {
    return decision(RefreshRotationDecision.REQUIRE_REAUTHORIZATION, RefreshRotationReason.RECOVERY_ATTEMPTS_EXHAUSTED);
  }

  return decision(RefreshRotationDecision.RECOVER_LOST_REPLY, RefreshRotationReason.EXACT_DEVICE_BOUND_INTENT_RETRY);
}

/** Face ID/passcode controls local presentation only, never Server state. */
export function classifyLocalUnlock({ devicePasscodeSet, result }) {
  if (!devicePasscodeSet) return Object.freeze({ ui: "security_setup_required", serverSession: "unchanged" });
  if (result === "success" || result === "passcode_success") {
    return Object.freeze({ ui: "unlocked", serverSession: "unchanged" });
  }
  return Object.freeze({ ui: "locked", serverSession: "unchanged" });
}

export function classifyRecoverySurface({ hasLocalSession, hasPendingRotation, serverState, networkAvailable = true }) {
  if (!hasLocalSession) return "unpaired";
  if (["revoked", "expired", "recovery_exhausted"].includes(serverState)) return "reconnect_required";
  if (!networkAvailable) return "offline_last_known";
  if (hasPendingRotation) return "recovering_session";
  return "authenticated";
}

function sameAuthority(left, right) {
  return left.userId === right.userId &&
    left.deviceId === right.deviceId &&
    left.sessionId === right.sessionId &&
    left.familyId === right.familyId;
}

function secureEqual(left, right) {
  const leftBytes = Buffer.from(String(left), "utf8");
  const rightBytes = Buffer.from(String(right), "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isAtOrAfter(now, value) {
  return now >= asDate(value, "expiry");
}

function asDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function assertInputs({
  current,
  proof,
  presentedIntentDigest,
  presentedSuccessorCommitment,
  now,
  retryWindowMs,
  recoveryAttemptCount,
  maximumRecoveryAttempts,
}) {
  if (!current || typeof current !== "object") throw new Error("Current refresh state is required.");
  if (!proof || typeof proof !== "object") throw new Error("A device-bound proof result is required.");
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("A valid server time is required.");
  if (!Number.isSafeInteger(retryWindowMs) || retryWindowMs <= 0) throw new Error("A positive retry window is required.");
  if (!Number.isSafeInteger(recoveryAttemptCount) || recoveryAttemptCount < 0) throw new Error("A valid recovery count is required.");
  if (!Number.isSafeInteger(maximumRecoveryAttempts) || maximumRecoveryAttempts <= 0) throw new Error("A positive recovery limit is required.");
  for (const [label, value] of [
    ["rotation-intent digest", presentedIntentDigest],
    ["successor commitment", presentedSuccessorCommitment],
  ]) {
    if (typeof value !== "string" || value.length < 32) throw new Error(`A high-entropy ${label} is required.`);
  }
  for (const field of ["id", "userId", "deviceId", "sessionId", "familyId"]) {
    if (typeof current[field] !== "string" || !current[field]) throw new Error(`current.${field} is required.`);
  }
}

function decision(action, reason) {
  return Object.freeze({ action, reason });
}
