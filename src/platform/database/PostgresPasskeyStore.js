import { createHash } from "node:crypto";
import { firstRow, requiredRow } from "./postgresRows.js";

export function createPostgresPasskeyStore({ query }) {
  return Object.freeze({
    async saveChallenge({ id, userId = null, purpose, challenge, context = null, expiresAt }) {
      const challengeHash = createHash("sha256").update(challenge).digest("hex");
      return requiredRow(await query(
        `INSERT INTO physiqueos.auth_challenges
          (id, user_id, purpose, challenge_hash, context, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, userId, purpose, challengeHash, { ...context, expectedChallenge: challenge }, expiresAt],
      ));
    },
    async consumeChallenge({ id, purpose, at }) {
      return firstRow(await query(
        `UPDATE physiqueos.auth_challenges SET consumed_at = $3, attempt_count = attempt_count + 1
          WHERE id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > $3 RETURNING *`,
        [id, purpose, at],
      ));
    },
    async failChallenge({ id }) {
      await query("UPDATE physiqueos.auth_challenges SET attempt_count = attempt_count + 1 WHERE id = $1 AND consumed_at IS NULL", [id]);
    },
    async listActiveForUser(userId) {
      return (await query("SELECT * FROM physiqueos.passkey_credentials WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at", [userId])).rows;
    },
    async findActiveByExternalId(credentialExternalId) {
      return firstRow(await query("SELECT * FROM physiqueos.passkey_credentials WHERE credential_external_id = $1 AND revoked_at IS NULL", [credentialExternalId]));
    },
    async saveCredential(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.passkey_credentials
          (id, user_id, credential_external_id, public_key, counter, transports, device_type, backed_up)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [record.id, record.userId, record.credentialExternalId, record.publicKey, record.counter,
          record.transports ?? null, record.deviceType ?? null, record.backedUp === true],
      ));
    },
    async advanceCounter({ credentialExternalId, previousCounter, nextCounter, at }) {
      return firstRow(await query(
        `UPDATE physiqueos.passkey_credentials SET counter = $3, last_used_at = $4
          WHERE credential_external_id = $1 AND counter = $2 AND revoked_at IS NULL RETURNING *`,
        [credentialExternalId, previousCounter, nextCounter, at],
      ));
    },
  });
}
