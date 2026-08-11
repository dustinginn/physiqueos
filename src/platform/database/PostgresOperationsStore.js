import { firstRow, mapVersionedRow, requiredRow } from "./postgresRows.js";

export function createPostgresOperationsStore({ query }) {
  return Object.freeze({
    async create(record) {
      return mapVersionedRow(requiredRow(await query(
        `INSERT INTO physiqueos.operations (id, user_id, operation_type, status, result, problem)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [record.id, record.userId, record.operationType, record.status ?? "queued", record.result ?? null, record.problem ?? null],
      )));
    },
    async findForOwner({ id, userId }) {
      return mapVersionedRow(firstRow(await query("SELECT * FROM physiqueos.operations WHERE id = $1 AND user_id = $2", [id, userId])));
    },
    async update({ id, userId, expectedVersion, status, result = null, problem = null }) {
      return mapVersionedRow(firstRow(await query(
        `UPDATE physiqueos.operations SET status = $4, result = $5, problem = $6,
                version = version + 1, updated_at = now()
          WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING *`,
        [id, userId, expectedVersion, status, result, problem],
      )));
    },
  });
}
