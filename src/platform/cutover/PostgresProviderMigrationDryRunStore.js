import { createPostgresTransactionRunner } from "../database/transaction.js";
import {
  PROVIDER_MIGRATION_DRY_RUN_CONTRACT,
  PROVIDER_MIGRATION_DRY_RUN_PAYLOAD_VERSION,
  PROVIDER_MIGRATION_DRY_RUN_TOPIC,
} from "./ProviderMigrationDryRunContract.js";
import { SIMPLIFIED_MIGRATION_MODE, SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS } from "./simplified/SimplifiedMigrationEligibility.js";

const TARGET_SCHEMA_VERSION = "000004_phase5_provider_readiness";
const SIMPLIFIED_TARGET_SCHEMA_VERSION = SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS.at(-1);

export function createPostgresProviderMigrationDryRunStore({ pool, clock = () => new Date() } = {}) {
  if (!pool?.query || !pool?.connect) throw new Error("Remote migration dry-run storage requires a PostgreSQL pool.");
  const transactions = createPostgresTransactionRunner({ pool });

  return Object.freeze({
    async enqueue({ request, payloadFingerprint }) {
      return transactions.run(async ({ query }) => {
        const existing = (await query("SELECT * FROM physiqueos.migration_runs WHERE id=$1 FOR UPDATE", [request.operationId])).rows[0] ?? null;
        if (existing) return replay(existing, request, payloadFingerprint);
        const queuedAt = clock().toISOString();
        const result = baseResult(request, payloadFingerprint, queuedAt);
        const operation = (await query(
          `INSERT INTO physiqueos.migration_runs
             (id,manifest_version,source_repository_revision,source_runtime_version,
              source_runtime_revision,source_runtime_sha256,importer_version,
              target_schema_version,semantic_digest,result,validation_result,report)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','pending',$10) RETURNING *`,
          [
            request.operationId,
            PROVIDER_MIGRATION_DRY_RUN_CONTRACT,
            request.expectedProviderSourceCommit,
            request.expectedProductionBuildId,
            String(request.expectedFounderRevision),
            request.expectedFounderSha256,
            request.expectedProviderBuildId,
            request.migrationMode === SIMPLIFIED_MIGRATION_MODE ? SIMPLIFIED_TARGET_SCHEMA_VERSION : TARGET_SCHEMA_VERSION,
            payloadFingerprint,
            { state: "queued", result, problem: null },
          ],
        )).rows[0];
        await query(
          `INSERT INTO physiqueos.outbox_messages
             (id,user_id,operation_id,topic,dedupe_key,payload_version,payload,due_at)
           VALUES ($1,NULL,NULL,$2,$3,$4,$5,$6)`,
          [
            `remote-dry-run:${request.operationId}`,
            PROVIDER_MIGRATION_DRY_RUN_TOPIC,
            request.operationId,
            PROVIDER_MIGRATION_DRY_RUN_PAYLOAD_VERSION,
            { request, payloadFingerprint },
            clock(),
          ],
        );
        return Object.freeze({ operation: mapOperation(operation), replayed: false });
      });
    },

    async find(operationId) {
      const row = (await pool.query(
        "SELECT * FROM physiqueos.migration_runs WHERE id=$1 AND manifest_version=$2",
        [operationId, PROVIDER_MIGRATION_DRY_RUN_CONTRACT],
      )).rows[0];
      return mapOperation(row);
    },

    async markRunning(operationId) {
      const row = (await pool.query(
        `UPDATE physiqueos.migration_runs
            SET report=jsonb_set(jsonb_set(COALESCE(report,'{}'::jsonb),'{state}',to_jsonb('running'::text),true),'{result,startedAt}',to_jsonb($3::text),true)
          WHERE id=$1 AND manifest_version=$2 AND result='pending' RETURNING *`,
        [operationId, PROVIDER_MIGRATION_DRY_RUN_CONTRACT, clock().toISOString()],
      )).rows[0];
      if (row) return mapOperation(row);
      const current = await this.find(operationId);
      if (current?.state === "succeeded") return current;
      throw storeError("REMOTE_DRY_RUN_NOT_FOUND", "The remote dry-run operation does not exist or is no longer runnable.");
    },

    async succeed(operationId, result) {
      const row = (await pool.query(
        `UPDATE physiqueos.migration_runs
            SET result='succeeded', validation_result='succeeded', report=$3, completed_at=$4
          WHERE id=$1 AND manifest_version=$2 RETURNING *`,
        [operationId, PROVIDER_MIGRATION_DRY_RUN_CONTRACT, { state: "succeeded", result, problem: null }, clock()],
      )).rows[0];
      if (!row) throw storeError("REMOTE_DRY_RUN_NOT_FOUND", "The remote dry-run operation does not exist.");
      return mapOperation(row);
    },

    async fail(operationId, problem, partialResult = null) {
      const row = (await pool.query(
        `UPDATE physiqueos.migration_runs
            SET result='failed', validation_result='failed', report=$3, completed_at=$4
          WHERE id=$1 AND manifest_version=$2 RETURNING *`,
        [operationId, PROVIDER_MIGRATION_DRY_RUN_CONTRACT, { state: "failed", result: partialResult, problem }, clock()],
      )).rows[0];
      if (!row) throw storeError("REMOTE_DRY_RUN_NOT_FOUND", "The remote dry-run operation does not exist.");
      return mapOperation(row);
    },

    async latestWorkerHeartbeat() {
      const row = (await pool.query("SELECT worker_id,build_id,status,observed_at FROM physiqueos.worker_heartbeats ORDER BY observed_at DESC LIMIT 1")).rows[0];
      return row ? Object.freeze({
        workerId: row.worker_id,
        buildId: row.build_id,
        status: row.status,
        observedAt: new Date(row.observed_at).toISOString(),
      }) : null;
    },
  });

  function replay(row, request, payloadFingerprint) {
    if (row.manifest_version !== PROVIDER_MIGRATION_DRY_RUN_CONTRACT) {
      throw storeError("REMOTE_DRY_RUN_OPERATION_ID_CONFLICT", "The operation ID is already assigned to a different migration record.");
    }
    const existing = mapOperation(row);
    if (row.semantic_digest !== payloadFingerprint || existing.result?.correlationId !== request.correlationId) {
      throw storeError("REMOTE_DRY_RUN_IDEMPOTENCY_PAYLOAD_MISMATCH", "The operation ID was replayed with a different payload.");
    }
    return Object.freeze({ operation: existing, replayed: true });
  }
}

function baseResult(request, payloadFingerprint, queuedAt) {
  return Object.freeze({
    contractVersion: PROVIDER_MIGRATION_DRY_RUN_CONTRACT,
    operationId: request.operationId,
    correlationId: request.correlationId,
    payloadFingerprint,
    environment: request.environment,
    operator: request.operator,
    dryRun: true,
    expectedProductionIdentity: Object.freeze({
      sourceCommit: request.expectedProductionSourceCommit,
      buildId: request.expectedProductionBuildId,
    }),
    expectedProviderIdentity: Object.freeze({
      sourceCommit: request.expectedProviderSourceCommit,
      buildId: request.expectedProviderBuildId,
    }),
    queuedAt,
    finalClassification: "PENDING",
  });
}

function mapOperation(row) {
  if (!row) return null;
  const report = row.report ?? {};
  return Object.freeze({
    operationId: row.id,
    state: report.state ?? (row.result === "pending" ? "queued" : row.result),
    version: digestVersion(row),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.completed_at ?? row.created_at).toISOString(),
    result: report.result ?? null,
    problem: report.problem ?? null,
  });
}

function digestVersion(row) {
  if (row.result === "succeeded" || row.result === "failed") return "3";
  return row.report?.state === "running" ? "2" : "1";
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
