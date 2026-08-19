// Durable, operation-bound routing-intent evidence store for the combined-cutover authority/routing
// handoff phase. See migration 000008 for why this is a new, narrow table rather than an overload of
// Phase 4's preparation-evidence table. `physiqueos.combined_runtime_authority` remains the sole
// authority source; this store never decides eligibility and is never consulted as a precondition by
// `CombinedRuntimeAuthorityState` - it is diagnostic/recovery evidence only.
//
// Every write method requires and re-checks `expectedPackageDigest` against the durable row, exactly
// like the Phase 4 preparation store, so a stale or conflicting caller fails closed rather than
// corrupting evidence for a reused operation ID.

import { requireTransferDigest, requireTransferOperationId, transferError, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";

export const COMBINED_CUTOVER_HANDOFF_SCHEMA_VERSION = 1;

export function createPostgresCombinedCutoverHandoffReceiptStore({ pool } = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Combined cutover handoff evidence requires PostgreSQL.");

  return Object.freeze({
    async declare({ migrationOperationId, authorizationFingerprint, fenceId, packageDigest, routingTarget, providerDeploymentId, expectedRouteSnapshot = null }) {
      const operationId = requireTransferOperationId(migrationOperationId);
      const digest = requireTransferDigest(packageDigest, "packageDigest");
      const fingerprint = requireTransferDigest(authorizationFingerprint, "authorizationFingerprint");
      if (!String(fenceId ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "fenceId is required.");
      if (!String(routingTarget ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "routingTarget is required.");
      if (!String(providerDeploymentId ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "providerDeploymentId is required.");
      const receiptId = `ccht_${operationId}`;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO physiqueos.combined_cutover_handoff_receipts
            (receipt_id,schema_version,migration_operation_id,authorization_fingerprint,fence_id,package_digest,
             routing_target,provider_deployment_id,expected_route_snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
           ON CONFLICT (migration_operation_id) DO NOTHING RETURNING *`,
          [receiptId, COMBINED_CUTOVER_HANDOFF_SCHEMA_VERSION, operationId, fingerprint, fenceId, digest,
            routingTarget, providerDeploymentId, expectedRouteSnapshot == null ? null : JSON.stringify(expectedRouteSnapshot)],
        );
        if (inserted.rows[0]) {
          await client.query("COMMIT");
          return freeze({ receipt: row(inserted.rows[0]), outcome: "declared" });
        }
        const existing = await readRow(client, operationId, { forUpdate: true });
        assertSameIdentity(existing, { authorizationFingerprint: fingerprint, fenceId, packageDigest: digest, routingTarget, providerDeploymentId });
        await client.query("COMMIT");
        return freeze({ receipt: row(existing), outcome: "idempotent-replay" });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async read(migrationOperationId) {
      const result = await pool.query(
        `SELECT * FROM physiqueos.combined_cutover_handoff_receipts WHERE migration_operation_id=$1`,
        [requireTransferOperationId(migrationOperationId)],
      );
      if (!result.rows[0]) throw transferError(TransferErrorCode.RECEIPT_UNAVAILABLE, "Combined cutover handoff evidence is unavailable.");
      return freeze({ receipt: row(result.rows[0]) });
    },

    async recordAuthorityCommitted({ migrationOperationId, expectedPackageDigest, resultingAuthority }) {
      if (!String(resultingAuthority ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "resultingAuthority is required.");
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.authority_status === "committed"
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      authority_status='committed', authority_committed_at=now(), resulting_authority=$2, updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id, resultingAuthority],
            }),
      });
    },

    async recordRoutingActivated({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (["activated", "verified"].includes(current.routing_status)
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      routing_status='activated', routing_activated_at=now(), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordRoutingVerified({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.routing_status === "verified"
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      routing_status='verified', routing_verified_at=COALESCE(routing_verified_at, now()), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordRoutingFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.routing_status === "verified"
          ? null // Never downgrade already-verified routing evidence.
          : { sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET routing_status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }),
      });
    },

    // Phase 6A pre-boundary Windows-routing-recovery evidence (migration 000009). These never
    // participate in the forward-handoff `authority_status`/`routing_status` CHECK constraints from
    // 000008 - a recovery attempt records its own honest outcome on the same operation-bound row
    // without altering what the row says about the original (failed/aborted) forward handoff.
    async recordWindowsRoutingRestored({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.windows_routing_restore_status === "restored"
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      windows_routing_restore_status='restored', windows_routing_restore_at=now(), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordWindowsRoutingRestoreFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.windows_routing_restore_status === "restored"
          ? null // Never downgrade an already-restored outcome.
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      windows_routing_restore_status='failed', windows_routing_restore_at=now(), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordWindowsRoutingRestoreAmbiguous({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.windows_routing_restore_status === "restored"
          ? null // Never downgrade an already-restored outcome.
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      windows_routing_restore_status='ambiguous', windows_routing_restore_at=now(), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    // Phase 6C worker-handoff evidence (migration 000010, phase N/O: "release writes only through
    // the provider platform, start the authority-gated worker"). Reuses this same operation-bound
    // row rather than starting a second evidence lifecycle - see that migration's header comment.
    async recordWorkerActivated({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (["activated", "verified"].includes(current.worker_activation_status)
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      worker_activation_status='activated', worker_activated_at=now(), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordWorkerVerified({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.worker_activation_status === "verified"
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      worker_activation_status='verified', worker_verified_at=COALESCE(worker_verified_at, now()), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordWorkerActivationFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.worker_activation_status === "verified"
          ? null // Never downgrade already-verified worker activation.
          : { sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET worker_activation_status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }),
      });
    },

    async recordWindowsWorkerRetired({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.windows_worker_retirement_status === "retired"
          ? null
          : {
              sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET
                      windows_worker_retirement_status='retired', windows_worker_retired_at=now(), updated_at=now()
                    WHERE receipt_id=$1 RETURNING *`,
              values: [current.receipt_id],
            }),
      });
    },

    async recordWindowsWorkerRetirementFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.windows_worker_retirement_status === "retired"
          ? null // Never downgrade an already-retired outcome.
          : { sql: `UPDATE physiqueos.combined_cutover_handoff_receipts SET windows_worker_retirement_status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }),
      });
    },
  });
}

async function transition({ pool, migrationOperationId, expectedPackageDigest, apply }) {
  const operationId = requireTransferOperationId(migrationOperationId);
  const digest = requireTransferDigest(expectedPackageDigest, "expectedPackageDigest");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await readRow(client, operationId, { forUpdate: true });
    if (current.package_digest !== digest) {
      throw transferError(TransferErrorCode.PACKAGE_DIGEST_CONFLICT, "Handoff evidence package digest does not match the expected operation.");
    }
    const update = apply(current);
    if (!update) {
      await client.query("COMMIT");
      return freeze({ receipt: row(current), outcome: "idempotent-replay" });
    }
    const result = await client.query(update.sql, update.values);
    await client.query("COMMIT");
    return freeze({ receipt: row(result.rows[0]), outcome: "updated" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readRow(client, migrationOperationId, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT * FROM physiqueos.combined_cutover_handoff_receipts WHERE migration_operation_id=$1${forUpdate ? " FOR UPDATE" : ""}`,
    [migrationOperationId],
  );
  if (!result.rows[0]) throw transferError(TransferErrorCode.RECEIPT_UNAVAILABLE, "Combined cutover handoff evidence is unavailable.");
  return result.rows[0];
}

function assertSameIdentity(existing, expected) {
  if (existing.authorization_fingerprint !== expected.authorizationFingerprint || existing.fence_id !== expected.fenceId) {
    throw transferError(TransferErrorCode.RECEIPT_OPERATION_CONFLICT, "Existing handoff evidence has a different authorization/fence identity.");
  }
  if (existing.package_digest !== expected.packageDigest) {
    throw transferError(TransferErrorCode.PACKAGE_DIGEST_CONFLICT, "Existing handoff evidence has a different package digest.");
  }
  if (existing.routing_target !== expected.routingTarget || existing.provider_deployment_id !== expected.providerDeploymentId) {
    throw transferError(TransferErrorCode.RECEIPT_OPERATION_CONFLICT, "Existing handoff evidence targets a different route/provider deployment.");
  }
}

function row(value) {
  return freeze({
    schemaVersion: value.schema_version,
    receiptId: value.receipt_id,
    operationId: value.migration_operation_id,
    authorizationFingerprint: value.authorization_fingerprint,
    fenceId: value.fence_id,
    packageDigest: value.package_digest,
    routingTarget: value.routing_target,
    providerDeploymentId: value.provider_deployment_id,
    expectedRouteSnapshot: value.expected_route_snapshot ?? null,
    authorityStatus: value.authority_status,
    authorityCommittedAt: toIso(value.authority_committed_at),
    resultingAuthority: value.resulting_authority,
    routingStatus: value.routing_status,
    routingActivatedAt: toIso(value.routing_activated_at),
    routingVerifiedAt: toIso(value.routing_verified_at),
    windowsRoutingRestoreStatus: value.windows_routing_restore_status ?? null,
    windowsRoutingRestoreAt: toIso(value.windows_routing_restore_at),
    workerActivationStatus: value.worker_activation_status ?? null,
    workerActivatedAt: toIso(value.worker_activated_at),
    workerVerifiedAt: toIso(value.worker_verified_at),
    windowsWorkerRetirementStatus: value.windows_worker_retirement_status ?? null,
    windowsWorkerRetiredAt: toIso(value.windows_worker_retired_at),
    createdAt: toIso(value.created_at),
    updatedAt: toIso(value.updated_at),
  });
}

function toIso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function freeze(value) { return Object.freeze(value); }
