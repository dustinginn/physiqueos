// Machine-to-machine authentication for the combined-cutover PREPARATION channel (import, parity,
// provider-prepared acknowledgement).
//
// A SEPARATE CREDENTIAL FROM PHASE 3's TRANSFER CHANNEL, ON PURPOSE. The transfer credential
// (`../transfer/combinedCutoverTransferAuth.js`) is documented as authorizing byte transfer only.
// Import genuinely writes into the real target Postgres canonical tables; parity and acknowledgement
// read that state and gate the provider-prepared eligibility decision. Least-privilege blast radius
// says a leaked transfer credential must not be usable to trigger a canonical import, so this is a
// distinct short-lived, operation-bound credential in its own environment namespace, verified with
// the exact same `hashHighEntropyCredential`/`verifyHighEntropyCredential` primitive
// (`src/platform/auth/credentialHash.js`) Phase 3 already established for this purpose - reusing the
// pattern, not inventing a new one, while keeping the two capabilities independently revocable.
//
// SEPARATE FROM THE FOUNDER ACCESS GATE, exactly like the transfer channel: a Founder browser
// session grants no preparation capability, and this credential grants no product access.
//
// FAIL CLOSED. Missing or malformed configuration disables the whole channel
// (`TRANSFER_NOT_CONFIGURED`) rather than degrading to unauthenticated. Authentication never
// substitutes for operation/package/digest validation; every authenticated request is still fully
// validated by the underlying import/parity/acknowledge services.

import { verifyHighEntropyCredential } from "../../auth/credentialHash.js";
import { TransferErrorCode, requireTransferOperationId, transferError } from "../transfer/combinedCutoverTransferContract.js";

const CREDENTIAL_HASH_PATTERN = /^hmac-sha256:v1:[a-f0-9]{64}$/;
const MINIMUM_PEPPER_LENGTH = 32;

export function readCombinedCutoverPreparationAuthConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED === "1";
  if (!enabled) return Object.freeze({ enabled: false });
  const operationId = String(env.PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_OPERATION_ID ?? "").trim();
  const credentialHash = String(env.PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_HASH ?? "").trim();
  const expiresAt = String(env.PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_CREDENTIAL_EXPIRES_AT ?? "").trim();
  const pepper = String(env.PHYSIQUEOS_CREDENTIAL_PEPPER ?? "");
  const configured = Boolean(operationId)
    && CREDENTIAL_HASH_PATTERN.test(credentialHash)
    && pepper.length >= MINIMUM_PEPPER_LENGTH
    && Number.isFinite(Date.parse(expiresAt));
  return Object.freeze({ enabled: true, configured, operationId, credentialHash, expiresAt, pepper });
}

export function isCombinedCutoverPreparationEnabled(env = process.env) {
  return env.PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED === "1";
}

/**
 * Verifies the machine credential and its operation binding. Returns only the bound operation ID;
 * the credential itself is never returned, echoed, or logged.
 */
export function authenticateCombinedCutoverPreparation({
  authorizationHeader,
  requestedOperationId,
  config,
  now = () => new Date(),
} = {}) {
  if (!config?.enabled || !config.configured) {
    throw transferError(TransferErrorCode.NOT_CONFIGURED, "The combined-cutover preparation channel is not configured.");
  }
  const match = /^Bearer ([\x21-\x7e]+)$/.exec(String(authorizationHeader ?? ""));
  if (!match) throw transferError(TransferErrorCode.AUTHENTICATION_REQUIRED, "A machine preparation credential is required.");
  let accepted = false;
  try {
    accepted = verifyHighEntropyCredential(match[1], config.credentialHash, { pepper: config.pepper });
  } catch {
    accepted = false;
  }
  if (!accepted) throw transferError(TransferErrorCode.AUTHENTICATION_FAILED, "The machine preparation credential was rejected.");
  if (Date.parse(config.expiresAt) <= now().getTime()) {
    throw transferError(TransferErrorCode.CREDENTIAL_EXPIRED, "The machine preparation credential has expired.");
  }
  const boundOperationId = requireTransferOperationId(config.operationId);
  if (requireTransferOperationId(requestedOperationId) !== boundOperationId) {
    throw transferError(TransferErrorCode.OPERATION_FORBIDDEN, "The machine preparation credential is bound to a different cutover operation.");
  }
  return Object.freeze({ operationId: boundOperationId });
}
