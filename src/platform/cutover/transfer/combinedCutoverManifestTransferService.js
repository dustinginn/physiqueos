// Operation-level manifest declaration and provider-independent completion for the combined-cutover
// transfer channel. Wraps the already-existing, already-tested
// `PostgresCombinedTransferReceiptStore` (migration 000005) rather than duplicating it: that table's
// declare/verify semantics - one row per operation, digest-bound, idempotent on identical
// redeclaration, rejecting drift - are exactly the operation-level "package identity and overall
// package digest" binding the cutover transfer contract requires, so it is reused here behind its
// own authenticated HTTP surface rather than replaced.
//
// COMPLETION IS PROVIDER-COMPUTED, NEVER CLIENT-ASSERTED. `completeManifest` does not accept a
// caller-supplied verification receipt. It independently reads every declared artifact's OWN
// server-verified byte-level receipt (from `PostgresCombinedCutoverTransferReceiptStore`, migration
// 000006) and only calls the operation-level store's `verify` once every declared file's digest and
// byte length matches its already-verified artifact receipt. This is a mechanical cross-check
// between two durable, already-computed receipts - it never re-parses or re-interprets Founder
// runtime or media content, so it stays inside transfer plumbing rather than becoming a real import.

import { TransferErrorCode, deriveTransferPackageId, requireTransferOperationId, transferError } from "./combinedCutoverTransferContract.js";
import { authenticateCombinedCutoverTransfer } from "./combinedCutoverTransferAuth.js";
import { handleTransferRequest } from "./combinedCutoverTransferService.js";

export function createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig, now = () => new Date() } = {}) {
  if (!manifestReceiptStore?.declare || !manifestReceiptStore?.read || !manifestReceiptStore?.verify) {
    throw new Error("The manifest transfer service requires the operation-level receipt store.");
  }
  if (!artifactReceiptStore?.status) throw new Error("The manifest transfer service requires the byte-level artifact receipt store.");

  return Object.freeze({
    async declareManifest({ authorizationHeader, payload }) {
      return handleTransferRequest(async () => {
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: payload?.migrationOperationId, config: authConfig, now });
        const result = await manifestReceiptStore.declare(payload ?? {});
        return { status: result.outcome === "declared" ? 201 : 200, body: publicManifestReceipt(result.receipt, result.outcome) };
      });
    },

    async completeManifest({ authorizationHeader, operationId }) {
      return handleTransferRequest(async () => {
        const operation = requireTransferOperationId(operationId);
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: operation, config: authConfig, now });
        const { receipt } = await manifestReceiptStore.read(operation);
        if (["verified", "consumed"].includes(receipt.status)) {
          return { status: 200, body: publicManifestReceipt(receipt, "idempotent-replay") };
        }
        const files = receipt.manifest?.files ?? [];
        if (files.length === 0) throw transferError(TransferErrorCode.INCOMPLETE, "The declared manifest has no artifacts.");
        for (const file of files) {
          const packageId = deriveTransferPackageId(file.path);
          let artifact;
          try {
            artifact = (await artifactReceiptStore.status(operation, packageId)).receipt;
          } catch (error) {
            if (error?.code === TransferErrorCode.RECEIPT_UNAVAILABLE) {
              throw transferError(TransferErrorCode.INCOMPLETE, `Artifact ${file.path} has not been transferred yet.`);
            }
            throw error;
          }
          if (artifact.status !== "verified") throw transferError(TransferErrorCode.INCOMPLETE, `Artifact ${file.path} is not yet verified.`);
          if (artifact.overallDigest !== String(file.sha256).toLowerCase() || artifact.expectedBytes !== Number(file.byteLength)) {
            throw transferError(TransferErrorCode.PACKAGE_IDENTITY_MISMATCH, `Verified artifact ${file.path} does not match the declared manifest entry.`);
          }
        }
        const verified = await manifestReceiptStore.verify({
          migrationOperationId: operation,
          authorizationFingerprint: receipt.authorizationFingerprint,
          fenceId: receipt.fenceId,
          receipt: {
            packageDigest: receipt.packageDigest,
            runtimeSha256: receipt.runtimeSha256,
            mediaInventorySha256: receipt.mediaInventorySha256,
            migrationControlSha256: receipt.migrationControlSha256,
            providerDeploymentId: receipt.providerDeploymentId,
            allObjectsVerified: true,
            fileCount: files.length,
          },
        });
        return { status: 200, body: publicManifestReceipt(verified.receipt, verified.outcome) };
      });
    },

    async manifestStatus({ authorizationHeader, operationId }) {
      return handleTransferRequest(async () => {
        const operation = requireTransferOperationId(operationId);
        authenticateCombinedCutoverTransfer({ authorizationHeader, requestedOperationId: operation, config: authConfig, now });
        const { receipt } = await manifestReceiptStore.read(operation);
        return { status: 200, body: publicManifestReceipt(receipt) };
      });
    },
  });
}

// Never echoes the file-level manifest contents, staging keys, or credentials - only the identity
// and status fields the operation-level contract promises.
function publicManifestReceipt(receipt, outcome) {
  if (!receipt) return null;
  return Object.freeze({
    migrationOperationId: receipt.migrationOperationId,
    packageDigest: receipt.packageDigest,
    status: receipt.status,
    fileCount: receipt.manifest?.files?.length ?? null,
    ...(outcome ? { outcome } : {}),
  });
}
