// Transport-agnostic, READ-ONLY service boundary for the combined-cutover authority/routing handoff
// channel. Deliberately exposes only status - there is no HTTP endpoint that triggers
// `transferAuthorityAndRoute` (see `ProductionAuthorityHandoffService.js` and
// `combinedCutoverHandoffAuth.js` for why: the orchestrator's `commitAuthority` closure cannot cross
// a network boundary, and the governing instruction prefers the narrowest surface that provides
// genuine value over building an API "solely because previous phases used one").
//
// Authenticates via `authenticateCombinedCutoverHandoff` first, binding both operation ID and
// environment. Never includes payload contents or secrets - only status, digests, and timestamps.

import { authenticateCombinedCutoverHandoff } from "./combinedCutoverHandoffAuth.js";
import { HandoffErrorCode } from "./combinedCutoverHandoffContract.js";

const HTTP_STATUS_BY_CODE = Object.freeze({
  [HandoffErrorCode.NOT_CONFIGURED]: 503,
  [HandoffErrorCode.AUTHENTICATION_REQUIRED]: 401,
  [HandoffErrorCode.AUTHENTICATION_FAILED]: 401,
  [HandoffErrorCode.CREDENTIAL_EXPIRED]: 401,
  [HandoffErrorCode.OPERATION_FORBIDDEN]: 403,
  [HandoffErrorCode.IDENTITY_INVALID]: 400,
  [HandoffErrorCode.RECEIPT_UNAVAILABLE]: 404,
  [HandoffErrorCode.PACKAGE_DIGEST_CONFLICT]: 409,
  [HandoffErrorCode.AUTHORITY_STATE_REJECTED]: 409,
  [HandoffErrorCode.PREPARATION_NOT_ELIGIBLE]: 409,
  [HandoffErrorCode.CONFLICTING_OPERATION]: 409,
  [HandoffErrorCode.ROUTING_FAILED]: 502,
  [HandoffErrorCode.ROUTING_ACTIVATION_AMBIGUOUS]: 502,
  [HandoffErrorCode.ROUTING_VERIFICATION_AMBIGUOUS]: 502,
  TRANSFER_RECEIPT_UNAVAILABLE: 404,
});

export function combinedCutoverHandoffHttpStatus(code) {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

export function createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig, now = () => new Date() } = {}) {
  if (!handoffReceiptStore?.read) throw new Error("The handoff service requires the durable handoff evidence store.");

  return Object.freeze({
    async status({ authorizationHeader, operationId, environment = null }) {
      return handle(async () => {
        authenticateCombinedCutoverHandoff({ authorizationHeader, requestedOperationId: operationId, requestedEnvironment: environment, config: authConfig, now });
        const { receipt } = await handoffReceiptStore.read(operationId);
        return { status: 200, body: publicStatus(receipt) };
      });
    },
  });
}

async function handle(operation) {
  try {
    return await operation();
  } catch (error) {
    const code = /^[A-Z0-9_]{3,80}$/.test(String(error?.code ?? "")) ? error.code : "HANDOFF_INTERNAL_ERROR";
    return { status: combinedCutoverHandoffHttpStatus(code), body: { code } };
  }
}

function publicStatus(receipt) {
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    operationId: receipt.operationId,
    packageDigest: receipt.packageDigest,
    routingTarget: receipt.routingTarget,
    providerDeploymentId: receipt.providerDeploymentId,
    authorityStatus: receipt.authorityStatus,
    resultingAuthority: receipt.resultingAuthority,
    authorityCommittedAt: receipt.authorityCommittedAt,
    routingStatus: receipt.routingStatus,
    routingActivatedAt: receipt.routingActivatedAt,
    routingVerifiedAt: receipt.routingVerifiedAt,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
  });
}
