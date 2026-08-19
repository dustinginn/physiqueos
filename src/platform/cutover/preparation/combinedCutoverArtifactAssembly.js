// Reconstructs verified combined-cutover transfer artifacts into the short-lived, on-disk shape
// `readAndValidateCanonicalPackage`/`importCanonicalPackage` (src/platform/migration/
// phase4CanonicalExport.js, phase4CanonicalImport.js) already expect, so canonical import can reuse
// that existing, proven mapping/import machinery unchanged rather than duplicating it.
//
// NOT DURABLE STAGING. The files this writes live only for the duration of one import/parity
// operation, in a fresh `os.tmpdir()` subdirectory, and are removed by the returned `cleanup()`
// regardless of success or failure. The durable evidence is the Phase 3 transfer receipts and
// staged Spaces objects this module reads from; nothing here is itself a store of record. This is
// therefore not the "ephemeral App Platform local filesystem as durable staged evidence" the
// governing document forbids - it is transient working memory that happens to need a filesystem API.
//
// NEVER TRUSTS "verified" ALONE. `artifactReceiptStore.readVerifiedBytes` (Phase 3) already
// re-assembles and re-digests before returning bytes; this module adds no additional trust.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveTransferPackageId } from "../transfer/combinedCutoverTransferContract.js";

/**
 * Reads one artifact's verified bytes ("manifest.json", "canonical-runtime.json", or
 * "media/<relativePath>") from the Phase 3 byte-level transfer receipt store.
 */
export async function readVerifiedArtifact({ artifactReceiptStore, operationId, relativePath }) {
  const packageId = deriveTransferPackageId(relativePath);
  const { bytes, receipt } = await artifactReceiptStore.readVerifiedBytes({ operationId, packageId });
  return Object.freeze({ relativePath, packageId, bytes, receipt });
}

/**
 * Materializes `manifest.json` and `canonical-runtime.json` into a fresh temp directory matching
 * the layout `readAndValidateCanonicalPackage` requires. Returns the directory path and a
 * `cleanup()` that removes it; callers must always call `cleanup()` (typically in a `finally`).
 */
export async function materializeTemporaryCanonicalPackage({ manifestBytes, runtimeBytes }) {
  const root = await mkdtemp(join(tmpdir(), "physiqueos-combined-cutover-import-"));
  await writeFile(join(root, "manifest.json"), manifestBytes);
  await writeFile(join(root, "canonical-runtime.json"), runtimeBytes);
  return Object.freeze({
    packageRoot: root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  });
}
