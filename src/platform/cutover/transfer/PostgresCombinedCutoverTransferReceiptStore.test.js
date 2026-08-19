import { describe, expect, it } from "vitest";
import { createPostgresCombinedCutoverTransferReceiptStore } from "./PostgresCombinedCutoverTransferReceiptStore.js";
import { createInMemoryCombinedCutoverTransferStaging, sha256Of } from "./combinedCutoverTransferStaging.js";
import { deriveTransferPackageId, deriveTransferReceiptId } from "./combinedCutoverTransferContract.js";
import { createFakeCutoverTransferPool } from "./testSupport/fakeCutoverTransferPool.js";

const digest = (character) => character.repeat(64);
const operationId = "combined-op-0001";
const packageId = deriveTransferPackageId("canonical-runtime.json");

function makePackage({ chunkSizeBytes = 8, chunkCount = 3, lastChunkLength = 4 } = {}) {
  const chunks = [];
  for (let index = 0; index < chunkCount - 1; index += 1) chunks.push(Buffer.alloc(chunkSizeBytes, index + 1));
  chunks.push(Buffer.alloc(lastChunkLength, chunkCount));
  const whole = Buffer.concat(chunks);
  return { chunks, whole, overallDigest: sha256Of(whole), expectedBytes: whole.length, expectedChunkCount: chunkCount, chunkSizeBytes };
}

function harness() {
  const staging = createInMemoryCombinedCutoverTransferStaging();
  const pool = createFakeCutoverTransferPool();
  const store = createPostgresCombinedCutoverTransferReceiptStore({ pool, staging });
  return { store, staging, pool };
}

describe("PostgreSQL combined cutover transfer receipts — declare", () => {
  it("declares a fresh receipt", async () => {
    const { store } = harness();
    const pkg = makePackage();
    const result = await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    expect(result.outcome).toBe("declared");
    expect(result.receipt.status).toBe("declared");
    expect(result.receipt.receivedChunkCount).toBe(0);
  });

  it("treats an identical redeclare as an idempotent replay", async () => {
    const { store } = harness();
    const pkg = makePackage();
    const input = { operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes };
    await store.declare(input);
    const second = await store.declare(input);
    expect(second.outcome).toBe("idempotent-replay");
  });

  it("rejects a redeclare with a different digest for the same operation/package", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await expect(store.declare({ operationId, packageId, overallDigest: digest("9"), expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_DIGEST_CONFLICT" });
  });
});

describe("PostgreSQL combined cutover transfer receipts — chunk upload", () => {
  it("accepts a first valid chunk", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    const result = await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(pkg.chunks[0]), bytes: pkg.chunks[0] });
    expect(result.outcome).toBe("received");
    expect(result.receipt.receivedChunkCount).toBe(1);
    expect(result.receipt.status).toBe("receiving");
  });

  it("treats an identical chunk redelivery as a safe idempotent replay", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    const chunkDigest = sha256Of(pkg.chunks[0]);
    await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest, bytes: pkg.chunks[0] });
    const replay = await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest, bytes: pkg.chunks[0] });
    expect(replay.outcome).toBe("idempotent-replay");
    expect(replay.receipt.receivedChunkCount).toBe(1);
  });

  it("fails closed on a conflicting chunk at the same index (different bytes/digest)", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(pkg.chunks[0]), bytes: pkg.chunks[0] });
    const different = Buffer.alloc(pkg.chunkSizeBytes, 99);
    await expect(store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(different), bytes: different }))
      .rejects.toMatchObject({ code: "TRANSFER_CHUNK_CONFLICT" });
  });

  it("rejects a chunk digest that does not match the actual bytes (independent server-side recomputation)", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await expect(store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: digest("f"), bytes: pkg.chunks[0] }))
      .rejects.toMatchObject({ code: "TRANSFER_CHUNK_DIGEST_MISMATCH" });
  });

  it("rejects a chunk whose byte length does not match its declared range (size mismatch)", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    const wrongLength = Buffer.alloc(pkg.chunkSizeBytes - 2, 1);
    await expect(store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(wrongLength), bytes: wrongLength }))
      .rejects.toMatchObject({ code: "TRANSFER_CHUNK_SIZE_MISMATCH" });
  });

  it("rejects a chunk index outside the declared range (invalid chunk range)", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await expect(store.receiveChunk({ operationId, packageId, chunkIndex: 99, chunkDigest: digest("1"), bytes: Buffer.alloc(4) }))
      .rejects.toThrow();
  });

  it("rejects any chunk for an operation/package that was never declared", async () => {
    const { store } = harness();
    await expect(store.receiveChunk({ operationId: "combined-op-unknown", packageId, chunkIndex: 0, chunkDigest: digest("1"), bytes: Buffer.alloc(4) }))
      .rejects.toMatchObject({ code: "TRANSFER_RECEIPT_UNAVAILABLE" });
  });
});

describe("PostgreSQL combined cutover transfer receipts — completion and verification", () => {
  async function declareAndUploadAll(store, pkg) {
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    for (let index = 0; index < pkg.chunks.length; index += 1) {
      await store.receiveChunk({ operationId, packageId, chunkIndex: index, chunkDigest: sha256Of(pkg.chunks[index]), bytes: pkg.chunks[index] });
    }
  }

  it("verifies a fully received package whose assembled digest matches", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await declareAndUploadAll(store, pkg);
    const result = await store.completeAndVerify({ operationId, packageId });
    expect(result.outcome).toBe("verified");
    expect(result.receipt.status).toBe("verified");
    expect(result.receipt.verifiedAt).not.toBeNull();
    expect(result.receipt.completedAt).not.toBeNull();
  });

  it("is idempotent on repeated completion of an already-verified receipt", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await declareAndUploadAll(store, pkg);
    await store.completeAndVerify({ operationId, packageId });
    const second = await store.completeAndVerify({ operationId, packageId });
    expect(second.outcome).toBe("idempotent-replay");
  });

  it("rejects completion before every declared chunk has been received (interrupted transfer resumed later)", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(pkg.chunks[0]), bytes: pkg.chunks[0] });
    await expect(store.completeAndVerify({ operationId, packageId })).rejects.toMatchObject({ code: "TRANSFER_INCOMPLETE" });
    // Resuming and sending the remaining chunks (including a duplicate of the first) then succeeds.
    await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(pkg.chunks[0]), bytes: pkg.chunks[0] });
    for (let index = 1; index < pkg.chunks.length; index += 1) {
      await store.receiveChunk({ operationId, packageId, chunkIndex: index, chunkDigest: sha256Of(pkg.chunks[index]), bytes: pkg.chunks[index] });
    }
    await expect(store.completeAndVerify({ operationId, packageId })).resolves.toMatchObject({ outcome: "verified" });
  });

  it("marks the receipt failed (not verified) when the assembled digest does not match the declared overall digest", async () => {
    const { store } = harness();
    const pkg = makePackage();
    // Declare with a digest that will not match the assembled bytes.
    await store.declare({ operationId, packageId, overallDigest: digest("7"), expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    for (let index = 0; index < pkg.chunks.length; index += 1) {
      await store.receiveChunk({ operationId, packageId, chunkIndex: index, chunkDigest: sha256Of(pkg.chunks[index]), bytes: pkg.chunks[index] });
    }
    await expect(store.completeAndVerify({ operationId, packageId })).rejects.toMatchObject({ code: "TRANSFER_ASSEMBLED_DIGEST_MISMATCH" });
    const status = await store.status(operationId, packageId);
    expect(status.receipt.status).toBe("failed");
  });
});

describe("PostgreSQL combined cutover transfer receipts — status and cross-operation isolation", () => {
  it("reconstructs the durable receipt via status()", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    const status = await store.status(operationId, packageId);
    expect(status.receipt).toMatchObject({
      receiptId: deriveTransferReceiptId({ operationId, packageId }),
      operationId, packageId, overallDigest: pkg.overallDigest,
      expectedBytes: pkg.expectedBytes, receivedBytes: 0,
      expectedChunkCount: pkg.expectedChunkCount, receivedChunkCount: 0,
      status: "declared",
    });
    expect(status.receipt.schemaVersion).toBe(1);
    expect(status.receipt.createdAt).not.toBeNull();
  });

  it("never exposes payload bytes or staging keys in the status projection", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    const status = await store.status(operationId, packageId);
    const serialized = JSON.stringify(status.receipt);
    expect(serialized).not.toContain("cutover-transfer/");
    expect(Object.keys(status.receipt)).not.toContain("bytes");
  });

  it("isolates status by exact (operationId, packageId): one operation cannot read another's transfer state", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await expect(store.status("combined-op-other", packageId)).rejects.toMatchObject({ code: "TRANSFER_RECEIPT_UNAVAILABLE" });
  });
});

describe("PostgreSQL combined cutover transfer receipts — readVerifiedBytes", () => {
  it("re-assembles and returns the exact bytes of a verified artifact", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    for (let index = 0; index < pkg.chunks.length; index += 1) {
      await store.receiveChunk({ operationId, packageId, chunkIndex: index, chunkDigest: sha256Of(pkg.chunks[index]), bytes: pkg.chunks[index] });
    }
    await store.completeAndVerify({ operationId, packageId });
    const { bytes, receipt } = await store.readVerifiedBytes({ operationId, packageId });
    expect(bytes.equals(pkg.whole)).toBe(true);
    expect(receipt.status).toBe("verified");
  });

  it("refuses to read bytes for an artifact that is not yet verified", async () => {
    const { store } = harness();
    const pkg = makePackage();
    await store.declare({ operationId, packageId, overallDigest: pkg.overallDigest, expectedBytes: pkg.expectedBytes, expectedChunkCount: pkg.expectedChunkCount, chunkSizeBytes: pkg.chunkSizeBytes });
    await store.receiveChunk({ operationId, packageId, chunkIndex: 0, chunkDigest: sha256Of(pkg.chunks[0]), bytes: pkg.chunks[0] });
    await expect(store.readVerifiedBytes({ operationId, packageId })).rejects.toMatchObject({ code: "TRANSFER_INCOMPLETE" });
  });

  it("refuses to read bytes for an operation/package that was never declared", async () => {
    const { store } = harness();
    await expect(store.readVerifiedBytes({ operationId: "combined-op-unknown", packageId })).rejects.toMatchObject({ code: "TRANSFER_RECEIPT_UNAVAILABLE" });
  });
});
