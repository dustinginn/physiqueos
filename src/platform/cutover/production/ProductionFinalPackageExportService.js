// Production `exportFinalPackage` adapter for `CombinedAppPlatformCutoverOrchestrator`.
//
// The actual canonical package was already written to disk by `ProductionFinalSnapshotService.js`'s
// `captureFinalSnapshot` (see that module's header for why the package digest must be known before
// `BEGIN_CUTOVER` commits, ahead of this step). This adapter's job is therefore to independently
// re-read and re-validate that package FROM DISK (never trusting the in-memory `snapshot` object
// alone) via `readAndValidateCanonicalPackage` - the exact same reusable validator the older
// single-machine migration path uses - and cross-check it against the durably committed
// `state.finalSnapshot.packageDigest` before producing the package contract Phase 3's
// `transferSnapshot`/Phase 4's import-and-parity already consume
// (`{manifest, runtimeFile, manifestFile}` - see `WindowsCombinedCutoverTransferClient.js`, which
// already asserts `exported.manifest.semanticDigest === snapshot.packageDigest`). This adapter does
// not write any package files itself, so replaying it for the same operation is naturally
// deterministic and idempotent - it is a pure read-and-verify step.
//
// FAILS CLOSED ON ANY IDENTITY DRIFT. A package whose manifest digest does not match the durably
// committed snapshot, or whose embedded migration-operation identity does not match the active
// cutover operation, is rejected before this adapter returns - so a stale or foreign package can never
// reach Phase 3 transfer.
import path from "node:path";
import { readAndValidateCanonicalPackage } from "../../migration/phase4CanonicalExport.js";
import { combinedCutoverOperationPaths } from "./combinedCutoverOperationWorkspace.js";

export function createProductionFinalPackageExportService({ workspaceRoot } = {}) {
  if (!String(workspaceRoot ?? "").trim()) throw new Error("exportFinalPackage requires a workspace root.");

  return Object.freeze({
    async exportFinalPackage({ input, state, snapshot } = {}) {
      const operationId = requireNonEmpty(input?.migrationOperationId, "migrationOperationId");
      if (!snapshot?.packageDigest) {
        throw new Error("exportFinalPackage requires the fenced final snapshot (captureFinalSnapshot must run first).");
      }
      const expectedPackageDigest = state?.finalSnapshot?.packageDigest;
      if (!expectedPackageDigest) {
        throw new Error("exportFinalPackage requires a durably committed final snapshot package digest.");
      }

      const paths = combinedCutoverOperationPaths(operationId, { workspaceRoot });
      const packageData = await readAndValidateCanonicalPackage(paths.package);

      if (packageData.manifest.semanticDigest !== expectedPackageDigest || packageData.manifest.semanticDigest !== snapshot.packageDigest) {
        throw exportError("COMBINED_CUTOVER_EXPORT_DIGEST_MISMATCH", "Exported package digest does not match the durably committed final snapshot.");
      }
      if (String(packageData.manifest.source?.migration?.operationId ?? "") !== operationId) {
        throw exportError("COMBINED_CUTOVER_EXPORT_OPERATION_MISMATCH", "Exported package does not belong to the active cutover operation.");
      }

      return Object.freeze({
        packageDigest: packageData.manifest.semanticDigest,
        packageRoot: paths.package,
        manifest: packageData.manifest,
        runtimeFile: path.join(paths.package, "canonical-runtime.json"),
        manifestFile: path.join(paths.package, "manifest.json"),
      });
    },
  });
}

function requireNonEmpty(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`exportFinalPackage requires ${field}.`);
  return candidate;
}

function exportError(code, message) {
  return Object.assign(new Error(message), { code });
}
