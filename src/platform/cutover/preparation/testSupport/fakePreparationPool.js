// Minimal stateful in-memory PostgreSQL double scoped to exactly the SQL
// `PostgresCombinedCutoverPreparationStore.js` issues. Test-support only; never imported by
// production code. Shared across that store's own test file and the production import/parity/
// acknowledge service test files so all four suites exercise identical fake behavior.
export function createFakePreparationPool() {
  const rows = new Map();

  async function query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [], rowCount: 0 };

    if (normalized.startsWith("INSERT INTO physiqueos.combined_cutover_preparation_receipts")) {
      const [receiptId, schemaVersion, operationIdValue, fingerprint, fenceId, packageDigest, targetDatabase] = values;
      if (rows.has(operationIdValue)) return { rows: [], rowCount: 0 };
      const now = new Date().toISOString();
      const record = {
        receipt_id: receiptId, schema_version: schemaVersion, migration_operation_id: operationIdValue,
        authorization_fingerprint: fingerprint, fence_id: fenceId, package_digest: packageDigest, target_database: targetDatabase,
        import_status: "pending", import_started_at: null, import_completed_at: null, imported_collection_counts: null, import_digest: null,
        media_status: "pending", media_object_count: null, media_byte_length: null,
        parity_status: "pending", parity_checked_at: null, parity_read_surface_count: null,
        prepared_status: "pending", prepared_acknowledged_at: null, provider_deployment_id: null,
        created_at: now, updated_at: now,
      };
      rows.set(operationIdValue, record);
      return { rows: [record], rowCount: 1 };
    }

    if (normalized.startsWith("SELECT * FROM physiqueos.combined_cutover_preparation_receipts WHERE migration_operation_id=$1")) {
      const row = rows.get(values[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.includes("import_status='running'")) {
      const row = findByReceiptId(rows, values[0]);
      row.import_status = "running"; row.import_started_at = new Date().toISOString(); row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("import_status='succeeded', import_completed_at=now()")) {
      const row = findByReceiptId(rows, values[0]);
      row.import_status = "succeeded"; row.import_completed_at = new Date().toISOString();
      row.imported_collection_counts = JSON.parse(values[1]); row.import_digest = values[2]; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("import_status='failed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.import_status = "failed"; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("media_status='succeeded'")) {
      const row = findByReceiptId(rows, values[0]);
      row.media_status = "succeeded"; row.media_object_count = values[1]; row.media_byte_length = values[2]; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("media_status='failed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.media_status = "failed"; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("parity_status='passed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.parity_status = "passed"; row.parity_checked_at = new Date().toISOString(); row.parity_read_surface_count = values[1]; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("parity_status='failed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.parity_status = "failed"; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("prepared_status='acknowledged'")) {
      const row = findByReceiptId(rows, values[0]);
      row.prepared_status = "acknowledged"; row.prepared_acknowledged_at = new Date().toISOString(); row.provider_deployment_id = values[1]; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL reached the fake preparation pool: ${normalized}`);
  }

  const client = { query, release: () => undefined };
  return { connect: async () => client, query, inspectRows: () => [...rows.values()].map((row) => ({ ...row })) };
}

function findByReceiptId(rows, receiptId) {
  for (const row of rows.values()) if (row.receipt_id === receiptId) return row;
  throw new Error(`No preparation row for receipt ${receiptId}`);
}
