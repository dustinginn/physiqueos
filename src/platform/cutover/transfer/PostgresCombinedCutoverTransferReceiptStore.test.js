import { describe, expect, it } from "vitest";
import { createPostgresCombinedCutoverTransferReceiptStore } from "./PostgresCombinedCutoverTransferReceiptStore.js";
import { createInMemoryCombinedCutoverTransferStaging, sha256Of } from "./combinedCutoverTransferStaging.js";
import { deriveTransferPackageId, deriveTransferReceiptId } from "./combinedCutoverTransferContract.js";

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
  const pool = createFakeCutoverPool();
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

// Minimal stateful in-memory PostgreSQL double, scoped to exactly the SQL this store issues (see
// the sibling PostgresCombinedRuntimeAuthorityStore.test.js for the same hand-rolled convention).
// Unlike the shared transactionalPostgresFixture, this does not model snapshot isolation: writes
// apply immediately, which is sufficient because the store never needs a later statement in the
// same transaction to observe an uncommitted write from an earlier one in these tests.
function createFakeCutoverPool() {
  const receiptsByKey = new Map(); // `${operationId}:${packageId}` -> row
  const receiptsById = new Map();  // receiptId -> row
  const chunks = new Map();        // `${receiptId}:${chunkIndex}` -> row

  async function query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();

    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [], rowCount: 0 };

    if (normalized.startsWith("INSERT INTO physiqueos.combined_cutover_transfer_receipts")) {
      const [receiptId, schemaVersion, operationIdValue, packageIdValue, overallDigest, expectedBytes, expectedChunkCount, chunkSizeBytes, stagingPrefix] = values;
      const key = `${operationIdValue}:${packageIdValue}`;
      if (receiptsByKey.has(key)) return { rows: [], rowCount: 0 };
      const now = new Date().toISOString();
      const row = {
        receipt_id: receiptId, schema_version: schemaVersion, migration_operation_id: operationIdValue, package_id: packageIdValue,
        overall_digest: overallDigest, expected_bytes: expectedBytes, received_bytes: 0,
        expected_chunk_count: expectedChunkCount, received_chunk_count: 0, chunk_size_bytes: chunkSizeBytes,
        status: "declared", staging_prefix: stagingPrefix, created_at: now, updated_at: now, completed_at: null, verified_at: null,
      };
      receiptsByKey.set(key, row);
      receiptsById.set(receiptId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalized.startsWith("SELECT * FROM physiqueos.combined_cutover_transfer_receipts WHERE migration_operation_id=$1 AND package_id=$2")) {
      const row = receiptsByKey.get(`${values[0]}:${values[1]}`);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith("SELECT chunk_digest,byte_offset,byte_length,staging_key FROM physiqueos.combined_cutover_transfer_chunks WHERE receipt_id=$1 AND chunk_index=$2")) {
      const row = chunks.get(`${values[0]}:${values[1]}`);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith("INSERT INTO physiqueos.combined_cutover_transfer_chunks")) {
      const [receiptId, chunkIndex, chunkDigest, byteOffset, byteLength, stagingKey] = values;
      chunks.set(`${receiptId}:${chunkIndex}`, {
        receipt_id: receiptId, chunk_index: chunkIndex, chunk_digest: chunkDigest,
        byte_offset: byteOffset, byte_length: byteLength, staging_key: stagingKey,
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith("UPDATE physiqueos.combined_cutover_transfer_receipts SET received_bytes=received_bytes+$2")) {
      const [receiptId, byteLength] = values;
      const row = receiptsById.get(receiptId);
      row.received_bytes += byteLength;
      row.received_chunk_count += 1;
      row.status = "receiving";
      row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    if (normalized.startsWith("SELECT chunk_index,staging_key FROM physiqueos.combined_cutover_transfer_chunks WHERE receipt_id=$1 ORDER BY chunk_index ASC")) {
      const rows = [...chunks.values()].filter((row) => row.receipt_id === values[0]).sort((a, b) => a.chunk_index - b.chunk_index);
      return { rows: rows.map((row) => ({ chunk_index: row.chunk_index, staging_key: row.staging_key })), rowCount: rows.length };
    }

    if (normalized.startsWith("UPDATE physiqueos.combined_cutover_transfer_receipts SET status='failed'")) {
      const row = receiptsById.get(values[0]);
      row.status = "failed";
      row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    if (normalized.startsWith("UPDATE physiqueos.combined_cutover_transfer_receipts SET status='verified'")) {
      const row = receiptsById.get(values[0]);
      row.status = "verified";
      row.completed_at = row.completed_at ?? new Date().toISOString();
      row.verified_at = new Date().toISOString();
      row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL reached the fake cutover transfer pool: ${normalized}`);
  }

  const client = { query, release: () => undefined };
  return { connect: async () => client, query };
}
