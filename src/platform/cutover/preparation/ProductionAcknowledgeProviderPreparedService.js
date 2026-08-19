// Production-capable `acknowledgeProviderPrepared` logic for the combined-cutover orchestrator.
//
// AUTHORITY IS NEVER MUTATED DIRECTLY HERE. This module only READS `authorityStore.read()` to
// verify eligibility and returns the acknowledgement object; `CombinedAppPlatformCutoverOrchestrator`
// is the only caller that ever invokes `authorityStore.transition(ACKNOWLEDGE_PROVIDER, ...)`, and
// `CombinedRuntimeAuthorityState`'s own transition validator independently re-checks the same
// operation/fingerprint/fence/packageDigest tuple before committing. This module therefore cannot
// itself execute TRANSFER_TO_PROVIDER, set `firstProviderCanonicalWriteAt`, change routing, or start
// a worker - none of those are reachable from anything this file does.
//
// ELIGIBILITY IS DURABLE-EVIDENCE-DRIVEN, NEVER PROCESS-MEMORY-DRIVEN. Every check re-reads durable
// state: the current authority row, the operation-level transfer receipt, the byte-level artifact
// receipts, and the preparation-evidence row recorded by the real import/parity services. A provider
// process restart between import, parity, and acknowledgement changes nothing about what this module
// can determine, because none of its inputs live only in memory.

import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { requireTransferDigest, requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";
import { PreparationErrorCode, preparationError } from "./combinedCutoverPreparationContract.js";
import { requireVerifiedTransfer } from "./combinedCutoverPreparationEvidence.js";

export function createProductionAcknowledgeProviderPreparedService({
  authorityStore,
  manifestReceiptStore,
  artifactReceiptStore,
  preparationStore,
  providerDeploymentId,
} = {}) {
  if (!authorityStore?.read) throw new Error("Provider-prepared acknowledgement requires the runtime-authority store.");
  if (!manifestReceiptStore?.read) throw new Error("Provider-prepared acknowledgement requires the operation-level transfer receipt store.");
  if (!artifactReceiptStore?.status) throw new Error("Provider-prepared acknowledgement requires the byte-level transfer receipt store.");
  if (!preparationStore?.read || !preparationStore?.recordPreparedAcknowledged) throw new Error("Provider-prepared acknowledgement requires the durable preparation evidence store.");
  if (!String(providerDeploymentId ?? "").trim()) throw new Error("Provider-prepared acknowledgement requires an explicit provider deployment identity.");

  return Object.freeze({
    async acknowledge({ migrationOperationId, authorizationFingerprint, fenceId, expectedPackageDigest }) {
      const operationId = requireTransferOperationId(migrationOperationId);
      const fingerprint = requireTransferDigest(authorizationFingerprint, "authorizationFingerprint");
      const packageDigest = requireTransferDigest(expectedPackageDigest, "expectedPackageDigest");
      if (!String(fenceId ?? "").trim()) throw preparationError(PreparationErrorCode.IDENTITY_INVALID, "fenceId is required.");

      const { state } = await authorityStore.read();
      assertEligibleAuthorityState(state, { operationId, fingerprint, fenceId, packageDigest });

      await requireVerifiedTransfer({ manifestReceiptStore, artifactReceiptStore, operationId, authorizationFingerprint: fingerprint, fenceId, expectedPackageDigest: packageDigest });

      const { receipt: preparation } = await requirePreparationEvidence(preparationStore, operationId, packageDigest);
      if (preparation.importStatus !== "succeeded" || preparation.mediaStatus !== "succeeded" || preparation.parityStatus !== "passed") {
        throw preparationError(PreparationErrorCode.ACKNOWLEDGE_NOT_ELIGIBLE, "Provider-prepared acknowledgement requires successful import, media, and parity evidence.");
      }

      await preparationStore.recordPreparedAcknowledged({
        migrationOperationId: operationId, expectedPackageDigest: packageDigest, providerDeploymentId,
      });

      // This exact shape is validated again by CombinedRuntimeAuthorityState's own
      // ACKNOWLEDGE_PROVIDER transition (requiredAcknowledgement) when the orchestrator applies it -
      // duplicated validation, not duplicated authority.
      return Object.freeze({
        migrationOperationId: operationId,
        authorizationFingerprint: fingerprint,
        fenceId,
        packageDigest,
        providerDeploymentId,
      });
    },
  });
}

function assertEligibleAuthorityState(state, { operationId, fingerprint, fenceId, packageDigest }) {
  if (state.authority !== RuntimeAuthority.CUTOVER_IN_PROGRESS) {
    throw preparationError(PreparationErrorCode.AUTHORITY_STATE_REJECTED, "Provider-prepared acknowledgement requires an active combined cutover in progress.");
  }
  if (String(state.migrationOperationId) !== operationId) {
    throw preparationError(PreparationErrorCode.OPERATION_FORBIDDEN, "Provider-prepared acknowledgement does not match the active cutover operation.");
  }
  if (state.authorizationFingerprint !== fingerprint || state.fenceId !== fenceId) {
    throw preparationError(PreparationErrorCode.OPERATION_FORBIDDEN, "Provider-prepared acknowledgement does not match the active operation's authorization/fence identity.");
  }
  if (state.finalSnapshot?.packageDigest !== packageDigest) {
    throw preparationError(PreparationErrorCode.PACKAGE_DIGEST_CONFLICT, "Provider-prepared acknowledgement package digest does not match the fenced snapshot.");
  }
  if (state.firstProviderCanonicalWriteAt != null) {
    throw preparationError(PreparationErrorCode.AUTHORITY_STATE_REJECTED, "The provider canonical write boundary has already been crossed; forward recovery applies.");
  }
  if (state.publicRuntimeAuthority !== "windows") {
    throw preparationError(PreparationErrorCode.AUTHORITY_STATE_REJECTED, "Provider-prepared acknowledgement requires public routing to still be Windows.");
  }
  if (state.writesEnabled !== false) {
    throw preparationError(PreparationErrorCode.AUTHORITY_STATE_REJECTED, "Provider-prepared acknowledgement requires production writes to not yet be enabled.");
  }
}

async function requirePreparationEvidence(preparationStore, operationId, expectedPackageDigest) {
  let result;
  try {
    result = await preparationStore.read(operationId);
  } catch (error) {
    if (error?.code === "TRANSFER_RECEIPT_UNAVAILABLE") {
      throw preparationError(PreparationErrorCode.ACKNOWLEDGE_NOT_ELIGIBLE, "No preparation evidence exists for this operation.");
    }
    throw error;
  }
  if (result.receipt.packageDigest !== expectedPackageDigest) {
    throw preparationError(PreparationErrorCode.PACKAGE_DIGEST_CONFLICT, "Preparation evidence package digest does not match the expected operation.");
  }
  return result;
}
