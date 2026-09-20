import { EVIDENCE_REVIEW_CONTINUATION_TOPIC } from "../../domain/services/EvidenceReviewBackgroundContinuation.js";
import { POST_CONFIRMATION_STEP_ORDER } from "../../domain/services/PostConfirmationOrchestrator.js";

/**
 * Gives ONE spent evidence-review continuation message a fresh attempt budget
 * so the worker resumes the review through the existing idempotent path.
 *
 * The continuation code already supports exactly this shape: it accepts a
 * `partially_committed` review whose claim `failed` under the same operation id
 * (the operation id is derived from the message id), skips every completed
 * step, and runs the first incomplete one. What is missing after the message is
 * exhausted is only a message the worker is allowed to claim. This changes that
 * one outbox row and nothing else: no review, canonical, analysis, priority,
 * media, or briefing record is written.
 *
 * Every fact the plan depends on is read first and must match the authorization
 * exactly. Dry-run reads only and reports the exact row change. Apply re-reads
 * under the owner lock and updates the row with its observed status and attempt
 * count as the fence, so it cannot act on a message that moved after inspection.
 */
export function planEvidenceReviewContinuationRecovery({ facts, authorization, now = new Date() } = {}) {
  const refuse = (code, detail) => Object.freeze({ outcome: "refused", code, detail });
  const { review, messages, counts } = facts ?? {};
  if (!review) return refuse("REVIEW_MISSING", "The authorized review does not exist.");
  const payload = review.payload ?? {};
  if (payload.id !== authorization.reviewId) return refuse("REVIEW_IDENTITY_MISMATCH", "Review id differs from the authorization.");
  if (payload.userId !== authorization.ownerUserId) return refuse("REVIEW_OWNER_MISMATCH", "Review owner differs from the authorization.");
  if ((payload.interpretedEvidence?.package_id ?? payload.interpretedEvidence?.id) !== authorization.packageId) {
    return refuse("PACKAGE_IDENTITY_MISMATCH", "Review package differs from the authorization.");
  }
  if (payload.intakeReceiptId !== authorization.intakeReceiptId) {
    return refuse("INTAKE_IDENTITY_MISMATCH", "Review intake differs from the authorization.");
  }
  if (payload.confirmation) return refuse("REVIEW_ALREADY_CONFIRMED", "The review is already confirmed.");
  if (!["committing", "partially_committed"].includes(payload.status)) {
    return refuse("REVIEW_STATUS_UNEXPECTED", `Review status is ${payload.status}.`);
  }

  const progress = payload.commitProgress ?? {};
  const completed = POST_CONFIRMATION_STEP_ORDER.filter((step) => progress[step]?.status === "completed");
  if (progress.analysis?.status === "completed" && completed.length > authorization.expectedCompletedSteps.length) {
    return Object.freeze({ outcome: "already_progressed", detail: "Analysis has already completed; nothing to recover.", completedSteps: completed });
  }
  if (JSON.stringify(completed) !== JSON.stringify(authorization.expectedCompletedSteps)) {
    return refuse("COMPLETED_STEPS_UNEXPECTED", `Completed steps are ${completed.join(",") || "none"}.`);
  }
  const expectedOperation = `evidence-review-background:${authorization.messageId}`;
  if (payload.commitClaim?.operationId !== expectedOperation) {
    return refuse("CLAIM_OPERATION_MISMATCH", "The review claim is not owned by the authorized continuation message.");
  }
  if (!["in_progress", "failed"].includes(payload.commitClaim?.status)) {
    return refuse("CLAIM_STATUS_UNEXPECTED", `Claim status is ${payload.commitClaim?.status}.`);
  }

  if (counts.canonicalSessions !== 1) return refuse("CANONICAL_SESSION_NOT_SINGLETON", `Canonical PhotoSession count is ${counts.canonicalSessions}.`);
  if (counts.canonicalPhotos !== authorization.expectedCanonicalPhotoCount) {
    return refuse("CANONICAL_PHOTO_COUNT_UNEXPECTED", `Canonical photo count is ${counts.canonicalPhotos}.`);
  }
  if (counts.priorityCompletions !== 1) return refuse("PRIORITY_COMPLETION_NOT_SINGLETON", `Sep 19 priority completion count is ${counts.priorityCompletions}.`);
  if (counts.photoAnalyses !== 0) return refuse("ANALYSIS_ALREADY_EXISTS", `${counts.photoAnalyses} photo analyses already exist for this session.`);
  if (counts.eventBriefings !== 0) return refuse("PHOTO_BRIEFING_ALREADY_EXISTS", "A Photo Event briefing already exists for this session.");

  const forReview = (messages ?? []).filter((message) => message.topic === EVIDENCE_REVIEW_CONTINUATION_TOPIC && message.reviewId === authorization.reviewId);
  const target = forReview.find((message) => message.id === authorization.messageId);
  if (!target) return refuse("MESSAGE_MISSING", "The authorized continuation message does not exist.");
  const live = forReview.filter((message) => message.id !== target.id && ["pending", "processing"].includes(message.status));
  if (live.length > 0) return refuse("OTHER_CONTINUATION_ACTIVE", "Another continuation message for this review is pending or processing.");

  if (target.status === "pending" && target.attemptCount === 0) {
    return Object.freeze({ outcome: "already_armed", messageId: target.id, detail: "The message already has a fresh attempt budget." });
  }
  if (target.status === "succeeded") {
    return refuse("MESSAGE_ALREADY_SUCCEEDED", "The authorized message already completed; the review should have advanced.");
  }
  if (target.status === "processing" && new Date(target.claimExpiresAt).getTime() > now.getTime()) {
    return refuse("MESSAGE_LEASE_ACTIVE", "A worker currently holds a live lease on the message; wait for it to finish or lapse.");
  }
  if (!["processing", "dead"].includes(target.status)) {
    return refuse("MESSAGE_STATUS_UNEXPECTED", `Message status is ${target.status}.`);
  }
  return Object.freeze({
    outcome: "reset_message",
    messageId: target.id,
    before: Object.freeze({ status: target.status, attemptCount: target.attemptCount, lastErrorCode: target.lastErrorCode ?? null }),
    after: Object.freeze({ status: "pending", attemptCount: 0, claimedBy: null, claimExpiresAt: null, deadAt: null, lastErrorCode: null }),
    reviewStatus: payload.status,
    reviewVersion: Number(review.version),
    completedSteps: completed,
    analysisAttempts: progress.analysis?.attempts ?? 0,
  });
}

export async function loadEvidenceReviewContinuationRecoveryFacts({ query, authorization, lockMessages = false }) {
  const { ownerUserId, reviewId, sessionId, evidenceDate } = authorization;
  const reviewRow = (await query(
    `SELECT version, payload FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='evidenceReviews' AND record_id=$2`,
    [ownerUserId, reviewId],
  )).rows[0] ?? null;
  const messages = (await query(
    `SELECT id, topic, status, attempt_count, claim_expires_at, last_error_code, payload->>'reviewId' AS review_id
       FROM physiqueos.outbox_messages
      WHERE user_id=$1 AND topic=$2 AND payload->>'reviewId'=$3
      ORDER BY created_at${lockMessages ? " FOR UPDATE" : ""}`,
    [ownerUserId, EVIDENCE_REVIEW_CONTINUATION_TOPIC, reviewId],
  )).rows.map((row) => ({
    id: row.id, topic: row.topic, status: row.status, attemptCount: Number(row.attempt_count),
    claimExpiresAt: row.claim_expires_at, lastErrorCode: row.last_error_code, reviewId: row.review_id,
  }));
  const count = async (text, values) => Number((await query(text, values)).rows[0]?.n ?? 0);
  const counts = {
    canonicalSessions: await count(
      `SELECT count(*)::int AS n FROM physiqueos.canonical_evidence_records
        WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
          AND payload->>'canonicalId'=$2
          AND COALESCE(payload#>>'{payload,evidence_type}', payload->>'evidence_type')='photo_session'`,
      [ownerUserId, sessionId],
    ),
    canonicalPhotos: await count(
      `SELECT count(*)::int AS n FROM physiqueos.canonical_evidence_records
        WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
          AND COALESCE(payload#>>'{payload,evidence_type}', payload->>'evidence_type')='progress_photo'
          AND created_at >= $2::timestamptz`,
      [ownerUserId, reviewRow?.payload?.createdAt ?? "1970-01-01T00:00:00Z"],
    ),
    priorityCompletions: await count(
      `SELECT count(*)::int AS n FROM physiqueos.canonical_execution_records r,
              jsonb_array_elements(COALESCE(r.payload->'completionHistory','[]'::jsonb)) e
        WHERE r.owner_user_id=$1 AND r.collection_name='reminders' AND r.record_id='reminder_weekly_progress_photo_set'
          AND e->>'evidenceDate'=$2 AND e->>'satisfactionType'='progress_photo_session_confirmed'`,
      [ownerUserId, evidenceDate],
    ),
    photoAnalyses: await count(
      `SELECT count(*)::int AS n FROM physiqueos.canonical_confidence_records
        WHERE owner_user_id=$1 AND collection_name='analyses'
          AND (payload#>>'{metadata,canonicalPhotoId}' LIKE $2 OR payload->'evidenceIds' ? $3)`,
      [ownerUserId, `canonical_photo_${ownerUserId}_${evidenceDate}_%`, sessionId],
    ),
    eventBriefings: await count(
      `SELECT count(*)::int AS n FROM physiqueos.canonical_briefing_records
        WHERE owner_user_id=$1 AND collection_name='dailyBriefings' AND record_id=$2`,
      [ownerUserId, `event_briefing_progress_photo_${sessionId}`],
    ),
  };
  return { review: reviewRow, messages, counts };
}

/**
 * `query` runs inside a transaction the caller owns: READ ONLY for dry-run, and a
 * transaction holding the owner runtime lock for apply.
 */
export async function runEvidenceReviewContinuationRecovery({ query, authorization, apply = false, now = () => new Date() } = {}) {
  const facts = await loadEvidenceReviewContinuationRecoveryFacts({ query, authorization, lockMessages: apply });
  const plan = planEvidenceReviewContinuationRecovery({ facts, authorization, now: now() });
  if (plan.outcome !== "reset_message") return Object.freeze({ mode: apply ? "apply" : "dry-run", ...plan });
  if (!apply) return Object.freeze({ mode: "dry-run", ...plan, expectedMutation: `1 outbox row ${plan.messageId}: ${plan.before.status}/attempts ${plan.before.attemptCount} -> pending/attempts 0; no other row written` });
  const updated = await query(
    `UPDATE physiqueos.outbox_messages
        SET status='pending', attempt_count=0, due_at=$5::timestamptz, claimed_by=NULL, claim_expires_at=NULL,
            completed_at=NULL, dead_at=NULL, last_error_code=NULL, last_error_detail=NULL, updated_at=$5::timestamptz
      WHERE id=$1 AND user_id=$2 AND topic=$3 AND status=$4 AND attempt_count=$6
      RETURNING id, status, attempt_count`,
    [plan.messageId, authorization.ownerUserId, EVIDENCE_REVIEW_CONTINUATION_TOPIC, plan.before.status, now().toISOString(), plan.before.attemptCount],
  );
  if (updated.rowCount !== 1) {
    throw Object.assign(new Error("The continuation message changed after inspection."), { code: "MESSAGE_CHANGED_AFTER_INSPECTION" });
  }
  return Object.freeze({ mode: "apply", ...plan, outcome: "applied", rowsChanged: 1, after: Object.freeze({ ...plan.after, status: updated.rows[0].status, attemptCount: Number(updated.rows[0].attempt_count) }) });
}
