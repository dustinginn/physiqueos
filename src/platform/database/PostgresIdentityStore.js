import { firstRow, mapTimestamp, mapVersionedRow, requiredRow } from "./postgresRows.js";

export function createPostgresIdentityStore({ query }) {
  if (typeof query !== "function") throw new Error("A query function is required.");
  return Object.freeze({
    async lockFounderEnrollment() {
      await query("SELECT pg_advisory_xact_lock(hashtext('physiqueos:founder-enrollment'))");
      const row = requiredRow(await query("SELECT count(*)::integer AS count FROM physiqueos.users"));
      return row.count === 0;
    },
    async createUserProfile({ userId, profileId, displayName, timeZone }) {
      await query("INSERT INTO physiqueos.users (id) VALUES ($1)", [userId]);
      return mapVersionedRow(requiredRow(await query(
        "INSERT INTO physiqueos.user_profiles (id, user_id, display_name, time_zone) VALUES ($1, $2, $3, $4) RETURNING *",
        [profileId, userId, displayName, timeZone],
      )));
    },
    async findUser(userId) {
      return mapVersionedRow(firstRow(await query("SELECT * FROM physiqueos.users WHERE id = $1", [userId])));
    },
    async createDevice({ id, userId, platform, displayName, refreshProofCapability = 0 }) {
      return mapVersionedRow(requiredRow(await query(
        "INSERT INTO physiqueos.devices (id, user_id, platform, display_name, refresh_proof_capability) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [id, userId, platform, displayName, refreshProofCapability],
      )));
    },
    async createInstallationSigningKey(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.installation_signing_keys
          (id, user_id, device_id, algorithm, public_key_spki, thumbprint)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.algorithm, record.publicKeySpki, record.thumbprint],
      ));
    },
    async createSession(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.sessions
          (id, user_id, device_id, status, authenticated_at, idle_expires_at, absolute_expires_at,
           refresh_family_id, refresh_proof_version, installation_key_id)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.authenticatedAt, record.idleExpiresAt,
          record.absoluteExpiresAt, record.refreshFamilyId, record.refreshProofVersion ?? 0,
          record.installationKeyId ?? null],
      ));
    },
    async createAccessCredential(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.access_credentials
          (id, user_id, device_id, session_id, credential_hash, hash_algorithm, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.sessionId, record.credentialHash, record.hashAlgorithm, record.expiresAt],
      ));
    },
    async createRefreshCredential(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.refresh_credentials
          (id, user_id, device_id, session_id, family_id, credential_hash, hash_algorithm, idle_expires_at, absolute_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.sessionId, record.familyId, record.credentialHash, record.hashAlgorithm, record.idleExpiresAt, record.absoluteExpiresAt],
      ));
    },
    async createRecoveryCredential(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.recovery_credentials (id, user_id, credential_hash, hash_algorithm, expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [record.id, record.userId, record.credentialHash, record.hashAlgorithm, record.expiresAt ?? null],
      ));
    },
    async findAccessCredentialForAuthentication(credentialHash) {
      return firstRow(await query(
        `SELECT access_credentials.*, sessions.status AS session_status, sessions.idle_expires_at,
                sessions.absolute_expires_at, devices.status AS device_status
           FROM physiqueos.access_credentials
           JOIN physiqueos.sessions ON sessions.id = access_credentials.session_id
           JOIN physiqueos.devices ON devices.id = access_credentials.device_id
          WHERE access_credentials.credential_hash = $1
          FOR UPDATE OF access_credentials`,
        [credentialHash],
      ));
    },
    async markAccessCredentialUsed({ id, at }) {
      return requiredRow(await query(
        "UPDATE physiqueos.access_credentials SET first_used_at = COALESCE(first_used_at, $2) WHERE id = $1 RETURNING *",
        [id, at],
      ));
    },
    async lockRefreshCredential(credentialHash) {
      return firstRow(await query(
        `SELECT refresh_credentials.*, sessions.status AS session_status, sessions.refresh_proof_version,
                sessions.installation_key_id, devices.status AS device_status,
                installation_signing_keys.status AS installation_key_status,
                installation_signing_keys.public_key_spki, installation_signing_keys.thumbprint
           FROM physiqueos.refresh_credentials
           JOIN physiqueos.sessions ON sessions.id = refresh_credentials.session_id
           JOIN physiqueos.devices ON devices.id = refresh_credentials.device_id
           LEFT JOIN physiqueos.installation_signing_keys
             ON installation_signing_keys.id = sessions.installation_key_id
          WHERE refresh_credentials.credential_hash = $1 FOR UPDATE OF refresh_credentials`,
        [credentialHash],
      ));
    },
    async createRefreshProofChallenge(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.refresh_proof_challenges
          (id, user_id, device_id, session_id, family_id, refresh_credential_id, installation_key_id,
           nonce_digest, intent_digest, successor_commitment_digest, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.sessionId, record.familyId,
          record.refreshCredentialId, record.installationKeyId, record.nonceDigest,
          record.intentDigest, record.successorCommitmentDigest, record.expiresAt],
      ));
    },
    async lockRefreshProofChallenge({ id, nonceDigest }) {
      return firstRow(await query(
        `SELECT * FROM physiqueos.refresh_proof_challenges
          WHERE id = $1 AND nonce_digest = $2
          FOR UPDATE`,
        [id, nonceDigest],
      ));
    },
    async consumeRefreshProofChallenge({ id, proofIdDigest, at }) {
      return firstRow(await query(
        `UPDATE physiqueos.refresh_proof_challenges
            SET consumed_at = $3, proof_id_digest = $2
          WHERE id = $1 AND consumed_at IS NULL
          RETURNING *`,
        [id, proofIdDigest, at],
      ));
    },
    async createRefreshExchange(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.refresh_exchanges
          (id, user_id, device_id, session_id, family_id, installation_key_id,
           predecessor_refresh_id, successor_refresh_id, intent_digest,
           successor_commitment_digest, recovery_expires_at, maximum_recoveries)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.sessionId, record.familyId,
          record.installationKeyId, record.predecessorRefreshId, record.successorRefreshId,
          record.intentDigest, record.successorCommitmentDigest, record.recoveryExpiresAt,
          record.maximumRecoveries],
      ));
    },
    async lockRefreshExchangeByPredecessor(predecessorRefreshId) {
      return firstRow(await query(
        "SELECT * FROM physiqueos.refresh_exchanges WHERE predecessor_refresh_id = $1 FOR UPDATE",
        [predecessorRefreshId],
      ));
    },
    async lockRefreshCredentialById(id) {
      return firstRow(await query(
        "SELECT * FROM physiqueos.refresh_credentials WHERE id = $1 FOR UPDATE",
        [id],
      ));
    },
    async linkRefreshExchangeAccessCredential({ exchangeId, accessCredentialId }) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.refresh_exchange_access_credentials (exchange_id, access_credential_id)
         VALUES ($1, $2) RETURNING *`,
        [exchangeId, accessCredentialId],
      ));
    },
    async lockRefreshExchangeAccessCredentials(exchangeId) {
      return (await query(
        `SELECT access_credentials.*
           FROM physiqueos.refresh_exchange_access_credentials
           JOIN physiqueos.access_credentials
             ON access_credentials.id = refresh_exchange_access_credentials.access_credential_id
          WHERE refresh_exchange_access_credentials.exchange_id = $1
          ORDER BY access_credentials.created_at, access_credentials.id
          FOR UPDATE OF access_credentials`,
        [exchangeId],
      )).rows;
    },
    async revokeRefreshExchangeAccessCredentials({ exchangeId, at }) {
      await query(
        `UPDATE physiqueos.access_credentials
            SET revoked_at = COALESCE(revoked_at, $2)
          WHERE id IN (
            SELECT access_credential_id FROM physiqueos.refresh_exchange_access_credentials
             WHERE exchange_id = $1
          )`,
        [exchangeId, at],
      );
    },
    async incrementRefreshExchangeRecovery({ id, at }) {
      return requiredRow(await query(
        `UPDATE physiqueos.refresh_exchanges
            SET recovery_count = recovery_count + 1, updated_at = $2
          WHERE id = $1 RETURNING *`,
        [id, at],
      ));
    },
    async replaceRefreshCredential({ previousId, next }) {
      await this.createRefreshCredential(next);
      await query("UPDATE physiqueos.refresh_credentials SET used_at = $2, replaced_by_id = $3 WHERE id = $1", [previousId, next.createdAt, next.id]);
    },
    async revokeRefreshFamily({ userId, familyId, at }) {
      await query("UPDATE physiqueos.refresh_credentials SET revoked_at = COALESCE(revoked_at, $3) WHERE user_id = $1 AND family_id = $2", [userId, familyId, at]);
      await query("UPDATE physiqueos.sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, $3), updated_at = $3 WHERE user_id = $1 AND refresh_family_id = $2", [userId, familyId, at]);
    },
    async revokeSession({ sessionId, userId, at }) {
      const result = await query(
        "UPDATE physiqueos.sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, $3), updated_at = $3 WHERE id = $1 AND user_id = $2 RETURNING id",
        [sessionId, userId, at],
      );
      await query("UPDATE physiqueos.access_credentials SET revoked_at = COALESCE(revoked_at, $2) WHERE session_id = $1", [sessionId, at]);
      await query("UPDATE physiqueos.refresh_credentials SET revoked_at = COALESCE(revoked_at, $2) WHERE session_id = $1", [sessionId, at]);
      return result.rowCount === 1;
    },
    async revokeDevice({ deviceId, userId, at }) {
      const result = await query(
        "UPDATE physiqueos.devices SET status = 'revoked', revoked_at = COALESCE(revoked_at, $3), updated_at = $3, version = version + 1 WHERE id = $1 AND user_id = $2 RETURNING id",
        [deviceId, userId, at],
      );
      await query("UPDATE physiqueos.sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, $2), updated_at = $2 WHERE device_id = $1", [deviceId, at]);
      await query("UPDATE physiqueos.access_credentials SET revoked_at = COALESCE(revoked_at, $2) WHERE device_id = $1", [deviceId, at]);
      await query("UPDATE physiqueos.refresh_credentials SET revoked_at = COALESCE(revoked_at, $2) WHERE device_id = $1", [deviceId, at]);
      await query("UPDATE physiqueos.installation_signing_keys SET status = 'revoked', revoked_at = COALESCE(revoked_at, $2) WHERE device_id = $1", [deviceId, at]);
      return result.rowCount === 1;
    },
    async findRecoveryCredentialForUse(credentialHash) {
      return firstRow(await query("SELECT * FROM physiqueos.recovery_credentials WHERE credential_hash = $1 FOR UPDATE", [credentialHash]));
    },
    async consumeRecoveryCredential({ id, at }) {
      return requiredRow(await query("UPDATE physiqueos.recovery_credentials SET used_at = $2 WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING *", [id, at]));
    },
    async revokeAllSessions({ userId, at }) {
      await query("UPDATE physiqueos.sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, $2), updated_at = $2 WHERE user_id = $1", [userId, at]);
      await query("UPDATE physiqueos.access_credentials SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1", [userId, at]);
      await query("UPDATE physiqueos.refresh_credentials SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1", [userId, at]);
    },
    async createPairingCredential(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.pairing_credentials (id, user_id, issued_by_session_id, credential_hash, hash_algorithm, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [record.id, record.userId, record.issuedBySessionId, record.credentialHash, record.hashAlgorithm, record.expiresAt],
      ));
    },
    async createPairingCredentialWithRecoveryIssuer(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.pairing_credentials
          (id, user_id, issued_by_session_id, issued_by_recovery_credential_id, credential_hash, hash_algorithm, expires_at)
         VALUES ($1, $2, NULL, $3, $4, $5, $6) RETURNING *`,
        [record.id, record.userId, record.issuedByRecoveryCredentialId,
          record.credentialHash, record.hashAlgorithm, record.expiresAt],
      ));
    },
    async findPairingCredentialByRecoveryCredentialId(recoveryCredentialId) {
      return firstRow(await query(
        "SELECT * FROM physiqueos.pairing_credentials WHERE issued_by_recovery_credential_id = $1 FOR UPDATE",
        [recoveryCredentialId],
      ));
    },
    async consumePairingCredential({ credentialHash, at }) {
      return firstRow(await query(
        `UPDATE physiqueos.pairing_credentials SET used_at = $2
          WHERE credential_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2
          RETURNING *`,
        [credentialHash, at],
      ));
    },
    async recordSecurityEvent(event) {
      await query(
        `INSERT INTO physiqueos.security_events
          (id, user_id, device_id, session_id, event_type, outcome, correlation_id, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [event.id, event.userId ?? null, event.deviceId ?? null, event.sessionId ?? null, event.eventType, event.outcome, event.correlationId ?? null, event.details ?? null],
      );
    },
    async updateDeviceSeen({ deviceId, sessionId, at }) {
      await query("UPDATE physiqueos.devices SET last_seen_at = $3, updated_at = $3 WHERE id = $1 AND EXISTS (SELECT 1 FROM physiqueos.sessions WHERE id = $2 AND device_id = $1)", [deviceId, sessionId, at]);
      await query("UPDATE physiqueos.sessions SET last_seen_at = $2, updated_at = $2 WHERE id = $1", [sessionId, at]);
    },
  });
}

export function toAuthenticationRecord(row) {
  if (!row) return null;
  return Object.freeze({
    ...row,
    expires_at: mapTimestamp(row.expires_at),
    idle_expires_at: mapTimestamp(row.idle_expires_at),
    absolute_expires_at: mapTimestamp(row.absolute_expires_at),
  });
}
