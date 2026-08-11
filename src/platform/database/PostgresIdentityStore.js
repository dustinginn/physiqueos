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
    async createDevice({ id, userId, platform, displayName }) {
      return mapVersionedRow(requiredRow(await query(
        "INSERT INTO physiqueos.devices (id, user_id, platform, display_name) VALUES ($1, $2, $3, $4) RETURNING *",
        [id, userId, platform, displayName],
      )));
    },
    async createSession(record) {
      return requiredRow(await query(
        `INSERT INTO physiqueos.sessions
          (id, user_id, device_id, status, authenticated_at, idle_expires_at, absolute_expires_at, refresh_family_id)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7) RETURNING *`,
        [record.id, record.userId, record.deviceId, record.authenticatedAt, record.idleExpiresAt, record.absoluteExpiresAt, record.refreshFamilyId],
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
          WHERE access_credentials.credential_hash = $1`,
        [credentialHash],
      ));
    },
    async lockRefreshCredential(credentialHash) {
      return firstRow(await query(
        `SELECT refresh_credentials.*, sessions.status AS session_status, devices.status AS device_status
           FROM physiqueos.refresh_credentials
           JOIN physiqueos.sessions ON sessions.id = refresh_credentials.session_id
           JOIN physiqueos.devices ON devices.id = refresh_credentials.device_id
          WHERE refresh_credentials.credential_hash = $1 FOR UPDATE OF refresh_credentials`,
        [credentialHash],
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
