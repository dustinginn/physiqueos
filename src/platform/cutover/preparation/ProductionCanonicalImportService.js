// Production-capable `importProviderCanonicalState` logic for the combined-cutover orchestrator.
//
// TRUST BOUNDARY. This never trusts anything a caller asserts about transfer completion. Every
// import call independently re-reads and re-verifies, from durable state:
//   1. the operation-level transfer manifest (`combined_transfer_receipts`, migration 000005) is
//      `verified`, and its authorizationFingerprint/fenceId/packageDigest match the request exactly;
//   2. every declared artifact's own byte-level transfer receipt (migration 000006) is itself
//      `verified` with a digest and byte length matching the manifest entry
//      (`verifyManifestArtifactsAgainstReceipts`, shared with Phase 3's own manifest completion);
//   3. the assembled bytes it is about to import still match those receipts
//      (`artifactReceiptStore.readVerifiedBytes` re-digests on every read).
// Only after all three hold does it reuse the existing, proven `importCanonicalPackage` (canonical
// collection mapping) and `migrateCanonicalPackageMediaToSpaces` (Spaces upload/readback/DB-update)
// machinery unchanged - this module supplies WHERE the bytes come from, never a second copy of HOW
// they are mapped or uploaded.
//
// STAGING, NOT AUTHORITY. Import writes directly to the real target Postgres tables via
// `importCanonicalPackage`'s own SQL, which does not touch `combined_runtime_authority` or
// `claimCanonicalWriteBoundary` at all - exactly like the older single-machine migration path did
// before authority ever transferred. It never sets `firstProviderCanonicalWriteAt`, never enables
// provider production writes, and never touches routing. A partially-completed import on failure is
// left in place rather than destructively rolled back: because authority never transferred, those
// rows are unreachable through any authorized read path, and every write here is an upsert, so a
// retried import safely converges to the correct final state without needing live cleanup.
//
// IDEMPOTENT AND OPERATION-BOUND. A durable preparation receipt (migration 000007) is declared
// before any write and keyed by `migrationOperationId`; an import already `succeeded` for the exact
// package digest returns that recorded result without re-importing, and a package digest conflict
// for the same operation fails closed before any write.

import { importCanonicalPackage } from "../../migration/phase4CanonicalImport.js";
import { migrateCanonicalPackageMediaToSpaces } from "../../migration/ProductionSpacesMediaMigration.js";
import { requireTransferDigest, requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";
import { materializeTemporaryCanonicalPackage, readVerifiedArtifact } from "./combinedCutoverArtifactAssembly.js";
import { PreparationErrorCode, preparationError } from "./combinedCutoverPreparationContract.js";
import { requireVerifiedTransfer } from "./combinedCutoverPreparationEvidence.js";

const MANIFEST_ARTIFACT_PATH = "manifest.json";
const RUNTIME_ARTIFACT_PATH = "canonical-runtime.json";
const MEDIA_ARTIFACT_PREFIX = "media/";

export function createProductionCanonicalImportService({
  pool,
  objectProvider,
  manifestReceiptStore,
  artifactReceiptStore,
  preparationStore,
  targetDatabase,
  fetchImpl = globalThis.fetch,
  // Real by default. Injectable so tests can prove this module's own orchestration - evidence
  // read/write ordering, fail-closed checks, idempotent replay, temp-file assembly/cleanup -
  // without re-proving `importCanonicalPackage`/`migrateCanonicalPackageMediaToSpaces` themselves,
  // which already have their own dedicated coverage and (for the full real-Postgres path) the
  // guarded `test:phase4:postgres` rehearsal.
  importCanonicalPackageFn = importCanonicalPackage,
  migrateCanonicalPackageMediaToSpacesFn = migrateCanonicalPackageMediaToSpaces,
} = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Canonical import requires PostgreSQL.");
  if (!objectProvider?.beginMultipartUpload) throw new Error("Canonical import requires Spaces access.");
  if (!manifestReceiptStore?.read) throw new Error("Canonical import requires the operation-level transfer receipt store.");
  if (!artifactReceiptStore?.status || !artifactReceiptStore?.readVerifiedBytes) throw new Error("Canonical import requires the byte-level transfer receipt store.");
  if (!preparationStore?.declare) throw new Error("Canonical import requires the durable preparation evidence store.");
  if (!String(targetDatabase ?? "").trim()) throw new Error("Canonical import requires an explicit target database.");

  return Object.freeze({
    async import({ migrationOperationId, authorizationFingerprint, fenceId, expectedPackageDigest }) {
      const operationId = requireTransferOperationId(migrationOperationId);
      const fingerprint = requireTransferDigest(authorizationFingerprint, "authorizationFingerprint");
      const packageDigest = requireTransferDigest(expectedPackageDigest, "expectedPackageDigest");
      if (!String(fenceId ?? "").trim()) throw preparationError(PreparationErrorCode.IDENTITY_INVALID, "fenceId is required.");

      await requireVerifiedTransfer({ manifestReceiptStore, artifactReceiptStore, operationId, authorizationFingerprint: fingerprint, fenceId, expectedPackageDigest: packageDigest });

      const declared = await preparationStore.declare({
        migrationOperationId: operationId, authorizationFingerprint: fingerprint, fenceId,
        packageDigest, targetDatabase,
      });
      if (declared.receipt.importStatus === "succeeded" && declared.receipt.mediaStatus === "succeeded") {
        return replayResult(declared.receipt);
      }

      await preparationStore.recordImportStarted({ migrationOperationId: operationId, expectedPackageDigest: packageDigest });

      const manifestArtifact = await readVerifiedArtifact({ artifactReceiptStore, operationId, relativePath: MANIFEST_ARTIFACT_PATH });
      const runtimeArtifact = await readVerifiedArtifact({ artifactReceiptStore, operationId, relativePath: RUNTIME_ARTIFACT_PATH });
      const temporaryPackage = await materializeTemporaryCanonicalPackage({
        manifestBytes: manifestArtifact.bytes, runtimeBytes: runtimeArtifact.bytes,
      });
      try {
        let importResult;
        try {
          importResult = await importCanonicalPackageFn({
            pool, packageRoot: temporaryPackage.packageRoot,
            targetAuthorization: { productionExecutionAuthorized: true, expectedDatabase: targetDatabase, migrationOperationId: operationId },
          });
        } catch (error) {
          await preparationStore.recordImportFailed({ migrationOperationId: operationId, expectedPackageDigest: packageDigest }).catch(() => undefined);
          throw preparationError(PreparationErrorCode.IMPORT_FAILED, `Canonical import failed: ${safeMessage(error)}.`);
        }

        let mediaResult;
        try {
          mediaResult = await migrateCanonicalPackageMediaToSpacesFn({
            packageRoot: temporaryPackage.packageRoot, pool, objectProvider, fetchImpl,
            readSourceBytes: async (entry) => (await readVerifiedArtifact({
              artifactReceiptStore, operationId, relativePath: `${MEDIA_ARTIFACT_PREFIX}${entry.relativePath}`,
            })).bytes,
          });
        } catch (error) {
          await preparationStore.recordMediaFailed({ migrationOperationId: operationId, expectedPackageDigest: packageDigest }).catch(() => undefined);
          throw preparationError(PreparationErrorCode.MEDIA_IMPORT_FAILED, `Canonical media import failed: ${safeMessage(error)}.`);
        }

        await preparationStore.recordImportSucceeded({
          migrationOperationId: operationId, expectedPackageDigest: packageDigest,
          collectionCounts: importResult.collectionCounts, importDigest: importResult.importDigest,
        });
        await preparationStore.recordMediaSucceeded({
          migrationOperationId: operationId, expectedPackageDigest: packageDigest,
          objectCount: mediaResult.objectCount, byteLength: mediaResult.byteLength,
        });

        return Object.freeze({
          ready: true,
          outcome: "imported",
          ownerUserId: importResult.ownerUserId,
          records: totalRecords(importResult.collectionCounts),
          collectionCounts: importResult.collectionCounts,
          importDigest: importResult.importDigest,
          mediaObjectCount: mediaResult.objectCount,
          mediaByteLength: mediaResult.byteLength,
        });
      } finally {
        await temporaryPackage.cleanup().catch(() => undefined);
      }
    },
  });
}


function replayResult(receipt) {
  return Object.freeze({
    ready: true,
    outcome: "idempotent-replay",
    records: totalRecords(receipt.importedCollectionCounts ?? {}),
    collectionCounts: receipt.importedCollectionCounts ?? {},
    importDigest: receipt.importDigest,
    mediaObjectCount: receipt.mediaObjectCount,
    mediaByteLength: receipt.mediaByteLength,
  });
}

function totalRecords(collectionCounts) {
  return Object.values(collectionCounts ?? {}).reduce((sum, count) => sum + Number(count ?? 0), 0);
}

// Never surfaces connection strings, credentials, or raw filesystem paths from an underlying
// import/media failure into the durable receipt or the HTTP response.
function safeMessage(error) {
  const message = String(error?.message ?? "unknown failure");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s|\/[A-Za-z]:[\\/]|\\Users\\/i.test(message)) {
    return "see protected server logs";
  }
  return message.slice(0, 300);
}
