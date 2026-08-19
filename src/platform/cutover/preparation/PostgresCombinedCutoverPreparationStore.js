// Durable, operation-bound evidence store for the combined-cutover PREPARATION phase (import,
// media, parity, provider-prepared acknowledgement). See migration 000007 for why this is a new,
// narrow table rather than a reuse of `phase4_import_runs` or an overload of the Phase 3 transfer
// receipt tables.
//
// Every write method requires the caller to supply `expectedPackageDigest` and re-checks it against
// the durable row before writing, so a stale or wrong caller can never silently record evidence for
// the wrong package under a reused operation ID. A conflicting `declare` (same operationId,
// different identity) fails closed rather than overwriting.

import { requireTransferDigest, requireTransferOperationId, transferError, TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";

export const COMBINED_CUTOVER_PREPARATION_SCHEMA_VERSION = 1;

export function createPostgresCombinedCutoverPreparationStore({ pool } = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Combined cutover preparation evidence requires PostgreSQL.");

  return Object.freeze({
    async declare({ migrationOperationId, authorizationFingerprint, fenceId, packageDigest, targetDatabase }) {
      const operationId = requireTransferOperationId(migrationOperationId);
      const digest = requireTransferDigest(packageDigest, "packageDigest");
      const fingerprint = requireTransferDigest(authorizationFingerprint, "authorizationFingerprint");
      if (!String(fenceId ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "fenceId is required.");
      if (!String(targetDatabase ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "targetDatabase is required.");
      const receiptId = `ccpr_${operationId}`;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO physiqueos.combined_cutover_preparation_receipts
            (receipt_id,schema_version,migration_operation_id,authorization_fingerprint,fence_id,package_digest,target_database)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (migration_operation_id) DO NOTHING RETURNING *`,
          [receiptId, COMBINED_CUTOVER_PREPARATION_SCHEMA_VERSION, operationId, fingerprint, fenceId, digest, targetDatabase],
        );
        if (inserted.rows[0]) {
          await client.query("COMMIT");
          return freeze({ receipt: row(inserted.rows[0]), outcome: "declared" });
        }
        const existing = await readRow(client, operationId, { forUpdate: true });
        assertSameIdentity(existing, { authorizationFingerprint: fingerprint, fenceId, packageDigest: digest, targetDatabase });
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
        `SELECT * FROM physiqueos.combined_cutover_preparation_receipts WHERE migration_operation_id=$1`,
        [requireTransferOperationId(migrationOperationId)],
      );
      if (!result.rows[0]) throw transferError(TransferErrorCode.RECEIPT_UNAVAILABLE, "Combined cutover preparation evidence is unavailable.");
      return freeze({ receipt: row(result.rows[0]) });
    },

    async recordImportStarted({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => (current.import_status === "pending"
          ? { sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET import_status='running', import_started_at=now(), updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }
          : null),
      });
    },

    async recordImportSucceeded({ migrationOperationId, expectedPackageDigest, collectionCounts, importDigest }) {
      const digest = requireTransferDigest(importDigest, "importDigest");
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => ({
          sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET
                  import_status='succeeded', import_completed_at=now(),
                  imported_collection_counts=$2::jsonb, import_digest=$3, updated_at=now()
                WHERE receipt_id=$1 RETURNING *`,
          values: [current.receipt_id, JSON.stringify(collectionCounts ?? {}), digest],
        }),
      });
    },

    async recordImportFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => ({ sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET import_status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }),
      });
    },

    async recordMediaSucceeded({ migrationOperationId, expectedPackageDigest, objectCount, byteLength }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => ({
          sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET
                  media_status='succeeded', media_object_count=$2, media_byte_length=$3, updated_at=now()
                WHERE receipt_id=$1 RETURNING *`,
          values: [current.receipt_id, Number(objectCount ?? 0), Number(byteLength ?? 0)],
        }),
      });
    },

    async recordMediaFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => ({ sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET media_status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }),
      });
    },

    async recordParityPassed({ migrationOperationId, expectedPackageDigest, readSurfaceCount }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => ({
          sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET
                  parity_status='passed', parity_checked_at=now(), parity_read_surface_count=$2, updated_at=now()
                WHERE receipt_id=$1 RETURNING *`,
          values: [current.receipt_id, Number(readSurfaceCount ?? 0)],
        }),
      });
    },

    async recordParityFailed({ migrationOperationId, expectedPackageDigest }) {
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => ({ sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET parity_status='failed', updated_at=now() WHERE receipt_id=$1 RETURNING *`, values: [current.receipt_id] }),
      });
    },

    async recordPreparedAcknowledged({ migrationOperationId, expectedPackageDigest, providerDeploymentId }) {
      if (!String(providerDeploymentId ?? "").trim()) throw transferError(TransferErrorCode.IDENTITY_INVALID, "providerDeploymentId is required.");
      return transition({
        pool, migrationOperationId, expectedPackageDigest,
        apply: (current) => {
          if (current.prepared_status === "acknowledged") return null;
          if (current.import_status !== "succeeded" || current.media_status !== "succeeded" || current.parity_status !== "passed") {
            throw transferError(TransferErrorCode.INCOMPLETE, "Provider-prepared acknowledgement requires successful import, media, and parity evidence.");
          }
          return {
            sql: `UPDATE physiqueos.combined_cutover_preparation_receipts SET
                    prepared_status='acknowledged', prepared_acknowledged_at=now(), provider_deployment_id=$2, updated_at=now()
                  WHERE receipt_id=$1 RETURNING *`,
            values: [current.receipt_id, providerDeploymentId],
          };
        },
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
      throw transferError(TransferErrorCode.PACKAGE_DIGEST_CONFLICT, "Preparation evidence package digest does not match the expected operation.");
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
    `SELECT * FROM physiqueos.combined_cutover_preparation_receipts WHERE migration_operation_id=$1${forUpdate ? " FOR UPDATE" : ""}`,
    [migrationOperationId],
  );
  if (!result.rows[0]) throw transferError(TransferErrorCode.RECEIPT_UNAVAILABLE, "Combined cutover preparation evidence is unavailable.");
  return result.rows[0];
}

function assertSameIdentity(existing, expected) {
  if (existing.authorization_fingerprint !== expected.authorizationFingerprint || existing.fence_id !== expected.fenceId) {
    throw transferError(TransferErrorCode.RECEIPT_OPERATION_CONFLICT, "Existing preparation evidence has a different authorization/fence identity.");
  }
  if (existing.package_digest !== expected.packageDigest) {
    throw transferError(TransferErrorCode.PACKAGE_DIGEST_CONFLICT, "Existing preparation evidence has a different package digest.");
  }
  if (existing.target_database !== expected.targetDatabase) {
    throw transferError(TransferErrorCode.RECEIPT_OPERATION_CONFLICT, "Existing preparation evidence targets a different database.");
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
    targetDatabase: value.target_database,
    importStatus: value.import_status,
    importStartedAt: toIso(value.import_started_at),
    importCompletedAt: toIso(value.import_completed_at),
    importedCollectionCounts: value.imported_collection_counts ?? null,
    importDigest: value.import_digest,
    mediaStatus: value.media_status,
    mediaObjectCount: value.media_object_count,
    mediaByteLength: value.media_byte_length == null ? null : Number(value.media_byte_length),
    parityStatus: value.parity_status,
    parityCheckedAt: toIso(value.parity_checked_at),
    parityReadSurfaceCount: value.parity_read_surface_count,
    preparedStatus: value.prepared_status,
    preparedAcknowledgedAt: toIso(value.prepared_acknowledged_at),
    providerDeploymentId: value.provider_deployment_id,
    createdAt: toIso(value.created_at),
    updatedAt: toIso(value.updated_at),
  });
}

function toIso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function freeze(value) { return Object.freeze(value); }
