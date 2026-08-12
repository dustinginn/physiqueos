import { ApplicationProblem } from "../../contracts/v1/problem.js";

export const PIN_LENGTH = 8;
export const PIN_RECOVERY_THRESHOLD = 10;
const DELAYS_SECONDS = Object.freeze([0, 0, 1, 5, 30, 60, 300, 900, 3600, 21600]);

export function validateLocalPinShape(pin) {
  if (!/^\d{8}$/.test(String(pin ?? ""))) {
    throw new ApplicationProblem({ status: 400, code: "PIN_FORMAT_INVALID", title: "The local PIN must contain exactly eight digits." });
  }
  return true;
}

export function advancePinFailureState(previous = {}, { now = new Date() } = {}) {
  const failureCount = Math.max(0, Number(previous.failureCount ?? 0)) + 1;
  const recoveryRequired = failureCount >= PIN_RECOVERY_THRESHOLD;
  const delaySeconds = DELAYS_SECONDS[Math.min(failureCount - 1, DELAYS_SECONDS.length - 1)];
  return Object.freeze({
    failureCount,
    retryAfter: recoveryRequired ? null : new Date(now.getTime() + delaySeconds * 1000).toISOString(),
    recoveryRequired,
    canonicalDataDeleted: false,
  });
}

export function resetPinFailureState({ recoveryCredentialVerified = false } = {}) {
  if (!recoveryCredentialVerified) {
    throw new ApplicationProblem({ status: 403, code: "RECOVERY_CREDENTIAL_REQUIRED", title: "Founder recovery is required before local PIN state can be reset." });
  }
  return Object.freeze({ failureCount: 0, retryAfter: null, recoveryRequired: false, canonicalDataDeleted: false });
}
