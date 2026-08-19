// Minimal stateful in-memory PostgreSQL double, scoped to exactly the SQL
// `PostgresCombinedCutoverTransferReceiptStore.js` issues (see the sibling
// `PostgresCombinedRuntimeAuthorityStore.test.js` for the same hand-rolled convention). Unlike the
// shared transactionalPostgresFixture, this does not model snapshot isolation: writes apply
// immediately, which is sufficient because the store never needs a later statement in the same
// transaction to observe an uncommitted write from an earlier one in these tests. Test-support
// only; never imported by production code. Shared by that store's own test file and the Phase 4
// production import/parity service test files, which need a real, working byte-level transfer
// receipt store to seed verified artifacts against.
export function createFakeCutoverTransferPool() {
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
