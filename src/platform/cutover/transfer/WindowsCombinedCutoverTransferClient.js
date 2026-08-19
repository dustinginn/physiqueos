// Windows-side HTTP client for the combined-cutover transfer channel, plus the production
// `transferSnapshot` orchestrator adapter built on top of it.
//
// TWO LAYERS ON THE WIRE.
//   1. Per-ARTIFACT byte transfer (chunked, resumable) - one manifest.json, one
//      canonical-runtime.json, and one entry per declared media file. Each artifact is identified
//      by an opaque `packageId` derived from its package-relative path
//      (`deriveTransferPackageId`), never by the raw path itself.
//   2. One operation-level MANIFEST declaration/completion, reusing the already-existing,
//      already-tested `physiqueos.combined_transfer_receipts` table and
//      `PostgresCombinedTransferReceiptStore` (migration 000005) via its own authenticated HTTP
//      surface. That table's declare/verify semantics - one row per operation, digest-bound,
//      idempotent on identical redeclaration, rejecting drift - are exactly the "receipts keyed by
//      (operation, package), bound to the package digest" contract the Phase 2B synthetic rehearsal
//      documents as the thing production transport must preserve, so it is reused rather than
//      duplicated. `manifest/complete` does not trust anything the client asserts about its own
//      artifacts: the provider independently re-checks every artifact's OWN already-verified,
//      server-computed digest (from layer 1) against the declared manifest before it will mark the
//      operation-level receipt verified.
//
// RESUME STRATEGY. `declareArtifact` is idempotent, and re-uploading an already-received chunk is a
// cheap idempotent replay (verified server-side by digest, not merely by presence). Resuming a
// transfer after interruption therefore does not require tracking which chunk indices already
// landed: the client simply redeclares (idempotent) and re-sends every chunk. Already-received
// chunks return quickly as `idempotent-replay`; only genuinely missing chunks do real work. This is
// not bandwidth-optimal on a resumed run, but it is simple and unconditionally correct, which is the
// right trade for a one-time cutover operation rather than a continuing sync service.
//
// RETRY BOUNDARY. Only network-level failures and the small set of explicitly retryable transfer
// error codes (`isRetryableTransferFailure`) are retried, and only up to `maxAttempts`. Every
// semantic rejection - authentication, operation binding, digest/size/count conflict, chunk
// conflict - is raised immediately without retry, because retrying those cannot change the outcome
// and would only hide a real cutover-recovery decision.

import { createHash } from "node:crypto";
import { open as openFile, stat } from "node:fs/promises";
import {
  DEFAULT_TRANSFER_CHUNK_BYTES,
  MAXIMUM_TRANSFER_CHUNK_BYTES,
  deriveTransferPackageId,
  isRetryableTransferFailure,
  transferError,
  TransferErrorCode,
} from "./combinedCutoverTransferContract.js";

export function createCombinedCutoverTransferHttpClient({
  fetchImpl = globalThis.fetch,
  baseUrl,
  credential,
  maxAttempts = 3,
  retryDelayMs = 250,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  if (!String(baseUrl ?? "").trim()) throw new Error("A provider transfer base URL is required.");
  if (!String(credential ?? "").trim()) throw new Error("A machine transfer credential is required.");
  // A trailing slash is required so relative sub-paths (including nested "manifest/...") resolve
  // additively rather than replacing the last path segment per WHATWG URL resolution.
  const origin = new URL(String(baseUrl).endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (origin.protocol !== "https:") throw new Error("The provider transfer base URL must use HTTPS.");

  async function request(path, { method = "GET", headers = {}, body = null } = {}) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response;
      try {
        response = await fetchImpl(new URL(path, origin), {
          method,
          headers: { authorization: `Bearer ${credential}`, ...headers },
          body,
        });
      } catch (cause) {
        if (attempt < maxAttempts) { await delay(retryDelayMs * attempt); continue; }
        throw transferError(TransferErrorCode.TRANSPORT_FAILED, "The transfer request could not reach the provider.", { retryable: true, cause });
      }
      let parsed = null;
      try { parsed = await response.json(); } catch { parsed = null; }
      if (response.ok) return parsed;
      const code = String(parsed?.code ?? "TRANSFER_TRANSPORT_FAILED");
      if (isRetryableTransferFailure(code) && attempt < maxAttempts) { await delay(retryDelayMs * attempt); continue; }
      throw transferError(code, `The provider rejected the transfer request (${response.status}).`, { retryable: isRetryableTransferFailure(code) });
    }
  }

  return Object.freeze({
    declareArtifact: (declaration) => request("declare", { method: "POST", headers: jsonHeaders, body: JSON.stringify(declaration) }),
    uploadChunk: ({ operationId, packageId, chunkIndex, chunkDigest, bytes }) => request("chunk", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.length),
        "x-physiqueos-operation-id": operationId,
        "x-physiqueos-package-id": packageId,
        "x-physiqueos-chunk-index": String(chunkIndex),
        "x-physiqueos-chunk-digest": chunkDigest,
      },
      body: bytes,
    }),
    completeArtifact: ({ operationId, packageId }) => request("complete", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ operationId, packageId }) }),
    statusArtifact: ({ operationId, packageId }) => request(`status?operationId=${encodeURIComponent(operationId)}&packageId=${encodeURIComponent(packageId)}`),
    declareManifest: (payload) => request("manifest/declare", { method: "POST", headers: jsonHeaders, body: JSON.stringify(payload) }),
    completeManifest: ({ operationId }) => request("manifest/complete", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ operationId }) }),
    statusManifest: ({ operationId }) => request(`manifest/status?operationId=${encodeURIComponent(operationId)}`),
  });
}

const jsonHeaders = Object.freeze({ "content-type": "application/json" });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/**
 * Transfers one artifact's bytes end to end: declare (idempotent), chunk-by-chunk upload in order,
 * then request server-side assembly and independent digest verification. Returns the provider's
 * verified receipt for the artifact.
 */
export async function transferArtifactBytes(client, { operationId, relativePath, readChunk, byteLength, sha256, chunkBytes = DEFAULT_TRANSFER_CHUNK_BYTES }) {
  const boundedChunkBytes = Math.min(chunkBytes, MAXIMUM_TRANSFER_CHUNK_BYTES);
  const packageId = deriveTransferPackageId(relativePath);
  const expectedChunkCount = Math.max(1, Math.ceil(byteLength / boundedChunkBytes));
  const declared = await client.declareArtifact({
    operationId, packageId, overallDigest: sha256, expectedBytes: byteLength,
    expectedChunkCount, chunkSizeBytes: boundedChunkBytes,
  });
  if (declared.overallDigest !== sha256 || declared.expectedBytes !== byteLength) {
    throw transferError(TransferErrorCode.PACKAGE_IDENTITY_MISMATCH, `Provider transfer declaration for ${relativePath} does not match the exported artifact.`);
  }
  for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
    const offset = chunkIndex * boundedChunkBytes;
    const length = Math.min(boundedChunkBytes, byteLength - offset);
    const bytes = await readChunk(offset, length);
    const chunkDigest = createHash("sha256").update(bytes).digest("hex");
    await client.uploadChunk({ operationId, packageId, chunkIndex, chunkDigest, bytes });
  }
  const completed = await client.completeArtifact({ operationId, packageId });
  if (completed.status !== "verified" || completed.overallDigest !== sha256) {
    throw transferError(TransferErrorCode.ASSEMBLED_DIGEST_MISMATCH, `Provider could not verify the transferred artifact ${relativePath}.`);
  }
  return Object.freeze({ packageId, relativePath, receipt: completed });
}

/** Reads one artifact from disk in bounded chunks without ever loading the whole file into memory. */
export async function createFileChunkReader(absolutePath) {
  const handle = await openFile(absolutePath, "r");
  return {
    read: async (offset, length) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw transferError(TransferErrorCode.CHUNK_SIZE_MISMATCH, `Read ${bytesRead} bytes, expected ${length}, from ${absolutePath}.`);
      return buffer;
    },
    close: () => handle.close(),
  };
}

/**
 * Builds the operation-level transfer manifest (every artifact path/size/sha256) from the exported
 * package. `exported` is `exportCanonicalPackage`'s return value; each media file's inventory entry
 * already carries its own size and sha256 from `phase4CanonicalExport.js`. `manifestFile` and
 * `runtimeFile` are hashed here from the bytes actually written to disk, so the manifest binds the
 * exact bytes that will be transferred, not a value computed earlier from in-memory structures.
 */
export async function buildCombinedCutoverTransferManifest({ exported, mediaRoot = null }) {
  const manifestStat = await hashFile(exported.manifestFile);
  const runtimeStat = await hashFile(exported.runtimeFile);
  const files = [
    { relativePath: "manifest.json", absolutePath: exported.manifestFile, byteLength: manifestStat.size, sha256: manifestStat.sha256 },
    { relativePath: "canonical-runtime.json", absolutePath: exported.runtimeFile, byteLength: runtimeStat.size, sha256: runtimeStat.sha256 },
    ...exported.manifest.files.map((file) => ({
      relativePath: `media/${file.relativePath}`,
      absolutePath: mediaRoot ? `${mediaRoot}/${file.relativePath}` : null,
      byteLength: file.size,
      sha256: file.sha256,
    })),
  ];
  return Object.freeze({ files: Object.freeze(files) });
}

async function hashFile(absolutePath) {
  const info = await stat(absolutePath);
  const reader = await createFileChunkReader(absolutePath);
  try {
    const bytes = await reader.read(0, info.size);
    return Object.freeze({ size: info.size, sha256: createHash("sha256").update(bytes).digest("hex") });
  } finally {
    await reader.close();
  }
}

/**
 * The production `transferSnapshot` orchestrator adapter. Preserves the synthetic rehearsal's
 * interface exactly: `async (context) => receipt`, where `context.exported` is
 * `exportFinalPackage`'s output and the returned receipt carries at least `packageDigest`, matching
 * what `syntheticCombinedCutoverRehearsal.js` produces, so it can be substituted into
 * `CombinedAppPlatformCutoverOrchestrator` without changing the orchestrator itself.
 *
 * Declares the operation-level manifest, transfers every artifact's bytes (resumable, idempotent),
 * requests provider-side cross-checked completion, and only then returns. It never imports
 * canonical data, moves authority, or touches routing/workers - those remain later orchestrator
 * phases untouched by this adapter.
 */
export function createProductionTransferSnapshotAdapter({ client, providerDeploymentId, mediaRoot = null, chunkBytes = DEFAULT_TRANSFER_CHUNK_BYTES }) {
  if (!client) throw new Error("A transfer HTTP client is required.");
  if (!String(providerDeploymentId ?? "").trim()) throw new Error("A provider deployment identity is required.");

  return async function transferSnapshot({ input, state, snapshot, exported }) {
    const operationId = input.migrationOperationId;
    // `snapshot` (from `captureFinalSnapshot`) is the digest identity already bound into runtime
    // authority by the orchestrator's BEGIN_CUTOVER transition; `exported` must package exactly
    // that fenced state. A mismatch here means the wrong package was exported for this operation,
    // and nothing should be transferred under the authority-bound digest.
    if (exported.manifest.semanticDigest !== snapshot.packageDigest) {
      throw transferError(TransferErrorCode.PACKAGE_IDENTITY_MISMATCH, "Exported package digest does not match the fenced snapshot bound to this cutover operation.");
    }
    const manifest = await buildCombinedCutoverTransferManifest({ exported, mediaRoot });
    const manifestDeclaration = await client.declareManifest({
      migrationOperationId: operationId,
      authorizationFingerprint: input.authorizationFingerprint,
      fenceId: state.fenceId,
      packageDigest: snapshot.packageDigest,
      runtimeSha256: snapshot.runtimeSha256,
      mediaInventorySha256: snapshot.mediaInventorySha256,
      migrationControlSha256: snapshot.migrationControlSha256,
      providerDeploymentId,
      manifest: { packageDigest: snapshot.packageDigest, files: manifest.files.map((file) => ({ path: file.relativePath, byteLength: file.byteLength, sha256: file.sha256 })) },
    });
    if (manifestDeclaration.packageDigest !== snapshot.packageDigest) {
      throw transferError(TransferErrorCode.PACKAGE_DIGEST_CONFLICT, "Provider manifest declaration does not match the exported package digest.");
    }

    for (const file of manifest.files) {
      if (!file.absolutePath) throw transferError(TransferErrorCode.IDENTITY_INVALID, `No local path is available to transfer ${file.relativePath}.`);
      const reader = await createFileChunkReader(file.absolutePath);
      try {
        await transferArtifactBytes(client, {
          operationId, relativePath: file.relativePath, byteLength: file.byteLength, sha256: file.sha256,
          chunkBytes, readChunk: reader.read,
        });
      } finally {
        await reader.close();
      }
    }

    const completed = await client.completeManifest({ operationId });
    if (completed.status !== "verified" || completed.packageDigest !== snapshot.packageDigest) {
      throw transferError(TransferErrorCode.ASSEMBLED_DIGEST_MISMATCH, "Provider did not verify the complete transferred package.");
    }
    return Object.freeze({
      receiptId: `${operationId}:${completed.packageDigest}`,
      migrationOperationId: operationId,
      packageDigest: completed.packageDigest,
      outcome: completed.outcome ?? "received",
    });
  };
}
