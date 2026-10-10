import { randomUUID } from "node:crypto";
import { executePostgresEvidenceReviewMutation } from "./PostgresFounderRepositoryFacade.js";
import { EVIDENCE_REVIEW_CONTINUATION_TOPIC } from "../../domain/services/EvidenceReviewBackgroundContinuation.js";

const MAX_INSPECTION_ROWS = 64;
const MAX_BUILD_HEARTBEAT_ROWS = 64;

export function createPostgresEvidenceProcessingReliabilityStore({
  pool,
  ownerUserId,
  buildId,
  authorityStore,
  migrationOperationId = null,
  now = () => new Date(),
  createRecoveryId = () => randomUUID(),
} = {}) {
  if (!pool?.query || !pool?.connect || !ownerUserId || !buildId || !authorityStore) {
    throw new Error("Evidence processing reliability storage requires PostgreSQL, owner, and authority.");
  }
  return Object.freeze({
    async inspect({ observedAt = now() } = {}) {
      const [reviewsResult, messagesResult, heartbeatResult, adoptionResult] = await Promise.all([
        pool.query(
          `SELECT record_id,payload,updated_at FROM physiqueos.canonical_evidence_records
            WHERE owner_user_id=$1 AND collection_name='evidenceReviews'
              AND status IN ('committing','commit_failed','partially_committed')
            ORDER BY updated_at ASC LIMIT $2`,
          [ownerUserId, MAX_INSPECTION_ROWS],
        ),
        pool.query(
          `SELECT id,status,attempt_count,due_at,created_at,updated_at,claim_expires_at,dead_at,
                  payload->>'reviewId' AS review_id
             FROM physiqueos.outbox_messages
            WHERE user_id=$1 AND topic=$2
              AND status IN ('pending','processing','dead')
            ORDER BY created_at ASC LIMIT $3`,
          [ownerUserId, EVIDENCE_REVIEW_CONTINUATION_TOPIC, MAX_INSPECTION_ROWS],
        ),
        pool.query(
          `SELECT worker_id,build_id,status,observed_at,details
             FROM physiqueos.worker_heartbeats ORDER BY observed_at DESC LIMIT 1`,
        ),
        pool.query(
          `SELECT details->>'buildAdoptedAt' AS build_adopted_at
             FROM physiqueos.worker_heartbeats
            WHERE build_id=$1
            ORDER BY observed_at ASC LIMIT $2`,
          [buildId, MAX_BUILD_HEARTBEAT_ROWS + 1],
        ),
      ]);
      const messagesByReview = groupBy(messagesResult.rows, (row) => String(row.review_id ?? ""));
      const reviews = reviewsResult.rows.map((row) => {
        const review = row.payload ?? {};
        const messages = messagesByReview.get(String(row.record_id)) ?? [];
        const liveMessages = messages.filter((message) => ["pending", "processing"].includes(message.status));
        const deadMessages = messages.filter((message) => message.status === "dead");
        return Object.freeze({
          reviewId: String(row.record_id),
          status: review.status,
          claimStatus: review.commitClaim?.status ?? null,
          claimLeaseExpiresAt: review.commitClaim?.leaseExpiresAt ?? null,
          updatedAt: review.updatedAt ?? row.updated_at,
          reviewAgeMs: ageMs(observedAt, review.updatedAt ?? row.updated_at),
          liveContinuationCount: liveMessages.length,
          deadContinuationCount: deadMessages.length,
          queueAgeMs: liveMessages.length
            ? Math.max(...liveMessages.map((message) => ageMs(observedAt, message.created_at)))
            : null,
          maximumAttemptCount: messages.length
            ? Math.max(...messages.map((message) => Number(message.attempt_count ?? 0)))
            : 0,
          autoResumeCount: Number(review.processingReliability?.autoResumeCount ?? 0),
        });
      });
      const heartbeat = heartbeatResult.rows[0] ?? null;
      const adoption = resolveImmutableBuildAdoption(adoptionResult.rows);
      return Object.freeze({
        observedAt: observedAt.toISOString(),
        adoptionBoundary: adoption.boundary,
        adoptionBoundaryStatus: adoption.status,
        buildHeartbeatCount: adoption.count,
        reviews: Object.freeze(reviews),
        heartbeat: heartbeat ? Object.freeze({
          workerId: heartbeat.worker_id,
          buildId: heartbeat.build_id,
          status: heartbeat.status,
          observedAt: heartbeat.observed_at,
          ageMs: ageMs(observedAt, heartbeat.observed_at),
        }) : null,
      });
    },

    async recover(reviewId, { observedAt = now(), maximumAutoResumes = 2 } = {}) {
      const recoveryId = createRecoveryId();
      return executePostgresEvidenceReviewMutation({
        pool,
        ownerUserId,
        authorityStore,
        migrationOperationId,
        now: () => observedAt,
        commandId: `evidence-processing-recovery:${recoveryId}`,
        methodName: "recoverStrandedEvidenceReviewCommit",
        args: [reviewId, {
          observedAt: observedAt.toISOString(),
          recoveryId,
          maximumAutoResumes,
        }],
      });
    },
  });
}

export function resolveImmutableBuildAdoption(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({ boundary: null, status: "missing", count: 0 });
  }
  if (rows.length > MAX_BUILD_HEARTBEAT_ROWS) {
    return Object.freeze({ boundary: null, status: "ambiguous", count: rows.length });
  }
  const timestamps = rows.map((row) => parseBuildAdoptedAt(row?.build_adopted_at));
  if (timestamps.some((value) => value == null)) {
    return Object.freeze({ boundary: null, status: "invalid", count: rows.length });
  }
  return Object.freeze({
    boundary: new Date(Math.min(...timestamps)).toISOString(),
    status: "durable",
    count: rows.length,
  });
}

function groupBy(items, key) {
  const result = new Map();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    result.set(value, [...(result.get(value) ?? []), item]);
  }
  return result;
}

function ageMs(now, value) {
  const timestamp = Date.parse(value instanceof Date ? value.toISOString() : String(value ?? ""));
  return Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) : null;
}

function parseBuildAdoptedAt(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
