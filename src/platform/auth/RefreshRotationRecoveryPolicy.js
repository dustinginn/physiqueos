import { timingSafeEqual } from "node:crypto";

/**
 * Architecture model for retry-safe refresh rotation.
 *
 * This module is deliberately not wired into FounderAuthService yet. The
 * deployed server and accepted Native client live on lineages that are not
 * present in this worktree. Keeping this as a pure decision function lets the
 * replay invariants be reviewed and tested before a schema/API migration is
 * integrated into those authoritative branches.
 */

export const RefreshRotationDecision = Object.freeze({
  ROTATE: "rotate",
  REPLAY_EXACT_RESPONSE: "replay_exact_response",
  REVOKE_FAMILY: "revoke_family",
  REJECT_REVOKED: "reject_revoked",
  REJECT_EXPIRED: "reject_expired",
});

export const RefreshRotationReason = Object.freeze({
  CURRENT_UNUSED: "current_unused",
  EXACT_ATTEMPT_RETRY: "exact_attempt_retry",
  CREDENTIAL_OR_AUTHORITY_REVOKED: "credential_or_authority_revoked",
  CREDENTIAL_EXPIRED: "credential_expired",
  ATTEMPT_MISMATCH: "attempt_mismatch",
  RETRY_WINDOW_EXPIRED: "retry_window_expired",
  SUCCESSOR_UNAVAILABLE: "successor_unavailable",
  SUCCESSOR_USED: "successor_used",
  SUCCESSOR_AUTHORITY_MISMATCH: "successor_authority_mismatch",
  ACCESS_RESPONSE_UNAVAILABLE: "access_response_unavailable",
});

export const DEFAULT_EXACT_RETRY_WINDOW_MS = 2 * 60 * 1000;

/**
 * Classifies one refresh request using server-observable state only.
 *
 * Raw credentials are intentionally absent from this API. `attemptDigest` is
 * the server-held digest of a random client attempt identifier persisted
 * before the first request. An exact retry returns the already-issued response;
 * it never creates another successor and never accepts a different attempt.
 */
export function classifyRefreshRotation({
  current,
  successor = null,
  accessResponse = null,
  presentedAttemptDigest,
  now,
  retryWindowMs = DEFAULT_EXACT_RETRY_WINDOW_MS,
}) {
  assertInputs({ current, presentedAttemptDigest, now, retryWindowMs });

  if (current.revokedAt || current.sessionStatus !== "active" || current.deviceStatus !== "active") {
    return decision(RefreshRotationDecision.REJECT_REVOKED, RefreshRotationReason.CREDENTIAL_OR_AUTHORITY_REVOKED);
  }

  if (isAtOrAfter(now, current.idleExpiresAt) || isAtOrAfter(now, current.absoluteExpiresAt)) {
    return decision(RefreshRotationDecision.REJECT_EXPIRED, RefreshRotationReason.CREDENTIAL_EXPIRED);
  }

  if (!current.usedAt) {
    return decision(RefreshRotationDecision.ROTATE, RefreshRotationReason.CURRENT_UNUSED);
  }

  if (!current.rotationAttemptDigest || !secureEqual(presentedAttemptDigest, current.rotationAttemptDigest)) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.ATTEMPT_MISMATCH);
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

  if (!accessResponse || accessResponse.revokedAt || accessResponse.id !== current.rotationAccessCredentialId ||
      !sameAuthority(current, accessResponse) || isAtOrAfter(now, accessResponse.expiresAt)) {
    return decision(RefreshRotationDecision.REVOKE_FAMILY, RefreshRotationReason.ACCESS_RESPONSE_UNAVAILABLE);
  }

  return decision(RefreshRotationDecision.REPLAY_EXACT_RESPONSE, RefreshRotationReason.EXACT_ATTEMPT_RETRY);
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

function assertInputs({ current, presentedAttemptDigest, now, retryWindowMs }) {
  if (!current || typeof current !== "object") throw new Error("Current refresh state is required.");
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("A valid server time is required.");
  if (!Number.isSafeInteger(retryWindowMs) || retryWindowMs <= 0) throw new Error("A positive retry window is required.");
  if (typeof presentedAttemptDigest !== "string" || presentedAttemptDigest.length < 32) {
    throw new Error("A high-entropy refresh-attempt digest is required.");
  }
  for (const field of ["id", "userId", "deviceId", "sessionId", "familyId"]) {
    if (typeof current[field] !== "string" || !current[field]) throw new Error(`current.${field} is required.`);
  }
}

function decision(action, reason) {
  return Object.freeze({ action, reason });
}
