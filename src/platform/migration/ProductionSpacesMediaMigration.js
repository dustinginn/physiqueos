import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createPhase4MediaObjectId } from "./phase4LocalMediaMigration.js";
import { readAndValidateCanonicalPackage } from "./phase4CanonicalExport.js";

/**
 * `readSourceBytes(entry)`, when supplied, replaces the default "read from an immutable local
 * snapshot directory" source with any other already-integrity-checked byte source - for example
 * the combined-cutover transfer channel's verified Spaces staging (see
 * `src/platform/cutover/preparation/ProductionCanonicalImportService.js`), which has no local
 * `snapshotMediaRoot` at all. The upload/readback-verify/DB-update sequence below is identical
 * either way, so this is the single source of truth for that sequence; it is never duplicated.
 * `snapshotMediaRoot` remains required (and is enforced with its own integrity check, exactly as
 * before) when `readSourceBytes` is not supplied.
 */
export async function migrateCanonicalPackageMediaToSpaces({
  packageRoot,
  snapshotMediaRoot,
  pool,
  objectProvider,
  fetchImpl = globalThis.fetch,
  readSourceBytes = null,
} = {}) {
  if (!pool?.query || !objectProvider?.beginMultipartUpload || typeof fetchImpl !== "function") {
    throw new Error("Production media migration requires PostgreSQL, Spaces, and fetch adapters.");
  }
  if (typeof readSourceBytes !== "function" && !snapshotMediaRoot) {
    throw new Error("Production media migration requires either snapshotMediaRoot or readSourceBytes.");
  }
  const packageData = await readAndValidateCanonicalPackage(packageRoot);
  const mediaRoot = snapshotMediaRoot ? path.resolve(snapshotMediaRoot) : null;
  const readEntryBytes = typeof readSourceBytes === "function" ? readSourceBytes : async (entry) => {
    const absolutePath = path.resolve(mediaRoot, ...entry.relativePath.split("/"));
    if (!isWithin(mediaRoot, absolutePath)) throw new Error("Migration media path escaped the immutable snapshot.");
    return fs.readFile(absolutePath);
  };
  const uploaded = [];
  try {
    for (const entry of packageData.manifest.files) {
      // Re-checked here regardless of source, so an injected `readSourceBytes` can never skip
      // this integrity gate merely by being a different code path.
      const bytes = await readEntryBytes(entry);
      if (bytes.length !== entry.size || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
        throw new Error(`Migration source media integrity failed: ${entry.relativePath}.`);
      }
      const objectId = createPhase4MediaObjectId(entry);
      const begin = await objectProvider.beginMultipartUpload({
        ownerUserId: entry.ownerUserId,
        objectId,
        contentType: entry.mimeType,
        expectedSha256: entry.sha256,
      });
      const part = await objectProvider.authorizeUploadPart({
        objectKey: begin.objectKey,
        providerUploadId: begin.providerUploadId,
        partNumber: 1,
      });
      const response = await fetchImpl(part.url, { method: "PUT", body: bytes, headers: { "content-type": entry.mimeType } });
      if (!response.ok) {
        await objectProvider.abortMultipartUpload(begin).catch(() => undefined);
        throw new Error(`Spaces upload failed with HTTP ${response.status}.`);
      }
      const completed = await objectProvider.completeMultipartUpload({
        objectKey: begin.objectKey,
        providerUploadId: begin.providerUploadId,
        parts: [{ partNumber: 1, etag: response.headers.get("etag") }],
      });
      const migrated = Object.freeze({
        objectId,
        ownerUserId: entry.ownerUserId,
        objectKey: begin.objectKey,
        providerVersion: completed.providerVersion,
        size: entry.size,
        sha256: entry.sha256,
      });
      uploaded.push(migrated);
      const inspected = await objectProvider.inspectObject({ objectKey: begin.objectKey, providerVersion: completed.providerVersion });
      if (inspected.byteLength !== entry.size || inspected.sha256 !== entry.sha256) {
        throw new Error(`Spaces readback integrity failed: ${entry.relativePath}.`);
      }
      await pool.query(
        `UPDATE physiqueos.canonical_media_objects
            SET storage_key=$3,provider_version=$4,provider_etag=$5,updated_at=now()
          WHERE id=$1 AND owner_user_id=$2`,
        [objectId, entry.ownerUserId, begin.objectKey, completed.providerVersion, completed.etag],
      );
    }
    return Object.freeze({
      status: "passed",
      objectCount: uploaded.length,
      byteLength: uploaded.reduce((sum, item) => sum + item.size, 0),
      uploaded: Object.freeze(uploaded),
    });
  } catch (error) {
    error.uploadedProviderObjects = Object.freeze(uploaded);
    throw error;
  }
}

export async function rollbackMigratedSpacesMedia({ objectProvider, uploaded = [] } = {}) {
  const failures = [];
  for (const item of [...uploaded].reverse()) {
    try {
      await objectProvider.deleteObject({ objectKey: item.objectKey, providerVersion: item.providerVersion });
    } catch (error) {
      failures.push({ objectId: item.objectId, code: error?.code ?? "DELETE_FAILED" });
    }
  }
  if (failures.length) {
    const error = new Error("One or more pre-write Spaces versions could not be rolled back.");
    error.code = "SPACES_PREWRITE_ROLLBACK_INCOMPLETE";
    error.failures = failures;
    throw error;
  }
  return Object.freeze({ deletedVersionCount: uploaded.length });
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
