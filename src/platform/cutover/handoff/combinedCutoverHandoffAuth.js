// Machine-to-machine authentication for the combined-cutover AUTHORITY/ROUTING HANDOFF channel.
//
// A THIRD, DISTINCT CREDENTIAL - NARROWER AND MORE SENSITIVE THAN EITHER PRIOR ONE. Authority
// transfer is more sensitive than transfer/import/parity: a leaked Phase 3 transfer credential can
// move bytes, a leaked Phase 4 preparation credential can trigger a canonical import, but this
// credential authenticates access to evidence about (and, in a real deployment, control over)
// runtime authority itself - the single most consequential state in the whole cutover. It is
// therefore its own environment namespace (`PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_*`), independently
// revocable from both prior credentials, using the exact same
// `hashHighEntropyCredential`/`verifyHighEntropyCredential` primitive
// (`src/platform/auth/credentialHash.js`) every combined-cutover credential in this codebase uses -
// reusing the established pattern, not inventing a new one.
//
// WHAT THIS CREDENTIAL ACTUALLY GATES. There is deliberately no HTTP endpoint that TRIGGERS
// `transferAuthorityAndRoute` - the orchestrator's `commitAuthority` closure is a live JS reference
// that cannot cross a network boundary, so the real transition can only run in-process with the
// orchestrator itself (see `ProductionAuthorityHandoffService.js`'s header for the full reasoning).
// This credential exists only to gate the narrow, read-only status surface
// (`combinedCutoverHandoffService.js`) used for cross-process recovery diagnosis - the smallest
// surface that provides genuine value, per the governing instruction to prefer the narrower surface
// and not build an API "solely because previous phases used one."
//
// SEPARATE FROM THE FOUNDER ACCESS GATE, exactly like the transfer and preparation channels: a
// Founder browser session grants no handoff visibility, and this credential grants no product
// access.
//
// FAIL CLOSED. Missing or malformed configuration disables the whole channel
// (`TRANSFER_NOT_CONFIGURED`) rather than degrading to unauthenticated.

import { verifyHighEntropyCredential } from "../../auth/credentialHash.js";
import { TransferErrorCode, requireTransferOperationId, transferError } from "../transfer/combinedCutoverTransferContract.js";

const CREDENTIAL_HASH_PATTERN = /^hmac-sha256:v1:[a-f0-9]{64}$/;
const MINIMUM_PEPPER_LENGTH = 32;

export function readCombinedCutoverHandoffAuthConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_ENABLED === "1";
  if (!enabled) return Object.freeze({ enabled: false });
  const operationId = String(env.PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_OPERATION_ID ?? "").trim();
  const environment = String(env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT ?? "").trim();
  const credentialHash = String(env.PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_HASH ?? "").trim();
  const expiresAt = String(env.PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_CREDENTIAL_EXPIRES_AT ?? "").trim();
  const pepper = String(env.PHYSIQUEOS_CREDENTIAL_PEPPER ?? "");
  const configured = Boolean(operationId)
    && Boolean(environment)
    && CREDENTIAL_HASH_PATTERN.test(credentialHash)
    && pepper.length >= MINIMUM_PEPPER_LENGTH
    && Number.isFinite(Date.parse(expiresAt));
  return Object.freeze({ enabled: true, configured, operationId, environment, credentialHash, expiresAt, pepper });
}

export function isCombinedCutoverHandoffEnabled(env = process.env) {
  return env.PHYSIQUEOS_COMBINED_CUTOVER_HANDOFF_ENABLED === "1";
}

/**
 * Verifies the machine credential, its operation binding, and (unlike the transfer/preparation
 * credentials) its intended environment binding - authority-handoff evidence is sensitive enough
 * that a credential minted for one environment must never authenticate a request naming another.
 * Returns only the bound operation ID; the credential itself is never returned, echoed, or logged.
 */
export function authenticateCombinedCutoverHandoff({
  authorizationHeader,
  requestedOperationId,
  requestedEnvironment = null,
  config,
  now = () => new Date(),
} = {}) {
  if (!config?.enabled || !config.configured) {
    throw transferError(TransferErrorCode.NOT_CONFIGURED, "The combined-cutover handoff channel is not configured.");
  }
  const match = /^Bearer ([\x21-\x7e]+)$/.exec(String(authorizationHeader ?? ""));
  if (!match) throw transferError(TransferErrorCode.AUTHENTICATION_REQUIRED, "A machine handoff credential is required.");
  let accepted = false;
  try {
    accepted = verifyHighEntropyCredential(match[1], config.credentialHash, { pepper: config.pepper });
  } catch {
    accepted = false;
  }
  if (!accepted) throw transferError(TransferErrorCode.AUTHENTICATION_FAILED, "The machine handoff credential was rejected.");
  if (Date.parse(config.expiresAt) <= now().getTime()) {
    throw transferError(TransferErrorCode.CREDENTIAL_EXPIRED, "The machine handoff credential has expired.");
  }
  const boundOperationId = requireTransferOperationId(config.operationId);
  if (requireTransferOperationId(requestedOperationId) !== boundOperationId) {
    throw transferError(TransferErrorCode.OPERATION_FORBIDDEN, "The machine handoff credential is bound to a different cutover operation.");
  }
  if (requestedEnvironment != null && String(requestedEnvironment) !== config.environment) {
    throw transferError(TransferErrorCode.OPERATION_FORBIDDEN, "The machine handoff credential is bound to a different environment.");
  }
  return Object.freeze({ operationId: boundOperationId, environment: config.environment });
}
