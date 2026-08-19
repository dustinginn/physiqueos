// Shared cross-check between the operation-level manifest declaration (migration 000005,
// `PostgresCombinedTransferReceiptStore`) and the byte-level per-artifact transfer receipts
// (migration 000006, `PostgresCombinedCutoverTransferReceiptStore`). Extracted so that
// `combinedCutoverManifestTransferService.js`'s `completeManifest` and the Phase 4 canonical
// import/parity adapters perform IDENTICAL verification rather than two independently maintained
// copies that could silently drift apart.
//
// This never trusts anything the client asserts: for every file the operation declared, it reads
// that artifact's own server-computed byte-level receipt and requires it to be `verified` with a
// digest and byte length matching the manifest entry exactly. It is purely a mechanical comparison
// of two already-durable receipts - it never reads canonical Founder/media content.

import { TransferErrorCode, deriveTransferPackageId, transferError } from "./combinedCutoverTransferContract.js";

/**
 * @returns the verified byte-level receipt for every declared file, in declaration order, so
 * callers (such as canonical import) that need to go on to read the underlying bytes do not have
 * to re-derive `packageId` or re-fetch each artifact's receipt a second time.
 */
export async function verifyManifestArtifactsAgainstReceipts({ operationId, files, artifactReceiptStore }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw transferError(TransferErrorCode.INCOMPLETE, "The declared manifest has no artifacts.");
  }
  const verifiedArtifacts = [];
  for (const file of files) {
    const packageId = deriveTransferPackageId(file.path);
    let artifact;
    try {
      artifact = (await artifactReceiptStore.status(operationId, packageId)).receipt;
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
    verifiedArtifacts.push(Object.freeze({ path: file.path, packageId, receipt: artifact }));
  }
  return Object.freeze(verifiedArtifacts);
}
