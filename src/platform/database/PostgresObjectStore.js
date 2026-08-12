import { firstRow, mapVersionedRow, requiredRow } from "./postgresRows.js";

export function createPostgresObjectStore({ query }) {
  return Object.freeze({
    async createObjectAndIntent({ object, intent }) {
      const stored = mapVersionedRow(requiredRow(await query(
        `INSERT INTO physiqueos.stored_objects
          (id, user_id, state, bucket, object_key, content_type, byte_length, sha256, provenance)
         VALUES ($1, $2, 'created', $3, $4, $5, $6, $7, $8) RETURNING *`,
        [object.id, object.userId, object.bucket, object.objectKey, object.contentType, object.byteLength, object.sha256, object.provenance ?? null],
      )));
      const upload = requiredRow(await query(
        `INSERT INTO physiqueos.upload_intents
          (id, user_id, object_id, state, expected_byte_length, expected_sha256, expires_at, provider_upload_id)
         VALUES ($1, $2, $3, 'created', $4, $5, $6, $7) RETURNING *`,
        [intent.id, object.userId, object.id, object.byteLength, object.sha256, intent.expiresAt, intent.providerUploadId ?? null],
      ));
      return Object.freeze({ object: stored, intent: upload });
    },
    async findObjectForOwner({ objectId, userId }) {
      return mapVersionedRow(firstRow(await query("SELECT * FROM physiqueos.stored_objects WHERE id = $1 AND user_id = $2", [objectId, userId])));
    },
    async findIntentForOwner({ intentId, userId, lock = false }) {
      return firstRow(await query(`SELECT * FROM physiqueos.upload_intents WHERE id = $1 AND user_id = $2${lock ? " FOR UPDATE" : ""}`, [intentId, userId]));
    },
    async markUploading({ intentId, userId, providerUploadId }) {
      return firstRow(await query(
        "UPDATE physiqueos.upload_intents SET state = 'uploading', provider_upload_id = $3, updated_at = now() WHERE id = $1 AND user_id = $2 AND state = 'created' RETURNING *",
        [intentId, userId, providerUploadId],
      ));
    },
    async claimCompletion({ intentId, userId, reclaimBefore, at }) {
      return firstRow(await query(
        `UPDATE physiqueos.upload_intents SET state = 'completing', updated_at = $4
          WHERE id = $1 AND user_id = $2
            AND (state IN ('created', 'uploading') OR (state = 'completing' AND updated_at <= $3))
          RETURNING *`,
        [intentId, userId, reclaimBefore, at],
      ));
    },
    async releaseCompletionClaim({ intentId, userId, at }) {
      return firstRow(await query(
        "UPDATE physiqueos.upload_intents SET state = 'uploading', updated_at = $3 WHERE id = $1 AND user_id = $2 AND state = 'completing' RETURNING *",
        [intentId, userId, at],
      ));
    },
    async failCompletion({ intentId, userId, at }) {
      return firstRow(await query(
        "UPDATE physiqueos.upload_intents SET state = 'failed', updated_at = $3 WHERE id = $1 AND user_id = $2 AND state = 'completing' RETURNING *",
        [intentId, userId, at],
      ));
    },
    async abort({ intentId, userId, at }) {
      return firstRow(await query(
        "UPDATE physiqueos.upload_intents SET state = 'aborted', updated_at = $3 WHERE id = $1 AND user_id = $2 AND state IN ('created', 'uploading') RETURNING *",
        [intentId, userId, at],
      ));
    },
    async completeVerified({ intentId, userId, receiptHash, providerEtag, providerVersion, verifiedAt }) {
      const intent = requiredRow(await query(
        `UPDATE physiqueos.upload_intents SET state = 'completed', completion_receipt_hash = $3,
                provider_etag = $4, provider_version = $5, completed_at = $6, updated_at = $6
          WHERE id = $1 AND user_id = $2 AND state = 'completing' RETURNING *`,
        [intentId, userId, receiptHash, providerEtag ?? null, providerVersion ?? null, verifiedAt],
      ));
      const object = mapVersionedRow(requiredRow(await query(
        `UPDATE physiqueos.stored_objects SET state = 'verified', provider_version = $3,
                verified_at = $4, updated_at = $4, version = version + 1
          WHERE id = $1 AND user_id = $2 AND state IN ('created', 'uploading') RETURNING *`,
        [intent.object_id, userId, providerVersion ?? null, verifiedAt],
      )));
      return Object.freeze({ object, intent });
    },
    async tombstone({ objectId, userId, expectedVersion, at }) {
      return mapVersionedRow(firstRow(await query(
        `UPDATE physiqueos.stored_objects SET state = 'tombstoned', tombstoned_at = $4,
                updated_at = $4, version = version + 1
          WHERE id = $1 AND user_id = $2 AND version = $3 AND state <> 'purged' RETURNING *`,
        [objectId, userId, expectedVersion, at],
      )));
    },
    async listVerified({ afterId = "", limit = 500 } = {}) {
      return (await query(
        `SELECT * FROM physiqueos.stored_objects
          WHERE state = 'verified' AND id > $1 ORDER BY id ASC LIMIT $2`,
        [afterId, limit],
      )).rows;
    },
  });
}
