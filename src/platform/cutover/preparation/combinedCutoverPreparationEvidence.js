// Shared "is this operation's transfer actually verified, and does it match what the caller
// claims?" check, used identically by both the production import and parity services so they can
// never independently drift on what "verified and matching" means.

import { verifyManifestArtifactsAgainstReceipts } from "../transfer/combinedCutoverManifestArtifactVerification.js";
import { PreparationErrorCode, preparationError } from "./combinedCutoverPreparationContract.js";

/**
 * @returns `{ manifestReceipt, verifiedArtifacts }` - the operation-level transfer receipt and the
 * per-artifact verified receipts for every declared file, in declaration order.
 */
export async function requireVerifiedTransfer({ manifestReceiptStore, artifactReceiptStore, operationId, authorizationFingerprint, fenceId, expectedPackageDigest }) {
  const { receipt: manifestReceipt } = await readManifestReceipt(manifestReceiptStore, operationId);
  if (manifestReceipt.status !== "verified") {
    throw preparationError(PreparationErrorCode.TRANSFER_NOT_VERIFIED, "The combined-cutover transfer has not been verified for this operation.");
  }
  if (manifestReceipt.authorizationFingerprint !== authorizationFingerprint || manifestReceipt.fenceId !== fenceId) {
    throw preparationError(PreparationErrorCode.OPERATION_FORBIDDEN, "Request does not match the verified transfer's authorization/fence identity.");
  }
  if (manifestReceipt.packageDigest !== expectedPackageDigest) {
    throw preparationError(PreparationErrorCode.PACKAGE_DIGEST_CONFLICT, "Request package digest does not match the verified transfer.");
  }
  const files = manifestReceipt.manifest?.files ?? [];
  const verifiedArtifacts = await verifyManifestArtifactsAgainstReceipts({ operationId, files, artifactReceiptStore });
  return Object.freeze({ manifestReceipt, verifiedArtifacts });
}

async function readManifestReceipt(manifestReceiptStore, operationId) {
  try {
    return await manifestReceiptStore.read(operationId);
  } catch (error) {
    if (error?.code === "TRANSFER_RECEIPT_UNAVAILABLE") {
      throw preparationError(PreparationErrorCode.TRANSFER_NOT_VERIFIED, "No combined-cutover transfer has been declared for this operation.");
    }
    throw error;
  }
}
