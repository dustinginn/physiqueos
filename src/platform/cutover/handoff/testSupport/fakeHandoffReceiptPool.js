// Minimal stateful in-memory PostgreSQL double scoped to exactly the SQL
// `PostgresCombinedCutoverHandoffReceiptStore.js` issues. Test-support only; never imported by
// production code. Mirrors `src/platform/cutover/preparation/testSupport/fakePreparationPool.js`'s
// convention.
export function createFakeHandoffReceiptPool() {
  const rows = new Map();

  async function query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [], rowCount: 0 };

    if (normalized.startsWith("INSERT INTO physiqueos.combined_cutover_handoff_receipts")) {
      const [receiptId, schemaVersion, operationIdValue, fingerprint, fenceId, packageDigest, routingTarget, providerDeploymentId, expectedRouteSnapshot] = values;
      if (rows.has(operationIdValue)) return { rows: [], rowCount: 0 };
      const now = new Date().toISOString();
      const record = {
        receipt_id: receiptId, schema_version: schemaVersion, migration_operation_id: operationIdValue,
        authorization_fingerprint: fingerprint, fence_id: fenceId, package_digest: packageDigest,
        routing_target: routingTarget, provider_deployment_id: providerDeploymentId,
        expected_route_snapshot: expectedRouteSnapshot ? JSON.parse(expectedRouteSnapshot) : null,
        authority_status: "pending", authority_committed_at: null, resulting_authority: null,
        routing_status: "pending", routing_activated_at: null, routing_verified_at: null,
        windows_routing_restore_status: null, windows_routing_restore_at: null,
        created_at: now, updated_at: now,
      };
      rows.set(operationIdValue, record);
      return { rows: [record], rowCount: 1 };
    }

    if (normalized.startsWith("SELECT * FROM physiqueos.combined_cutover_handoff_receipts WHERE migration_operation_id=$1")) {
      const row = rows.get(values[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.includes("authority_status='committed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.authority_status = "committed"; row.authority_committed_at = new Date().toISOString();
      row.resulting_authority = values[1]; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("routing_status='activated'")) {
      const row = findByReceiptId(rows, values[0]);
      row.routing_status = "activated"; row.routing_activated_at = new Date().toISOString(); row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("routing_status='verified'")) {
      const row = findByReceiptId(rows, values[0]);
      row.routing_status = "verified"; row.routing_verified_at = row.routing_verified_at ?? new Date().toISOString(); row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("routing_status='failed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.routing_status = "failed"; row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("windows_routing_restore_status='restored'")) {
      const row = findByReceiptId(rows, values[0]);
      row.windows_routing_restore_status = "restored"; row.windows_routing_restore_at = new Date().toISOString(); row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("windows_routing_restore_status='failed'")) {
      const row = findByReceiptId(rows, values[0]);
      row.windows_routing_restore_status = "failed"; row.windows_routing_restore_at = new Date().toISOString(); row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }
    if (normalized.includes("windows_routing_restore_status='ambiguous'")) {
      const row = findByReceiptId(rows, values[0]);
      row.windows_routing_restore_status = "ambiguous"; row.windows_routing_restore_at = new Date().toISOString(); row.updated_at = new Date().toISOString();
      return { rows: [row], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL reached the fake handoff receipt pool: ${normalized}`);
  }

  const client = { query, release: () => undefined };
  return { connect: async () => client, query, inspectRows: () => [...rows.values()].map((row) => ({ ...row })) };
}

function findByReceiptId(rows, receiptId) {
  for (const row of rows.values()) if (row.receipt_id === receiptId) return row;
  throw new Error(`No handoff row for receipt ${receiptId}`);
}
