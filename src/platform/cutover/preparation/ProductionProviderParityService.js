// Production-capable `verifyProviderParity` logic for the combined-cutover orchestrator.
//
// AUTHORITATIVE COMPARISON INPUTS. Per the governing document, the source side of parity is the
// FINAL FENCED WINDOWS PACKAGE for this cutover operation, not live mutable Windows state - the
// fence already froze it, and re-reading live Windows here would defeat that. This module never
// touches Windows; it re-assembles the source side from the exact same verified transfer artifacts
// canonical import already consumed (`manifest.json` + `canonical-runtime.json`, re-verified from
// Spaces staging exactly like import does). The provider side is the just-imported PostgreSQL
// canonical state, read fresh via `createPhase5ProviderApplicationComposition` - never cached.
//
// REUSES THE PROVEN PARITY ARCHITECTURE UNCHANGED. `compareRepresentativeReads`,
// `semanticReadModelProjection`, and `computeBoundedSemanticDifference`
// (`../../migration/readModelParityComparison.js`) are the exact corrected live read-parity
// implementation from the older migration path - same volatile-envelope-field exclusion (exactly
// `generatedAt`/`freshThrough`/`etag`, nothing more), same one-shared-frozen-clock requirement, same
// bounded non-dumping diagnostics. Nothing here weakens or adds to that.
//
// SCOPE. This verifies canonical collection identity/counts (via the same digest/ID-set checks
// `validateCanonicalImport` already performs), application context, representative application read
// models, and media/object inventory. It also reports minimal command *readiness* (whether the
// provider composition exposes a working command boundary) because
// `CombinedAppPlatformCutoverOrchestrator` has no separate command-readiness stage - it never
// executes a write to prove that, which would duplicate `acknowledgeProviderPrepared`'s job.

import { validateCanonicalImport } from "../../migration/phase4CanonicalImport.js";
import { readAndValidateCanonicalPackage } from "../../migration/phase4CanonicalExport.js";
import { createPhase4MediaObjectId } from "../../migration/phase4LocalMediaMigration.js";
import { createPhase5ProviderApplicationComposition } from "../../database/phase5ProviderComposition.js";
import { compareRepresentativeReads } from "../../migration/readModelParityComparison.js";
import { createSeedRepositories } from "../../../data/repositories/createSeedRepositories.js";
import { createLegacyFounderReadLoaders } from "../../../application/read-models/LegacyFounderReadLoaders.js";
import { createPhase3ReadModelService } from "../../../application/read-models/Phase3ReadModelService.js";
import { requireTransferDigest, requireTransferOperationId } from "../transfer/combinedCutoverTransferContract.js";
import { materializeTemporaryCanonicalPackage, readVerifiedArtifact } from "./combinedCutoverArtifactAssembly.js";
import { PreparationErrorCode, preparationError } from "./combinedCutoverPreparationContract.js";
import { requireVerifiedTransfer } from "./combinedCutoverPreparationEvidence.js";

const MANIFEST_ARTIFACT_PATH = "manifest.json";
const RUNTIME_ARTIFACT_PATH = "canonical-runtime.json";
const MEDIA_ARTIFACT_PREFIX = "media/";

export function createProductionProviderParityService({
  pool,
  objectProvider,
  manifestReceiptStore,
  artifactReceiptStore,
  preparationStore,
  ownerUserId,
  mediaAccessSecret,
  now = () => new Date(),
  // Real by default. Injectable so tests can prove this module's own orchestration - evidence
  // ordering, frozen-clock plumbing, media inventory checks, fail-closed behavior - without
  // re-proving `validateCanonicalImport`/`readAndValidateCanonicalPackage`/
  // `createPhase5ProviderApplicationComposition` themselves, which already have their own
  // dedicated coverage.
  validateCanonicalImportFn = validateCanonicalImport,
  readAndValidateCanonicalPackageFn = readAndValidateCanonicalPackage,
  createPhase5ProviderApplicationCompositionFn = createPhase5ProviderApplicationComposition,
} = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Provider parity requires PostgreSQL.");
  if (!objectProvider?.inspectObject) throw new Error("Provider parity requires Spaces access.");
  if (!manifestReceiptStore?.read) throw new Error("Provider parity requires the operation-level transfer receipt store.");
  if (!artifactReceiptStore?.status || !artifactReceiptStore?.readVerifiedBytes) throw new Error("Provider parity requires the byte-level transfer receipt store.");
  if (!preparationStore?.read) throw new Error("Provider parity requires the durable preparation evidence store.");
  if (!String(ownerUserId ?? "").trim()) throw new Error("Provider parity requires the canonical owner user ID.");

  return Object.freeze({
    async verifyParity({ migrationOperationId, authorizationFingerprint, fenceId, expectedPackageDigest }) {
      const operationId = requireTransferOperationId(migrationOperationId);
      const fingerprint = requireTransferDigest(authorizationFingerprint, "authorizationFingerprint");
      const packageDigest = requireTransferDigest(expectedPackageDigest, "expectedPackageDigest");
      if (!String(fenceId ?? "").trim()) throw preparationError(PreparationErrorCode.IDENTITY_INVALID, "fenceId is required.");

      await requireVerifiedTransfer({ manifestReceiptStore, artifactReceiptStore, operationId, authorizationFingerprint: fingerprint, fenceId, expectedPackageDigest: packageDigest });

      const { receipt: preparation } = await requirePreparationEvidence(preparationStore, operationId, packageDigest);
      if (preparation.importStatus !== "succeeded" || preparation.mediaStatus !== "succeeded") {
        throw preparationError(PreparationErrorCode.PARITY_NOT_READY, "Parity verification requires a successfully imported package.");
      }
      if (preparation.parityStatus === "passed") {
        return Object.freeze({ ready: true, outcome: "idempotent-replay", readParity: "pass", commandReadiness: "pass", mediaValidated: true, checks: {} });
      }

      const manifestArtifact = await readVerifiedArtifact({ artifactReceiptStore, operationId, relativePath: MANIFEST_ARTIFACT_PATH });
      const runtimeArtifact = await readVerifiedArtifact({ artifactReceiptStore, operationId, relativePath: RUNTIME_ARTIFACT_PATH });
      const temporaryPackage = await materializeTemporaryCanonicalPackage({
        manifestBytes: manifestArtifact.bytes, runtimeBytes: runtimeArtifact.bytes,
      });
      try {
        // Canonical collection identity/counts and semantic-digest parity: the exact same checks
        // `validateCanonicalImport` already performs for the older migration path, reused unchanged.
        const importValidation = await validateCanonicalImportFn({
          pool, packageRoot: temporaryPackage.packageRoot,
          targetAuthorization: { productionExecutionAuthorized: true, expectedDatabase: preparation.targetDatabase, migrationOperationId: operationId },
        }).catch((error) => {
          throw preparationError(PreparationErrorCode.PARITY_MISMATCH, `Canonical collection parity failed: ${safeMessage(error)}.`);
        });

        const packageData = await readAndValidateCanonicalPackageFn(temporaryPackage.packageRoot);
        const frozenInstant = now();
        const frozenNow = () => frozenInstant;
        const providerComposition = await createPhase5ProviderApplicationCompositionFn({
          pool, ownerUserId, objectProvider, mediaAccessSecret, now: frozenNow,
        });
        const checks = await compareApplicationReadModels({ packageData, ownerUserId, providerComposition, now: frozenNow });

        const mediaFiles = (packageData.manifest.files ?? []);
        await verifyMediaInventoryParity({ pool, objectProvider, ownerUserId, files: mediaFiles });

        const commandReady = Boolean(providerComposition.commands?.execute);
        if (!commandReady) throw preparationError(PreparationErrorCode.PARITY_NOT_READY, "Provider composition does not expose a working command boundary.");

        await preparationStore.recordParityPassed({
          migrationOperationId: operationId, expectedPackageDigest: packageDigest, readSurfaceCount: Object.keys(checks).length,
        });
        return Object.freeze({
          ready: true, outcome: "verified", readParity: "pass", commandReadiness: "pass", mediaValidated: true,
          checks, collectionParity: Object.freeze({ counts: importValidation.counts, importDigest: importValidation.importDigest }),
        });
      } catch (error) {
        await preparationStore.recordParityFailed({ migrationOperationId: operationId, expectedPackageDigest: packageDigest }).catch(() => undefined);
        if (error?.code) throw error;
        const wrapped = preparationError(PreparationErrorCode.PARITY_MISMATCH, error?.message ?? "Provider parity verification failed.");
        wrapped.parityDiagnostic = error?.parityDiagnostic ?? null;
        throw wrapped;
      } finally {
        await temporaryPackage.cleanup().catch(() => undefined);
      }
    },
  });
}

async function requirePreparationEvidence(preparationStore, operationId, expectedPackageDigest) {
  const result = await preparationStore.read(operationId);
  if (result.receipt.packageDigest !== expectedPackageDigest) {
    throw preparationError(PreparationErrorCode.PACKAGE_DIGEST_CONFLICT, "Preparation evidence package digest does not match the expected operation.");
  }
  return result;
}

async function compareApplicationReadModels({ packageData, ownerUserId, providerComposition, now }) {
  const canonicalRuntime = {
    version: packageData.manifest.source.runtime.version,
    revision: Number(packageData.manifest.source.runtime.revision),
    updatedAt: packageData.manifest.source.runtime.updatedAt,
    ...packageData.collections,
  };
  const readResourceVersion = ({ data }) => String(data?.version ?? canonicalRuntime.revision ?? "1");
  const repositories = createSeedRepositories(canonicalRuntime);
  const legacy = createPhase3ReadModelService({
    loaders: createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => canonicalRuntime, now }),
    now, readResourceVersion,
  });
  return compareRepresentativeReads({
    legacy, postgres: providerComposition.readModels,
    principal: Object.freeze({ userId: ownerUserId, deviceId: "combined-cutover-parity", sessionId: "combined-cutover-parity" }),
    runtime: canonicalRuntime,
  });
}

/**
 * Verifies EXACT media/object inventory parity: every declared file has a matching canonical media
 * row (owner, size, sha256), the durably-stored Spaces object independently reports the same
 * byte length/digest (no signed URL or object content is ever read or returned), and there are no
 * unexpected owner-scoped rows beyond what the package declared.
 */
async function verifyMediaInventoryParity({ pool, objectProvider, ownerUserId, files }) {
  const expectedById = new Map(files.map((file) => [createPhase4MediaObjectId(file), file]));
  const result = await pool.query(
    `SELECT id,byte_length,sha256,storage_key,provider_version FROM physiqueos.canonical_media_objects WHERE owner_user_id=$1 ORDER BY id`,
    [ownerUserId],
  );
  const actualById = new Map(result.rows.map((row) => [row.id, row]));

  const missing = [...expectedById.keys()].filter((id) => !actualById.has(id));
  if (missing.length) throw preparationError(PreparationErrorCode.MEDIA_PARITY_MISMATCH, `Missing ${missing.length} expected media object(s).`);
  const unexpected = [...actualById.keys()].filter((id) => !expectedById.has(id));
  if (unexpected.length) throw preparationError(PreparationErrorCode.MEDIA_PARITY_MISMATCH, `${unexpected.length} unexpected owner-scoped media object(s) exist beyond the declared package.`);

  for (const [id, expected] of expectedById) {
    const actual = actualById.get(id);
    if (Number(actual.byte_length) !== expected.size || actual.sha256 !== expected.sha256) {
      throw preparationError(PreparationErrorCode.MEDIA_PARITY_MISMATCH, `Media object ${id} bytes/digest do not match the declared package.`);
    }
    const inspected = await objectProvider.inspectObject({ objectKey: actual.storage_key, providerVersion: actual.provider_version });
    if (inspected.byteLength !== expected.size || inspected.sha256 !== expected.sha256) {
      throw preparationError(PreparationErrorCode.MEDIA_PARITY_MISMATCH, `Stored media object ${id} does not match the declared package on independent inspection.`);
    }
  }
}

function safeMessage(error) {
  const message = String(error?.message ?? "unknown failure");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s|\/[A-Za-z]:[\\/]|\\Users\\/i.test(message)) return "see protected server logs";
  return message.slice(0, 300);
}
