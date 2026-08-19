// Wire contract, identifier validation, and staging-key construction for the combined-cutover
// provider transfer channel.
//
// SCOPE. This channel moves BYTES of an authorized final package to the provider and nothing else.
// It never imports canonical data, never transfers runtime authority, never sets
// `firstProviderCanonicalWriteAt`, never enables provider production writes, never switches routing,
// and never starts a worker. Those remain exclusively the orchestrator's later phases.
//
// UNIT OF TRANSFER. Per docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase E, chunks are
// scoped to operation, artifact, ordinal, byte range, size, and SHA-256. The unit is therefore one
// ARTIFACT of the operation's package - `manifest.json`, `canonical-runtime.json`, or one declared
// media file - referred to here as a `packageId`. Every chunk is bound to
// (operationId, packageId, overallDigest, chunkIndex, chunkDigest, expectedChunkCount, expectedBytes).
//
// PACKAGE IDENTITY IS OPAQUE. `packageId` is derived Windows-side as the first 32 hex characters of
// SHA-256 over the artifact's package-relative path (`deriveTransferPackageId`). It is deterministic,
// so the provider can re-derive the artifact-to-packageId mapping from the transferred manifest at
// import time, and it is opaque, so no Windows path or Spaces key is ever accepted as input or
// echoed in a response. The provider validates only the identifier shape; it never interprets a
// caller-supplied path.

import { createHash } from "node:crypto";

export const COMBINED_CUTOVER_TRANSFER_CONTRACT = "combined-cutover-transfer-v1";
export const COMBINED_CUTOVER_TRANSFER_RECEIPT_SCHEMA_VERSION = 1;
export const COMBINED_CUTOVER_TRANSFER_STAGING_PREFIX = "cutover-transfer";
export const COMBINED_CUTOVER_TRANSFER_ROUTE_PREFIX = "/api/v1/operations/combined-cutover/transfer";

// App Platform fronts the web service with a proxy; a single request carrying the whole ~319 MB
// production package (30,262,748-byte Founder runtime plus 402 media files / 288,919,315 bytes) is
// not a safe assumption at any ingress. The channel is therefore chunked and resumable by
// construction, with a bounded per-request body so no single request can exhaust the 512 MiB
// instance.
export const DEFAULT_TRANSFER_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAXIMUM_TRANSFER_CHUNK_BYTES = 16 * 1024 * 1024;
export const MAXIMUM_TRANSFER_CHUNK_COUNT = 100_000;
export const MAXIMUM_TRANSFER_PACKAGE_BYTES = 4 * 1024 * 1024 * 1024;

export const TransferStatus = Object.freeze({
  DECLARED: "declared",
  RECEIVING: "receiving",
  VERIFIED: "verified",
  FAILED: "failed",
});

export const TransferErrorCode = Object.freeze({
  NOT_CONFIGURED: "TRANSFER_NOT_CONFIGURED",
  AUTHENTICATION_REQUIRED: "TRANSFER_AUTHENTICATION_REQUIRED",
  AUTHENTICATION_FAILED: "TRANSFER_AUTHENTICATION_FAILED",
  CREDENTIAL_EXPIRED: "TRANSFER_CREDENTIAL_EXPIRED",
  OPERATION_FORBIDDEN: "TRANSFER_OPERATION_FORBIDDEN",
  IDENTITY_INVALID: "TRANSFER_IDENTITY_INVALID",
  ROUTE_INVALID: "TRANSFER_ROUTE_INVALID",
  CONTENT_TYPE_REQUIRED: "TRANSFER_CONTENT_TYPE_REQUIRED",
  PAYLOAD_TOO_LARGE: "TRANSFER_PAYLOAD_TOO_LARGE",
  CHUNK_RANGE_INVALID: "TRANSFER_CHUNK_RANGE_INVALID",
  CHUNK_SIZE_MISMATCH: "TRANSFER_CHUNK_SIZE_MISMATCH",
  CHUNK_DIGEST_MISMATCH: "TRANSFER_CHUNK_DIGEST_MISMATCH",
  CHUNK_CONFLICT: "TRANSFER_CHUNK_CONFLICT",
  PACKAGE_DIGEST_CONFLICT: "TRANSFER_PACKAGE_DIGEST_CONFLICT",
  PACKAGE_SIZE_CONFLICT: "TRANSFER_PACKAGE_SIZE_CONFLICT",
  CHUNK_COUNT_CONFLICT: "TRANSFER_CHUNK_COUNT_CONFLICT",
  RECEIPT_UNAVAILABLE: "TRANSFER_RECEIPT_UNAVAILABLE",
  RECEIPT_OPERATION_CONFLICT: "TRANSFER_RECEIPT_OPERATION_CONFLICT",
  INCOMPLETE: "TRANSFER_INCOMPLETE",
  ASSEMBLED_DIGEST_MISMATCH: "TRANSFER_ASSEMBLED_DIGEST_MISMATCH",
  STAGING_UNAVAILABLE: "TRANSFER_STAGING_UNAVAILABLE",
  STAGING_KEY_FORBIDDEN: "TRANSFER_STAGING_KEY_FORBIDDEN",
  PACKAGE_IDENTITY_MISMATCH: "TRANSFER_PACKAGE_IDENTITY_MISMATCH",
  TRANSPORT_FAILED: "TRANSFER_TRANSPORT_FAILED",
});

// Automatic retry is permitted ONLY for idempotent transport failures. Every semantic rejection -
// authentication, operation binding, digest/size/count conflict, chunk conflict - is terminal and
// must reach a human cutover decision instead of being retried into a different outcome.
const RETRYABLE_CODES = new Set([
  TransferErrorCode.STAGING_UNAVAILABLE,
  TransferErrorCode.TRANSPORT_FAILED,
]);

export function isRetryableTransferFailure(code) {
  return RETRYABLE_CODES.has(String(code ?? ""));
}

const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STAGING_KEY_PATTERN = /^cutover-transfer\/[A-Za-z0-9][A-Za-z0-9._:-]{7,159}\/[A-Za-z0-9][A-Za-z0-9._-]{7,127}\/chunks\/[0-9]{10}$/;

export function requireTransferOperationId(value) {
  const candidate = String(value ?? "");
  if (!OPERATION_ID_PATTERN.test(candidate) || candidate.includes("..")) {
    throw transferError(TransferErrorCode.IDENTITY_INVALID, "Transfer operation identity is invalid.");
  }
  return candidate;
}

export function requireTransferPackageId(value) {
  const candidate = String(value ?? "");
  if (!PACKAGE_ID_PATTERN.test(candidate) || candidate.includes("..")) {
    throw transferError(TransferErrorCode.IDENTITY_INVALID, "Transfer package identity is invalid.");
  }
  return candidate;
}

export function requireTransferDigest(value, field) {
  const candidate = String(value ?? "").toLowerCase();
  if (!SHA256_PATTERN.test(candidate)) throw transferError(TransferErrorCode.IDENTITY_INVALID, `${field} must be a SHA-256 digest.`);
  return candidate;
}

export function requireTransferInteger(value, field, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw transferError(TransferErrorCode.IDENTITY_INVALID, `${field} is invalid.`);
  }
  return candidate;
}

export function deriveTransferPackageId(packageRelativePath) {
  const normalized = String(packageRelativePath ?? "").replaceAll("\\", "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw transferError(TransferErrorCode.IDENTITY_INVALID, "A package-relative artifact path is required.");
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
}

export function createTransferStagingPrefix({ operationId, packageId }) {
  return `${COMBINED_CUTOVER_TRANSFER_STAGING_PREFIX}/${requireTransferOperationId(operationId)}/${requireTransferPackageId(packageId)}`;
}

/**
 * Staging keys are constructed only from already-validated opaque identifiers and a zero-padded
 * ordinal. The finished key is re-checked against a whole-string pattern so no future caller can
 * smuggle a separator, traversal segment, or namespace escape into the staging namespace, and so the
 * key can never collide with the canonical private media namespace (`private/<owner>/...`).
 */
export function createTransferStagingKey({ operationId, packageId, chunkIndex }) {
  const ordinal = requireTransferInteger(chunkIndex, "chunkIndex", { minimum: 0, maximum: MAXIMUM_TRANSFER_CHUNK_COUNT - 1 });
  const key = `${createTransferStagingPrefix({ operationId, packageId })}/chunks/${String(ordinal).padStart(10, "0")}`;
  if (!STAGING_KEY_PATTERN.test(key)) throw transferError(TransferErrorCode.STAGING_KEY_FORBIDDEN, "Constructed staging key is not inside the cutover-transfer namespace.");
  return key;
}

export function assertTransferStagingKey(key) {
  const candidate = String(key ?? "");
  if (!STAGING_KEY_PATTERN.test(candidate) || candidate.includes("..")) {
    throw transferError(TransferErrorCode.STAGING_KEY_FORBIDDEN, "Staging key is outside the cutover-transfer namespace.");
  }
  return candidate;
}

export function deriveTransferReceiptId({ operationId, packageId }) {
  const digest = createHash("sha256")
    .update(`${requireTransferOperationId(operationId)} ${requireTransferPackageId(packageId)}`, "utf8")
    .digest("hex");
  return `cctr_${digest.slice(0, 32)}`;
}

/** Declared geometry must be internally consistent before any byte is accepted or staged. */
export function validateTransferDeclaration(input = {}) {
  const declaration = Object.freeze({
    schemaVersion: COMBINED_CUTOVER_TRANSFER_RECEIPT_SCHEMA_VERSION,
    operationId: requireTransferOperationId(input.operationId),
    packageId: requireTransferPackageId(input.packageId),
    overallDigest: requireTransferDigest(input.overallDigest, "overallDigest"),
    expectedBytes: requireTransferInteger(input.expectedBytes, "expectedBytes", { minimum: 1, maximum: MAXIMUM_TRANSFER_PACKAGE_BYTES }),
    expectedChunkCount: requireTransferInteger(input.expectedChunkCount, "expectedChunkCount", { minimum: 1, maximum: MAXIMUM_TRANSFER_CHUNK_COUNT }),
    chunkSizeBytes: requireTransferInteger(input.chunkSizeBytes, "chunkSizeBytes", { minimum: 1, maximum: MAXIMUM_TRANSFER_CHUNK_BYTES }),
  });
  const minimumBytes = (declaration.expectedChunkCount - 1) * declaration.chunkSizeBytes + 1;
  const maximumBytes = declaration.expectedChunkCount * declaration.chunkSizeBytes;
  if (declaration.expectedBytes < minimumBytes || declaration.expectedBytes > maximumBytes) {
    throw transferError(TransferErrorCode.CHUNK_COUNT_CONFLICT, "Declared chunk count does not span the declared package size.");
  }
  return declaration;
}

/** The byte range a chunk ordinal must occupy under an accepted declaration. */
export function expectedChunkRange(declaration, chunkIndex) {
  const ordinal = requireTransferInteger(chunkIndex, "chunkIndex", { minimum: 0, maximum: declaration.expectedChunkCount - 1 });
  const byteOffset = ordinal * declaration.chunkSizeBytes;
  return Object.freeze({
    chunkIndex: ordinal,
    byteOffset,
    byteLength: Math.min(declaration.chunkSizeBytes, declaration.expectedBytes - byteOffset),
  });
}

export function transferError(code, message, { retryable = RETRYABLE_CODES.has(code) } = {}) {
  return Object.assign(new Error(message), { code, retryable });
}
