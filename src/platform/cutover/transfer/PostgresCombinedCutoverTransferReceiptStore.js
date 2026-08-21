// Durable, resumable receipt store for the combined-cutover byte transfer channel.
//
// This is the byte-level counterpart to `physiqueos.combined_transfer_receipts`
// (`PostgresCombinedTransferReceiptStore.js`), which is the operation-level authorization
// declaration. See migration 000006 for why the two do not share a table. Rows here never confer
// runtime authority: verifying a receipt proves bytes were received and match their declared
// digest, nothing more.
//
// IDEMPOTENCY. Redelivering an identical chunk (same digest, same bytes) is always safe and returns
// the existing outcome without re-staging semantics changing. A chunk redelivered at the same index
// with a different digest fails closed (`TRANSFER_CHUNK_CONFLICT`) rather than silently overwriting
// evidence. A `declare` for an operation/package already declared with a different digest, size, or
// chunk count fails closed rather than being accepted.
//
// CROSS-OPERATION ISOLATION. Every read is scoped by the exact (operationId, packageId) the caller
// supplies; there is no listing or enumeration surface, so one operation's transfer state can never
// be discovered by walking another's.

import {
  COMBINED_CUTOVER_TRANSFER_RECEIPT_SCHEMA_VERSION,
  TransferErrorCode,
  TransferStatus,
  createTransferStagingKey,
  createTransferStagingPrefix,
  deriveTransferReceiptId,
  expectedChunkRange,
  requireTransferDigest,
  requireTransferOperationId,
  requireTransferPackageId,
  transferError,
  validateTransferDeclaration,
} from "./combinedCutoverTransferContract.js";
import { sha256Of } from "./combinedCutoverTransferStaging.js";

export function createPostgresCombinedCutoverTransferReceiptStore({ pool, staging } = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Combined cutover transfer receipts require PostgreSQL.");
  if (!staging?.put || !staging?.read) throw new Error("Combined cutover transfer receipts require a staging substrate.");

  return Object.freeze({
    async declare(input) {
      const declaration = validateTransferDeclaration(input);
      const receiptId = deriveTransferReceiptId(declaration);
      const stagingPrefix = createTransferStagingPrefix(declaration);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO physiqueos.combined_cutover_transfer_receipts
            (receipt_id,schema_version,migration_operation_id,package_id,overall_digest,expected_bytes,
             expected_chunk_count,received_bytes,received_chunk_count,chunk_size_bytes,status,staging_prefix)
           VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,'declared',$9)
           ON CONFLICT (migration_operation_id,package_id) DO NOTHING RETURNING *`,
          [receiptId, declaration.schemaVersion, declaration.operationId, declaration.packageId, declaration.overallDigest,
            declaration.expectedBytes, declaration.expectedChunkCount, declaration.chunkSizeBytes, stagingPrefix],
        );
        if (inserted.rows[0]) {
          await client.query("COMMIT");
          return freeze({ receipt: row(inserted.rows[0]), outcome: "declared" });
        }
        const existing = await readReceiptRow(client, declaration, { forUpdate: true });
        assertSameDeclaration(existing, declaration);
        await client.query("COMMIT");
        return freeze({ receipt: row(existing), outcome: "idempotent-replay" });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async receiveChunk({ operationId, packageId, chunkIndex, chunkDigest, bytes }) {
      const operation = requireTransferOperationId(operationId);
      const packageIdentity = requireTransferPackageId(packageId);
      const declaredDigest = requireTransferDigest(chunkDigest, "chunkDigest");
      const buffer = Buffer.from(bytes);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const receipt = await readReceiptRow(client, { operationId: operation, packageId: packageIdentity }, { forUpdate: true });
        if (![TransferStatus.DECLARED, TransferStatus.RECEIVING].includes(receipt.status)) {
          throw transferError(TransferErrorCode.CHUNK_CONFLICT, "Transfer is not accepting chunks in its current state.");
        }
        const range = expectedChunkRange(toDeclaration(receipt), chunkIndex);
        if (buffer.length !== range.byteLength) throw transferError(TransferErrorCode.CHUNK_SIZE_MISMATCH, "Chunk byte length does not match its declared range.");
        const computedDigest = sha256Of(buffer);
        if (computedDigest !== declaredDigest) throw transferError(TransferErrorCode.CHUNK_DIGEST_MISMATCH, "Chunk digest does not match its declared value.");

        const existingChunk = await client.query(
          `SELECT chunk_digest,byte_offset,byte_length,staging_key FROM physiqueos.combined_cutover_transfer_chunks
            WHERE receipt_id=$1 AND chunk_index=$2`,
          [receipt.receipt_id, range.chunkIndex],
        );
        if (existingChunk.rows[0]) {
          if (existingChunk.rows[0].chunk_digest !== computedDigest) {
            throw transferError(TransferErrorCode.CHUNK_CONFLICT, "A different chunk was already recorded at this index.");
          }
          await client.query("COMMIT");
          return freeze({ outcome: "idempotent-replay", chunkIndex: range.chunkIndex, receipt: row(receipt) });
        }

        const stagingKey = createTransferStagingKey({ operationId: operation, packageId: packageIdentity, chunkIndex: range.chunkIndex });
        await staging.put({ key: stagingKey, bytes: buffer });

        await client.query(
          `INSERT INTO physiqueos.combined_cutover_transfer_chunks
            (receipt_id,chunk_index,chunk_digest,byte_offset,byte_length,staging_key)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [receipt.receipt_id, range.chunkIndex, computedDigest, range.byteOffset, range.byteLength, stagingKey],
        );
        const updated = await client.query(
          `UPDATE physiqueos.combined_cutover_transfer_receipts SET
             received_bytes=received_bytes+$2, received_chunk_count=received_chunk_count+1,
             status='receiving', updated_at=now()
           WHERE receipt_id=$1 RETURNING *`,
          [receipt.receipt_id, range.byteLength],
        );
        await client.query("COMMIT");
        return freeze({ outcome: "received", chunkIndex: range.chunkIndex, receipt: row(updated.rows[0]) });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    /**
     * Assembles every declared chunk from staging in ordinal order, independently recomputes the
     * whole-package SHA-256, and only then marks the receipt verified. A mismatch marks the receipt
     * failed rather than verified - byte receipt alone is never treated as a successful transfer.
     */
    async completeAndVerify({ operationId, packageId }) {
      const operation = requireTransferOperationId(operationId);
      const packageIdentity = requireTransferPackageId(packageId);
      const client = await pool.connect();
      let receipt;
      try {
        await client.query("BEGIN");
        receipt = await readReceiptRow(client, { operationId: operation, packageId: packageIdentity }, { forUpdate: true });
        if (receipt.status === TransferStatus.VERIFIED) {
          await client.query("COMMIT");
          return freeze({ outcome: "idempotent-replay", receipt: row(receipt) });
        }
        if (receipt.received_chunk_count !== receipt.expected_chunk_count || Number(receipt.received_bytes) !== Number(receipt.expected_bytes)) {
          await client.query("ROLLBACK");
          throw transferError(TransferErrorCode.INCOMPLETE, "Every declared chunk must be received before verification.");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      const chunkRows = await pool.query(
        `SELECT chunk_index,staging_key FROM physiqueos.combined_cutover_transfer_chunks
          WHERE receipt_id=$1 ORDER BY chunk_index ASC`,
        [receipt.receipt_id],
      );
      const parts = [];
      for (const chunkRow of chunkRows.rows) parts.push(await staging.read({ key: chunkRow.staging_key }));
      const assembledDigest = sha256Of(Buffer.concat(parts));

      const finalClient = await pool.connect();
      try {
        await finalClient.query("BEGIN");
        const current = await readReceiptRow(finalClient, { operationId: operation, packageId: packageIdentity }, { forUpdate: true });
        if (current.status === TransferStatus.VERIFIED) {
          await finalClient.query("COMMIT");
          return freeze({ outcome: "idempotent-replay", receipt: row(current) });
        }
        if (assembledDigest !== current.overall_digest) {
          const failed = await finalClient.query(
            `UPDATE physiqueos.combined_cutover_transfer_receipts SET status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`,
            [current.receipt_id],
          );
          await finalClient.query("COMMIT");
          throw transferError(TransferErrorCode.ASSEMBLED_DIGEST_MISMATCH, "The assembled package digest did not match the declared overall digest.", { retryable: false, receipt: row(failed.rows[0]) });
        }
        const verified = await finalClient.query(
          `UPDATE physiqueos.combined_cutover_transfer_receipts SET
             status='verified', completed_at=COALESCE(completed_at, now()), verified_at=now(), updated_at=now()
           WHERE receipt_id=$1 RETURNING *`,
          [current.receipt_id],
        );
        await finalClient.query("COMMIT");
        return freeze({ outcome: "verified", receipt: row(verified.rows[0]) });
      } catch (error) {
        await finalClient.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        finalClient.release();
      }
    },

    /** Authenticated read-only status, scoped strictly to the caller's own (operationId, packageId). */
    async status(operationId, packageId) {
      const result = await pool.query(
        `SELECT * FROM physiqueos.combined_cutover_transfer_receipts WHERE migration_operation_id=$1 AND package_id=$2`,
        [requireTransferOperationId(operationId), requireTransferPackageId(packageId)],
      );
      if (!result.rows[0]) throw transferError(TransferErrorCode.RECEIPT_UNAVAILABLE, "Combined cutover transfer receipt is unavailable.");
      return freeze({ receipt: row(result.rows[0]) });
    },

    /**
     * Consumer-side read of an already-`verified` artifact's assembled bytes, for callers (such as
     * canonical import) that need the transferred content itself rather than just its receipt. This
     * never trusts the stored `verified` status alone: it re-assembles every chunk from staging and
     * re-recomputes the whole-artifact digest before returning bytes, so a staging substrate that
     * was corrupted or tampered with after verification is still caught rather than silently
     * imported. Refuses any receipt that is not exactly `verified`.
     */
    async readVerifiedBytes({ operationId, packageId }) {
      const operation = requireTransferOperationId(operationId);
      const packageIdentity = requireTransferPackageId(packageId);
      const receipt = await readReceiptRow(pool, { operationId: operation, packageId: packageIdentity });
      if (receipt.status !== TransferStatus.VERIFIED) {
        throw transferError(TransferErrorCode.INCOMPLETE, "Only a verified transfer artifact can be read for import.");
      }
      const chunkRows = await pool.query(
        `SELECT chunk_index,staging_key FROM physiqueos.combined_cutover_transfer_chunks
          WHERE receipt_id=$1 ORDER BY chunk_index ASC`,
        [receipt.receipt_id],
      );
      const parts = [];
      for (const chunkRow of chunkRows.rows) parts.push(await staging.read({ key: chunkRow.staging_key }));
      const bytes = Buffer.concat(parts);
      if (sha256Of(bytes) !== receipt.overall_digest) {
        throw transferError(TransferErrorCode.ASSEMBLED_DIGEST_MISMATCH, "Re-assembled artifact bytes no longer match the verified digest.");
      }
      return freeze({ bytes, receipt: row(receipt) });
    },
  });
}

async function readReceiptRow(client, { operationId, packageId }, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT * FROM physiqueos.combined_cutover_transfer_receipts WHERE migration_operation_id=$1 AND package_id=$2${forUpdate ? " FOR UPDATE" : ""}`,
    [operationId, packageId],
  );
  if (!result.rows[0]) throw transferError(TransferErrorCode.RECEIPT_UNAVAILABLE, "Combined cutover transfer receipt is unavailable.");
  return result.rows[0];
}

function toDeclaration(receiptRow) {
  return Object.freeze({
    expectedBytes: Number(receiptRow.expected_bytes),
    expectedChunkCount: Number(receiptRow.expected_chunk_count),
    chunkSizeBytes: Number(receiptRow.chunk_size_bytes),
  });
}

function assertSameDeclaration(existing, declaration) {
  if (existing.overall_digest !== declaration.overallDigest) throw transferError(TransferErrorCode.PACKAGE_DIGEST_CONFLICT, "Existing transfer declaration has a different overall digest.");
  if (Number(existing.expected_bytes) !== declaration.expectedBytes) throw transferError(TransferErrorCode.PACKAGE_SIZE_CONFLICT, "Existing transfer declaration has a different expected size.");
  if (Number(existing.expected_chunk_count) !== declaration.expectedChunkCount || Number(existing.chunk_size_bytes) !== declaration.chunkSizeBytes) {
    throw transferError(TransferErrorCode.CHUNK_COUNT_CONFLICT, "Existing transfer declaration has a different chunk geometry.");
  }
}

function row(value) {
  return freeze({
    schemaVersion: value.schema_version,
    receiptId: value.receipt_id,
    operationId: value.migration_operation_id,
    packageId: value.package_id,
    overallDigest: value.overall_digest,
    expectedBytes: Number(value.expected_bytes),
    receivedBytes: Number(value.received_bytes),
    expectedChunkCount: value.expected_chunk_count,
    receivedChunkCount: value.received_chunk_count,
    chunkSizeBytes: value.chunk_size_bytes,
    status: value.status,
    createdAt: toIso(value.created_at),
    updatedAt: toIso(value.updated_at),
    completedAt: toIso(value.completed_at),
    verifiedAt: toIso(value.verified_at),
  });
}

function toIso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function freeze(value) { return Object.freeze(value); }

export { COMBINED_CUTOVER_TRANSFER_RECEIPT_SCHEMA_VERSION };
