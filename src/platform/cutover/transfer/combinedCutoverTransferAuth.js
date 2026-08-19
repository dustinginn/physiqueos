// Machine-to-machine authentication for the combined-cutover transfer channel.
//
// SEPARATE FROM THE FOUNDER ACCESS GATE. `src/platform/accessGate` authenticates a human Founder
// browser session with a signed cookie. This credential authenticates the Windows cutover client
// process. Neither can substitute for the other: a Founder session grants no transfer capability,
// and this credential grants no product access. The two secrets are distinct environment values.
//
// SHAPE. The provider holds only the HMAC of the credential, computed with the existing server-only
// credential pepper through `hashHighEntropyCredential` (`src/platform/auth/credentialHash.js`), so
// the plaintext credential never exists in the provider environment, image, or logs. The Windows
// client holds the plaintext.
//
// NARROW BY CONSTRUCTION. The credential is bound to exactly one migration operation and carries an
// explicit expiry, so it is operation-bound, short-lived, and revocable by clearing or replacing one
// environment value. It authorizes byte transfer only; it can never import canonical data, move
// authority, enable writes, or switch routing.
//
// FAIL CLOSED. Any missing or malformed configuration disables the channel entirely
// (`TRANSFER_NOT_CONFIGURED`) rather than degrading to an unauthenticated one. Transport
// authentication never substitutes for operation, package, and digest validation; every
// authenticated request is still fully validated by the transfer service.

import { verifyHighEntropyCredential } from "../../auth/credentialHash.js";
import {
  TransferErrorCode,
  requireTransferOperationId,
  transferError,
} from "./combinedCutoverTransferContract.js";

const CREDENTIAL_HASH_PATTERN = /^hmac-sha256:v1:[a-f0-9]{64}$/;
const MINIMUM_PEPPER_LENGTH = 32;

export function readCombinedCutoverTransferAuthConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_ENABLED === "1";
  if (!enabled) return Object.freeze({ enabled: false });
  const operationId = String(env.PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_OPERATION_ID ?? "").trim();
  const credentialHash = String(env.PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_CREDENTIAL_HASH ?? "").trim();
  const expiresAt = String(env.PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_CREDENTIAL_EXPIRES_AT ?? "").trim();
  const pepper = String(env.PHYSIQUEOS_CREDENTIAL_PEPPER ?? "");
  const configured = Boolean(operationId)
    && CREDENTIAL_HASH_PATTERN.test(credentialHash)
    && pepper.length >= MINIMUM_PEPPER_LENGTH
    && Number.isFinite(Date.parse(expiresAt));
  return Object.freeze({ enabled: true, configured, operationId, credentialHash, expiresAt, pepper });
}

export function isCombinedCutoverTransferEnabled(env = process.env) {
  return env.PHYSIQUEOS_COMBINED_CUTOVER_TRANSFER_ENABLED === "1";
}

/**
 * Verifies the machine credential and its operation binding. Returns only the bound operation ID;
 * the credential itself is never returned, echoed, or logged.
 */
export function authenticateCombinedCutoverTransfer({
  authorizationHeader,
  requestedOperationId,
  config,
  now = () => new Date(),
} = {}) {
  if (!config?.enabled || !config.configured) {
    throw transferError(TransferErrorCode.NOT_CONFIGURED, "The combined-cutover transfer channel is not configured.");
  }
  const match = /^Bearer ([\x21-\x7e]+)$/.exec(String(authorizationHeader ?? ""));
  if (!match) throw transferError(TransferErrorCode.AUTHENTICATION_REQUIRED, "A machine transfer credential is required.");
  let accepted = false;
  try {
    accepted = verifyHighEntropyCredential(match[1], config.credentialHash, { pepper: config.pepper });
  } catch {
    accepted = false;
  }
  if (!accepted) throw transferError(TransferErrorCode.AUTHENTICATION_FAILED, "The machine transfer credential was rejected.");
  if (Date.parse(config.expiresAt) <= now().getTime()) {
    throw transferError(TransferErrorCode.CREDENTIAL_EXPIRED, "The machine transfer credential has expired.");
  }
  const boundOperationId = requireTransferOperationId(config.operationId);
  if (requireTransferOperationId(requestedOperationId) !== boundOperationId) {
    throw transferError(TransferErrorCode.OPERATION_FORBIDDEN, "The machine transfer credential is bound to a different cutover operation.");
  }
  return Object.freeze({ operationId: boundOperationId });
}
