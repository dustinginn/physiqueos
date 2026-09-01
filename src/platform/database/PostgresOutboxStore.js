import { firstRow } from "./postgresRows.js";

export function createPostgresOutboxStore({ query }) {
  return Object.freeze({
    async claimNext({ workerId, leaseExpiresAt, now, allowedTopics = null }) {
      const topicFilter = normalizeAllowedTopics(allowedTopics);
      return firstRow(await query(
        `WITH candidate AS (
           SELECT id FROM physiqueos.outbox_messages
            WHERE due_at <= $3
              AND (status = 'pending' OR (status = 'processing' AND claim_expires_at <= $3))
              AND ($4::text[] IS NULL OR topic = ANY($4::text[]))
            ORDER BY due_at, created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE physiqueos.outbox_messages AS message
            SET status = 'processing', claimed_by = $1, claim_expires_at = $2,
                attempt_count = attempt_count + 1, updated_at = $3
           FROM candidate WHERE message.id = candidate.id RETURNING message.*`,
        [workerId, leaseExpiresAt, now, topicFilter],
      ));
    },
    async acknowledge({ id, workerId, at }) {
      return firstRow(await query(
        `UPDATE physiqueos.outbox_messages SET status = 'succeeded', completed_at = $3,
                claimed_by = NULL, claim_expires_at = NULL, updated_at = $3
          WHERE id = $1 AND claimed_by = $2 AND status = 'processing'
            AND claim_expires_at > $3 RETURNING *`,
        [id, workerId, at],
      ));
    },
    async renewLease({ id, workerId, at, leaseExpiresAt }) {
      return firstRow(await query(
        `UPDATE physiqueos.outbox_messages SET claim_expires_at=$4,updated_at=$3
          WHERE id=$1 AND claimed_by=$2 AND status='processing' AND claim_expires_at>$3
          RETURNING *`,
        [id, workerId, at, leaseExpiresAt],
      ));
    },
    async fail({ id, workerId, at, dueAt, errorCode, errorDetail, terminal }) {
      return firstRow(await query(
        `UPDATE physiqueos.outbox_messages
            SET status = CASE WHEN $7::boolean THEN 'dead' ELSE 'pending' END,
                due_at = CASE WHEN $7::boolean THEN due_at ELSE $4::timestamptz END,
                dead_at = CASE WHEN $7::boolean THEN $3::timestamptz ELSE NULL::timestamptz END,
                last_error_code = $5, last_error_detail = $6,
                claimed_by = NULL, claim_expires_at = NULL, updated_at = $3
          WHERE id = $1 AND claimed_by = $2 AND status = 'processing'
            AND claim_expires_at > $3 RETURNING *`,
        [id, workerId, at, dueAt, errorCode, errorDetail, terminal],
      ));
    },
    async heartbeat({ workerId, buildId, status, observedAt, details = null }) {
      return firstRow(await query(
        `INSERT INTO physiqueos.worker_heartbeats (worker_id, build_id, status, observed_at, details)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (worker_id) DO UPDATE SET build_id = EXCLUDED.build_id, status = EXCLUDED.status,
           observed_at = EXCLUDED.observed_at, details = EXCLUDED.details RETURNING *`,
        [workerId, buildId, status, observedAt, details],
      ));
    },
    async latestHeartbeat() {
      return firstRow(await query("SELECT * FROM physiqueos.worker_heartbeats ORDER BY observed_at DESC LIMIT 1"));
    },
  });
}

function normalizeAllowedTopics(allowedTopics) {
  if (allowedTopics == null) return null;
  if (!Array.isArray(allowedTopics) || allowedTopics.length === 0) throw new Error("An allowed outbox topic filter must be a non-empty array.");
  const normalized = allowedTopics.map((topic) => String(topic ?? ""));
  if (normalized.some((topic) => !topic || topic.trim() !== topic) || new Set(normalized).size !== normalized.length) {
    throw new Error("Allowed outbox topics must be unique non-empty exact identities.");
  }
  return normalized;
}
