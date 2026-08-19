// Production-capable `verifyPostHandoff` logic for the combined-cutover orchestrator
// (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase L's third action: "verify that only
// the provider can reach the canonical command boundary").
//
// INDEPENDENT DURABLE VERIFICATION, NOT TRUST IN THE IN-MEMORY HANDOFF RESULT. The orchestrator
// passes this adapter its own in-memory `state` and the `handoff` object `transferAuthorityAndRoute`
// returned. This module ignores both and re-reads durable `combined_runtime_authority` and the
// durable Phase 5 handoff receipt instead, so a bug in a prior step's return value - or a call to
// this service entirely outside the orchestrator, e.g. as a standalone diagnostic - cannot produce a
// false "post-handoff verified" result.
//
// A READ-ONLY SMOKE TEST. This module never writes to `combined_runtime_authority`, never calls
// `claimCanonicalWriteBoundary` (crossing the first-write boundary is a wholly separate, later
// action), never calls routing operations, and never starts a worker. "Provider authority transferred
// and routing verified but firstProviderCanonicalWriteAt still null" is the ordinary, EXPECTED
// successful post-handoff state - it is not a failure - because the first real canonical write is
// intentionally a separate action.
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { requireTransferDigest, requireTransferOperationId, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import { RecoveryErrorCode, recoveryError } from "./combinedCutoverRecoveryContract.js";

export function createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore } = {}) {
  if (!authorityStore?.read) throw new Error("Post-handoff verification requires the runtime-authority store.");
  if (!handoffReceiptStore?.read) throw new Error("Post-handoff verification requires the durable handoff evidence store.");

  return Object.freeze({
    async verifyPostHandoff({ input } = {}) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const fingerprint = requireTransferDigest(input?.authorizationFingerprint, "authorizationFingerprint");

      const durable = (await authorityStore.read()).state;

      if (durable.authority === RuntimeAuthority.WINDOWS_LEGACY) {
        return freeze({ ready: false, classification: "AUTHORITY_NOT_TRANSFERRED", authority: durable.authority, operationId, reason: "Windows retains legacy authority; provider authority has not transferred." });
      }

      // Authority belongs to a different, still-active operation - refuse rather than report on it.
      if (String(durable.migrationOperationId ?? "") !== operationId) {
        throw recoveryError(RecoveryErrorCode.CONFLICTING_OPERATION, "Durable runtime authority belongs to a different combined-cutover operation.");
      }

      if (durable.authority === RuntimeAuthority.RECOVERY_REQUIRED) {
        return freeze({
          ready: false, classification: "RECOVERY_REQUIRED", authority: durable.authority, operationId,
          firstProviderCanonicalWriteAt: durable.firstProviderCanonicalWriteAt,
          reason: "Runtime authority is already recovery-required; post-handoff verification does not apply.",
        });
      }

      if (durable.authority !== RuntimeAuthority.PROVIDER) {
        return freeze({ ready: false, classification: "AUTHORITY_NOT_TRANSFERRED", authority: durable.authority, operationId, reason: "Provider authority has not yet transferred for this operation." });
      }

      if (durable.authorizationFingerprint !== fingerprint) {
        throw recoveryError(RecoveryErrorCode.CONFLICTING_OPERATION, "Durable runtime authority does not match the requested authorization fingerprint.");
      }

      let receipt;
      try {
        ({ receipt } = await handoffReceiptStore.read(operationId));
      } catch (error) {
        if (error?.code === TransferErrorCode.RECEIPT_UNAVAILABLE) {
          return freeze({ ready: false, classification: "ROUTING_PENDING", authority: durable.authority, operationId, reason: "No durable handoff evidence exists yet for this operation." });
        }
        throw error;
      }

      if (receipt.operationId !== operationId || receipt.authorizationFingerprint !== fingerprint) {
        throw recoveryError(RecoveryErrorCode.CONFLICTING_OPERATION, "Durable handoff evidence belongs to a different combined-cutover operation.");
      }
      if (durable.finalSnapshot?.packageDigest && receipt.packageDigest !== durable.finalSnapshot.packageDigest) {
        throw recoveryError(RecoveryErrorCode.CONFLICTING_OPERATION, "Durable handoff evidence package digest does not match the fenced snapshot.");
      }

      if (receipt.routingStatus !== "verified") {
        return freeze({
          ready: false, classification: "ROUTING_PENDING", authority: durable.authority, routingStatus: receipt.routingStatus,
          operationId, reason: "Provider authority transferred but routing has not yet been verified.",
        });
      }

      const classification = durable.firstProviderCanonicalWriteAt != null ? "FIRST_WRITE_BOUNDARY_CROSSED" : "PROVIDER_HANDED_OFF_PRE_WRITE";
      return freeze({
        ready: true, classification, authority: durable.authority, routingStatus: "verified",
        firstProviderCanonicalWriteAt: durable.firstProviderCanonicalWriteAt, operationId,
        providerDeploymentId: receipt.providerDeploymentId, routingTarget: receipt.routingTarget,
      });
    },
  });
}

function freeze(value) { return Object.freeze(value); }
