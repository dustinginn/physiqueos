// Production-capable worker-handoff logic for the combined cutover
// (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase N/O: "Release writes only through the
// provider platform, start the authority-gated worker, and perform immediate web/read/write/media/
// user-facing acceptance. Windows remains stopped or read-only and cannot accept writes.").
//
// NOT AN ORCHESTRATOR ADAPTER - A LATER, SEPARATE COORDINATOR PHASE. `CombinedAppPlatformCutoverOrchestrator
// .execute()` ends at `verifyPostHandoff` (phase L's smoke test); it drives neither phase M (the
// first-write boundary, which the rehearsal's own header comment already documents as living in the
// repository facade, not the orchestrator) nor phase N/O. The governing document's own phase lettering
// places worker start strictly AFTER M, itself strictly after L - so by source, worker handoff cannot
// be plugged into any existing orchestrator adapter without either running too early (violating phase
// ordering) or requiring the orchestrator to somehow know about the first-write boundary it
// deliberately does not track. This service is therefore a standalone, later production coordinator
// step, not a fifth authority-transition-owning adapter, and `assertAdapters` in the orchestrator is
// untouched.
//
// THE CENTRAL INVARIANT, RE-VERIFIED FROM DURABLE STATE ON EVERY CALL. Provider workers cannot become
// authoritative before provider authority transfer (`combined_runtime_authority.authority` must be
// exactly `provider-authoritative`) and must not perform canonical production work before the
// documented boundary - this service additionally requires `firstProviderCanonicalWriteAt` to already
// be durably non-null (the N/O-after-M sequencing the governing document itself specifies), never
// relying on the caller's claim. It never calls `claimCanonicalWriteBoundary` or constructs a
// first-write timestamp itself - crossing that boundary remains a wholly separate, earlier action this
// module only reads evidence of.
//
// DEPLOYMENT-IDENTITY BOUND. The Phase 5 handoff receipt's `provider_deployment_id` (declared at
// authority/routing handoff time) is reused as the expected worker deployment identity - a caller
// asserting a different deployment ID is rejected before any worker-control call.
//
// AUTHORITY IS NEVER TOUCHED HERE. This service only ever calls `authorityStore.read()` - it has no
// `transition` capability at all, so it cannot set `firstProviderCanonicalWriteAt`, cannot revert
// authority, and cannot introduce a second worker-authority source: `combined_runtime_authority
// .workerAuthority` remains the sole worker-authority source. `AuthorityGatedWorker.js` independently
// re-checks it and the durable `firstProviderCanonicalWriteAt` release boundary on every `runOnce()`
// call, regardless of what this service's own durable evidence says.
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import { requireTransferOperationId, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import { assertCombinedCutoverWorkerControl } from "./combinedCutoverWorkerControl.js";
import { WorkerHandoffErrorCode, workerHandoffError } from "./combinedCutoverWorkerHandoffContract.js";

export function createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl } = {}) {
  if (!authorityStore?.read) throw new Error("The worker handoff service requires the runtime-authority store.");
  if (!handoffReceiptStore?.read) throw new Error("The worker handoff service requires the durable handoff evidence store.");
  assertCombinedCutoverWorkerControl(workerControl);

  return Object.freeze({
    async activateProviderWorkersAndRetireWindows({ input } = {}) {
      const operationId = requireTransferOperationId(input?.migrationOperationId);
      const durable = (await authorityStore.read()).state;

      if (durable.authority !== RuntimeAuthority.PROVIDER) {
        throw workerHandoffError(WorkerHandoffErrorCode.AUTHORITY_STATE_REJECTED, "Worker handoff requires provider authority to already be transferred.");
      }
      if (String(durable.migrationOperationId ?? "") !== operationId) {
        throw workerHandoffError(WorkerHandoffErrorCode.OPERATION_FORBIDDEN, "Worker handoff does not match the active cutover operation.");
      }
      if (durable.firstProviderCanonicalWriteAt == null) {
        throw workerHandoffError(WorkerHandoffErrorCode.BOUNDARY_NOT_YET_CROSSED, "Worker handoff (phase N/O) requires the first-write boundary (phase M) to already be crossed.");
      }

      const { receipt } = await requireHandoffReceipt(handoffReceiptStore, operationId);
      if (receipt.packageDigest !== durable.finalSnapshot?.packageDigest) {
        throw workerHandoffError(WorkerHandoffErrorCode.PACKAGE_DIGEST_CONFLICT, "Durable handoff evidence package digest does not match the fenced snapshot.");
      }
      const expectedDeploymentId = requireNonEmpty(input?.providerDeploymentId ?? receipt.providerDeploymentId, "providerDeploymentId");
      if (expectedDeploymentId !== receipt.providerDeploymentId) {
        throw workerHandoffError(WorkerHandoffErrorCode.DEPLOYMENT_IDENTITY_MISMATCH, "Requested provider worker deployment identity does not match the durably recorded handoff deployment.");
      }

      if (receipt.workerActivationStatus === "verified" && receipt.windowsWorkerRetirementStatus === "retired") {
        return freeze({ ready: true, outcome: "idempotent-replay", operationId, providerDeploymentId: expectedDeploymentId, worker: { status: "verified" }, windowsRetirement: { status: "retired" } });
      }

      if (!["activated", "verified"].includes(receipt.workerActivationStatus)) {
        try {
          await workerControl.activateProviderWorkers({ operationId, providerDeploymentId: expectedDeploymentId });
          await handoffReceiptStore.recordWorkerActivated({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest });
        } catch (error) {
          await handoffReceiptStore.recordWorkerActivationFailed({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest }).catch(() => undefined);
          throw workerHandoffError(WorkerHandoffErrorCode.ACTIVATION_FAILED, `Provider worker activation failed: ${safeMessage(error)}.`, { cause: error });
        }
      }

      // Verification failure is genuinely ambiguous (activation may have succeeded but is unconfirmed)
      // - never downgraded to "failed"; a human or later automation resolves it deliberately, exactly
      // like the Phase 5 routing-verification-ambiguous handling this mirrors.
      try {
        const verified = await workerControl.verifyProviderWorkers({ operationId });
        if (verified?.ready !== true) throw new Error("Provider worker verification did not report readiness.");
        await handoffReceiptStore.recordWorkerVerified({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest });
      } catch (error) {
        throw workerHandoffError(WorkerHandoffErrorCode.VERIFICATION_AMBIGUOUS, `Provider worker verification failed after activation: ${safeMessage(error)}.`, { cause: error });
      }

      // Windows retirement happens only AFTER the provider worker is verified - the documented N/O
      // point, not earlier.
      if (receipt.windowsWorkerRetirementStatus !== "retired") {
        try {
          await workerControl.retireWindowsWorkers({ operationId });
          await handoffReceiptStore.recordWindowsWorkerRetired({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest });
        } catch (error) {
          await handoffReceiptStore.recordWindowsWorkerRetirementFailed({ migrationOperationId: operationId, expectedPackageDigest: receipt.packageDigest }).catch(() => undefined);
          throw workerHandoffError(WorkerHandoffErrorCode.RETIREMENT_FAILED, `Windows worker retirement failed after provider verification: ${safeMessage(error)}.`, { cause: error });
        }
      }

      return freeze({ ready: true, outcome: "activated", operationId, providerDeploymentId: expectedDeploymentId, worker: { status: "verified" }, windowsRetirement: { status: "retired" } });
    },
  });
}

async function requireHandoffReceipt(handoffReceiptStore, operationId) {
  try {
    return await handoffReceiptStore.read(operationId);
  } catch (error) {
    if (error?.code === TransferErrorCode.RECEIPT_UNAVAILABLE) {
      throw workerHandoffError(WorkerHandoffErrorCode.RECEIPT_UNAVAILABLE, "No durable handoff evidence exists for this operation; worker handoff requires the Phase 5 authority/routing handoff to have already completed.");
    }
    throw error;
  }
}

function requireNonEmpty(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw workerHandoffError(WorkerHandoffErrorCode.IDENTITY_INVALID, `${field} is required.`);
  return candidate;
}

function safeMessage(error) {
  const message = String(error?.message ?? "unknown failure");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s|token/i.test(message)) return "see protected server logs";
  return message.slice(0, 300);
}

function freeze(value) { return Object.freeze(value); }
