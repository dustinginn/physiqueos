import { describe, expect, it } from "vitest";
import {
  MAXIMUM_TRANSFER_CHUNK_COUNT,
  assertTransferStagingKey,
  createTransferStagingKey,
  deriveTransferPackageId,
  deriveTransferReceiptId,
  expectedChunkRange,
  isRetryableTransferFailure,
  requireTransferOperationId,
  requireTransferPackageId,
  validateTransferDeclaration,
} from "./combinedCutoverTransferContract.js";

const digest = (character) => character.repeat(64);

function expectTransferErrorCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected function to throw ${code}.`);
}

describe("combined cutover transfer identifiers", () => {
  it("rejects a malformed operation ID", () => {
    for (const bad of ["", "short", "has spaces", "a".repeat(200), "../escape"]) {
      expectTransferErrorCode(() => requireTransferOperationId(bad), "TRANSFER_IDENTITY_INVALID");
    }
  });

  it("rejects a malformed package ID, including traversal-shaped values", () => {
    for (const bad of ["", "short", "../../etc/passwd", "media/../secret", "a/b", "a\\b"]) {
      expect(() => requireTransferPackageId(bad)).toThrow();
    }
  });

  it("derives a deterministic, opaque package ID from a package-relative path", () => {
    const first = deriveTransferPackageId("media/photo.jpg");
    const second = deriveTransferPackageId("media/photo.jpg");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(first).not.toContain("photo");
  });

  it("rejects deriving a package ID from a traversal path", () => {
    expect(() => deriveTransferPackageId("../secret")).toThrow();
    expect(() => deriveTransferPackageId("media/../../secret")).toThrow();
    expect(() => deriveTransferPackageId("/absolute")).toThrow();
  });

  it("derives a stable receipt ID from operation and package identity", () => {
    const a = deriveTransferReceiptId({ operationId: "combined-op-0001", packageId: "p".repeat(32) });
    const b = deriveTransferReceiptId({ operationId: "combined-op-0001", packageId: "p".repeat(32) });
    const c = deriveTransferReceiptId({ operationId: "combined-op-0002", packageId: "p".repeat(32) });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("combined cutover transfer staging keys", () => {
  const operationId = "combined-op-0001";
  const packageId = deriveTransferPackageId("canonical-runtime.json");

  it("constructs a key inside the cutover-transfer namespace, bound to operation and package", () => {
    const key = createTransferStagingKey({ operationId, packageId, chunkIndex: 7 });
    expect(key).toBe(`cutover-transfer/${operationId}/${packageId}/chunks/0000000007`);
    expect(assertTransferStagingKey(key)).toBe(key);
  });

  it("rejects a chunk index that would overflow the maximum chunk count", () => {
    expect(() => createTransferStagingKey({ operationId, packageId, chunkIndex: MAXIMUM_TRANSFER_CHUNK_COUNT })).toThrow();
    expect(() => createTransferStagingKey({ operationId, packageId, chunkIndex: -1 })).toThrow();
  });

  it("rejects a caller-supplied key outside the cutover-transfer namespace (namespace escape)", () => {
    for (const bad of [
      "private/owner/object/original",
      "cutover-transfer/../private/owner/object",
      `cutover-transfer/${operationId}/${packageId}/../../../private/x`,
      "cutover-transfer/x",
      `cutover-transfer/${operationId}/${packageId}/chunks/not-a-number`,
    ]) {
      expectTransferErrorCode(() => assertTransferStagingKey(bad), "TRANSFER_STAGING_KEY_FORBIDDEN");
    }
  });
});

describe("combined cutover transfer declaration", () => {
  it("accepts a geometry where chunk count and size exactly span the declared byte length", () => {
    const declaration = validateTransferDeclaration({
      operationId: "combined-op-0001",
      packageId: deriveTransferPackageId("canonical-runtime.json"),
      overallDigest: digest("a"),
      expectedBytes: 20,
      expectedChunkCount: 3,
      chunkSizeBytes: 8,
    });
    expect(declaration.expectedChunkCount).toBe(3);
  });

  it("rejects a chunk count/size combination that cannot span the declared byte length", () => {
    const base = {
      operationId: "combined-op-0001",
      packageId: deriveTransferPackageId("canonical-runtime.json"),
      overallDigest: digest("a"),
      chunkSizeBytes: 8,
    };
    // 3 chunks of 8 bytes span (17..24]; 100 is far outside that range.
    expectTransferErrorCode(() => validateTransferDeclaration({ ...base, expectedBytes: 100, expectedChunkCount: 3 }), "TRANSFER_CHUNK_COUNT_CONFLICT");
    // 0 bytes is below the minimum for any positive chunk count.
    expect(() => validateTransferDeclaration({ ...base, expectedBytes: 0, expectedChunkCount: 1 })).toThrow();
  });

  it("computes the exact byte range for each chunk ordinal, including a short final chunk", () => {
    const declaration = validateTransferDeclaration({
      operationId: "combined-op-0001",
      packageId: deriveTransferPackageId("canonical-runtime.json"),
      overallDigest: digest("a"),
      expectedBytes: 20,
      expectedChunkCount: 3,
      chunkSizeBytes: 8,
    });
    expect(expectedChunkRange(declaration, 0)).toMatchObject({ byteOffset: 0, byteLength: 8 });
    expect(expectedChunkRange(declaration, 1)).toMatchObject({ byteOffset: 8, byteLength: 8 });
    expect(expectedChunkRange(declaration, 2)).toMatchObject({ byteOffset: 16, byteLength: 4 });
  });

  it("rejects a chunk index outside the declared chunk count", () => {
    const declaration = validateTransferDeclaration({
      operationId: "combined-op-0001",
      packageId: deriveTransferPackageId("canonical-runtime.json"),
      overallDigest: digest("a"),
      expectedBytes: 20,
      expectedChunkCount: 3,
      chunkSizeBytes: 8,
    });
    expect(() => expectedChunkRange(declaration, 3)).toThrow();
    expect(() => expectedChunkRange(declaration, -1)).toThrow();
  });
});

describe("retryable transfer failures", () => {
  it("marks only transport/staging faults as retryable, never semantic rejections", () => {
    expect(isRetryableTransferFailure("TRANSFER_STAGING_UNAVAILABLE")).toBe(true);
    expect(isRetryableTransferFailure("TRANSFER_TRANSPORT_FAILED")).toBe(true);
    expect(isRetryableTransferFailure("TRANSFER_AUTHENTICATION_FAILED")).toBe(false);
    expect(isRetryableTransferFailure("TRANSFER_CHUNK_DIGEST_MISMATCH")).toBe(false);
    expect(isRetryableTransferFailure("TRANSFER_OPERATION_FORBIDDEN")).toBe(false);
  });
});
