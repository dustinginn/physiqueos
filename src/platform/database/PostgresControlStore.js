import { firstRow, mapVersionedRow, requiredRow } from "./postgresRows.js";

export function createPostgresControlStore({ query }) {
  return Object.freeze({
    async listFeatureFlags() {
      return (await query("SELECT * FROM physiqueos.feature_flags ORDER BY key")).rows.map(mapVersionedRow);
    },
    async putFeatureFlag({ key, enabled, platforms = null, minimumBuild = null, configuration = null, expectedVersion = null }) {
      if (expectedVersion == null) {
        return mapVersionedRow(requiredRow(await query(
          `INSERT INTO physiqueos.feature_flags (key, enabled, platforms, minimum_build, configuration)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [key, enabled, platforms, minimumBuild, configuration],
        )));
      }
      return mapVersionedRow(firstRow(await query(
        `UPDATE physiqueos.feature_flags SET enabled = $3, platforms = $4, minimum_build = $5,
                configuration = $6, version = version + 1, updated_at = now()
          WHERE key = $1 AND version = $2 RETURNING *`,
        [key, expectedVersion, enabled, platforms, minimumBuild, configuration],
      )));
    },
    async createMigrationRun(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.migration_runs
          (id, manifest_version, source_repository_revision, source_runtime_version, source_runtime_revision,
           source_runtime_sha256, importer_version, target_schema_version, semantic_digest, result, validation_result, report)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [record.id, record.manifestVersion, record.sourceRepositoryRevision, record.sourceRuntimeVersion,
          record.sourceRuntimeRevision, record.sourceRuntimeSha256, record.importerVersion,
          record.targetSchemaVersion, record.semanticDigest, record.result ?? "pending",
          record.validationResult ?? "pending", record.report ?? null],
      ));
    },
    async recordBackup(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.backup_runs
          (id, kind, status, schema_version, build_id, manifest_sha256, object_count, byte_length, details, started_at, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [record.id, record.kind, record.status, record.schemaVersion, record.buildId, record.manifestSha256 ?? null,
          record.objectCount ?? null, record.byteLength ?? null, record.details ?? null, record.startedAt, record.completedAt ?? null],
      ));
    },
  });
}
