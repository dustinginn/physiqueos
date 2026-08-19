// Production `captureFinalSnapshot` adapter for `CombinedAppPlatformCutoverOrchestrator`.
//
// REUSES THE PROVEN SNAPSHOT/EXPORT ARCHITECTURE UNCHANGED - it does not duplicate export, snapshot,
// or package-hashing logic. `captureReadOnlyFounderSnapshot`, `deriveTrustedMigrationSourceIdentity`,
// and `exportCanonicalPackage` are the exact same functions the older single-machine production
// migration path (`scripts/productionMigrationEnvironmentAdapters.mjs`) already uses, imported here
// directly from their pure `src/platform/migration/` modules (never from that `.mjs` script, which
// calls `register(...)` at module load and cannot be imported from production `src/` code).
//
// WHY EXPORT HAPPENS HERE, NOT ONLY IN `exportFinalPackage`. `CombinedRuntimeAuthorityState`'s
// `BEGIN_CUTOVER` transition durably commits `finalSnapshot.packageDigest` BEFORE
// `exportFinalPackage` ever runs (the orchestrator calls `captureFinalSnapshot` first, commits
// `BEGIN_CUTOVER` with its return value, and only THEN calls `exportFinalPackage`). The package digest
// therefore has to be genuinely known at snapshot-capture time, not merely promised - so this adapter
// performs the real, final canonical export (writing the package `exportFinalPackage` later reads
// back and independently re-validates from disk) and uses the resulting manifest's own
// `semanticDigest` (already a canonical `createPayloadHash` output - no new digest format is
// invented) directly as `packageDigest`. `exportFinalPackage` never re-derives or re-writes it; it
// only reads the package back from disk and cross-checks it against the durably committed value.
//
// IDENTITY BINDING. The returned snapshot binds: Founder runtime SHA-256/revision (checked directly
// by the orchestrator's own `assertSnapshotMatchesAuthorization`), a media-inventory digest (a
// `createPayloadHash` of the exported package's own file inventory - the same media identity export
// already computed, not re-derived), and a migration-control digest (a `createPayloadHash` of the
// EXACT Windows write-fence state returned by `activateWindowsWriteFence`, so the snapshot is bound
// to the fenced state it was captured under, not merely to "a" fence).
//
// WORKSPACE SAFETY. Uses `combinedCutoverOperationWorkspace.js`'s stale-workspace protection: the
// per-operation directory is created non-recursively, so an already-existing operation workspace
// (from a prior attempt) fails EEXIST rather than being silently reused or overwritten.
import { captureReadOnlyFounderSnapshot, exportCanonicalPackage, PHASE4_PACKAGE_VERSION } from "../../migration/phase4CanonicalExport.js";
import { deriveTrustedMigrationSourceIdentity, createFilesystemBuildIdentityProvider } from "../../migration/MigrationSourceIdentity.js";
import { createPayloadHash } from "../../../contracts/v1/canonicalJson.js";
import { combinedCutoverOperationPaths, prepareCombinedCutoverOperationWorkspace } from "./combinedCutoverOperationWorkspace.js";

export function createProductionFinalSnapshotService({
  sourceRuntimePath,
  sourceMediaRoot = null,
  workspaceRoot,
  mediaInclude = () => true,
  buildIdentityProvider = createFilesystemBuildIdentityProvider(),
  sourceSchemaVersion = "000003",
  normalizeRuntime = (value) => value,
} = {}) {
  if (!String(sourceRuntimePath ?? "").trim()) throw new Error("captureFinalSnapshot requires the Founder runtime source path.");
  if (!String(workspaceRoot ?? "").trim()) throw new Error("captureFinalSnapshot requires a workspace root.");

  return Object.freeze({
    async captureFinalSnapshot({ input, fence } = {}) {
      const operationId = requireNonEmpty(input?.migrationOperationId, "migrationOperationId");
      if (!fence?.controlState) {
        throw new Error("captureFinalSnapshot requires the durably-activated Windows write-fence result (activateWindowsWriteFence must run first).");
      }

      const paths = combinedCutoverOperationPaths(operationId, { workspaceRoot });
      await prepareCombinedCutoverOperationWorkspace(paths);

      const snapshot = await captureReadOnlyFounderSnapshot({
        sourceRuntimePath, sourceMediaRoot, snapshotRoot: paths.snapshot, mediaInclude,
      });

      const sourceIdentity = await deriveTrustedMigrationSourceIdentity({
        runtimePath: snapshot.runtimePath,
        packageVersion: PHASE4_PACKAGE_VERSION,
        sourceSchemaVersion,
        migrationOperationId: operationId,
        buildIdentityProvider,
      });

      const exported = await exportCanonicalPackage({
        runtimePath: snapshot.runtimePath,
        mediaRoot: snapshot.mediaRoot,
        outputRoot: paths.package,
        sourceIdentity,
        normalizeRuntime,
      });

      const migrationControlSha256 = createPayloadHash(fence.controlState);
      const mediaInventorySha256 = createPayloadHash(exported.manifest.files);

      return Object.freeze({
        runtimeSha256: sourceIdentity.runtime.sha256,
        runtimeRevision: Number(sourceIdentity.runtime.revision),
        mediaInventorySha256,
        migrationControlSha256,
        packageDigest: exported.manifest.semanticDigest,
        operationId,
        capturedAt: new Date().toISOString(),
        packageRoot: paths.package,
      });
    },
  });
}

function requireNonEmpty(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`captureFinalSnapshot requires ${field}.`);
  return candidate;
}
