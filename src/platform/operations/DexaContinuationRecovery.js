import { createHash } from "node:crypto";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import {
  createEvidenceReviewContinuationKey,
  createEvidenceReviewContinuationMessage,
  EVIDENCE_REVIEW_CONTINUATION_TOPIC,
} from "../../domain/services/EvidenceReviewBackgroundContinuation.js";
import { POST_CONFIRMATION_STEP_ORDER } from "../../domain/services/PostConfirmationOrchestrator.js";

/**
 * Guarded recovery for ONE stuck DEXA confirmation: the October 9 2026 scan.
 *
 * What happened: the review's canonical_commit completed (canonical scan,
 * revision 1) and Apple Health writeback receipts were saved. Its
 * compatibility_writes step was then killed twice by memory exhaustion (worker,
 * then web). The review is `committing` under an expired `native-confirm`
 * claim, its only continuation message is dead, and nothing will advance it.
 *
 * Why a reset of the dead message is not enough: the dead message's
 * continuation key names the checkpoint as it was before the native retry
 * (`compatibility_writes:not_started:0`), and its operation does not own the
 * claim, so the worker would correctly reject it as stale and do nothing.
 *
 * What recovery does: inserts exactly one continuation message for the
 * review's CURRENT checkpoint, built by the same domain function the system
 * uses when it enqueues continuations. The dead message is left as history.
 * The worker then takes over the lapsed claim and resumes from
 * compatibility_writes through the bounded DEXA steps; nothing completed is
 * replayed. No review, canonical, appointment, analysis, briefing or HealthKit
 * row is written by the recovery itself.
 *
 * Execute only on a Server that contains the bounded DEXA steps. Preview is
 * read-only. Apply requires a separate Founder authorization reference AND a
 * matching seal from a fresh preview, re-derives every fact under the owner
 * lock, and refuses on any drift. No Founder identifier is stored in source:
 * the owner comes from the runtime binding and the review is discovered from
 * its DEXA intake receipt for the scope date.
 */
export const OCTOBER9_DEXA_CONTINUATION_RECOVERY_SCOPE = Object.freeze({
  recoveryId: "dexa-2026-10-09-continuation-recovery-v1",
  evidenceDate: "2026-10-09",
  expectedEvidenceType: "dexa_scan",
  expectedCompletedSteps: Object.freeze(["canonical_commit"]),
  expectedNextStep: "compatibility_writes",
  expectedClaimOperationPrefix: "native-confirm:",
  // The claim's lease must have lapsed at least this long ago, so no live
  // process can still own the step.
  minimumLeaseLapseMs: 5 * 60_000,
  expectedCanonicalRevision: 1,
  expectedHealthKitReceiptCount: 2,
});

export const DEXA_RECOVERY_SEAL_VERSION = "dexa-continuation-recovery-seal-v1";
const DEXA_TYPES = Object.freeze(["dexa", "dexa_scan", "body_composition"]);

/**
 * Read-only facts. `query` runs inside a transaction the caller owns: READ ONLY
 * for preview and postflight, owner-locked READ COMMITTED for apply (`lock`).
 */
export async function loadDexaContinuationRecoveryFacts({ query, ownerUserId, scope = OCTOBER9_DEXA_CONTINUATION_RECOVERY_SCOPE, lock = false }) {
  const forUpdate = lock ? " FOR UPDATE" : "";
  const receipts = (await query(
    `SELECT id, review_id, package_id, media_state, interpretation_state, created_at
       FROM physiqueos.evidence_intake_receipts
      WHERE owner_user_id=$1 AND effective_date=$2::date AND expected_evidence_type=$3
      ORDER BY created_at`,
    [ownerUserId, scope.evidenceDate, scope.expectedEvidenceType],
  )).rows;
  const receipt = receipts.length === 1 ? receipts[0] : null;
  const reviewId = receipt?.review_id ?? null;
  const reviewRow = reviewId ? (await query(
    `SELECT version, payload FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='evidenceReviews' AND record_id=$2${forUpdate}`,
    [ownerUserId, reviewId],
  )).rows[0] ?? null : null;
  const otherOpenReviews = Number((await query(
    `SELECT count(*)::int AS n FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='evidenceReviews' AND record_id<>$2
        AND payload->>'status' IN ('committing','partially_committed','pending','commit_failed')
        AND (payload->'interpretedEvidence'->>'detected_evidence_type'=$3
          OR payload->'interpretedEvidence'->'evidence_objects'->0->>'evidence_type'=ANY($4::text[]))
        AND left(COALESCE(payload->'interpretedEvidence'->'evidence_objects'->0->>'observed_at',''),10)=$5`,
    [ownerUserId, reviewId ?? "", scope.expectedEvidenceType, DEXA_TYPES, scope.evidenceDate],
  )).rows[0]?.n ?? 0);
  const messages = reviewId ? (await query(
    `SELECT id, status, attempt_count, dedupe_key, claim_expires_at, updated_at, payload->>'continuationKey' AS continuation_key
       FROM physiqueos.outbox_messages
      WHERE user_id=$1 AND topic=$2 AND payload->>'reviewId'=$3
      ORDER BY created_at, id${forUpdate}`,
    [ownerUserId, EVIDENCE_REVIEW_CONTINUATION_TOPIC, reviewId],
  )).rows.map((row) => ({
    id: row.id, status: row.status, attemptCount: Number(row.attempt_count), dedupeKey: row.dedupe_key,
    claimExpiresAt: iso(row.claim_expires_at), updatedAt: iso(row.updated_at), continuationKey: row.continuation_key,
  })) : [];
  const canonicalId = `dexa_scan|${ownerUserId}|${scope.evidenceDate}`;
  const canonicalRows = (await query(
    `SELECT record_id, version, payload->>'canonicalId' AS canonical_id, payload->'quality'->>'status' AS quality,
            payload->'dexaRevision'->>'revision' AS revision, payload->'dexaRevision'->>'sourceReviewId' AS source_review_id
       FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='canonicalEvidenceObjects'
        AND COALESCE(payload->>'evidence_type', payload#>>'{payload,evidence_type}')=ANY($2::text[])
        AND left(COALESCE(payload->>'lastObservedAt', payload#>>'{payload,measuredAt}', ''),10)=$3
      ORDER BY record_id`,
    [ownerUserId, DEXA_TYPES, scope.evidenceDate],
  )).rows.map((row) => ({
    recordId: row.record_id, version: Number(row.version), canonicalId: row.canonical_id, quality: row.quality,
    revision: row.revision == null ? null : Number(row.revision), sourceReviewId: row.source_review_id,
  }));
  const objectId = reviewRow?.payload?.interpretedEvidence?.evidence_objects?.find((item) =>
    item?.removed !== true && DEXA_TYPES.includes(item?.evidence_type))?.id ?? null;
  const packageId = reviewRow?.payload?.interpretedEvidence?.package_id ?? reviewRow?.payload?.interpretedEvidence?.id ?? null;
  const count = async (text, values) => Number((await query(text, values)).rows[0]?.n ?? 0);
  const legacyRows = await count(
    `SELECT count(*)::int AS n FROM physiqueos.canonical_evidence_records
      WHERE owner_user_id=$1 AND collection_name='dexaScans'
        AND (record_id=$2 OR left(COALESCE(payload->>'measuredAt',''),10)=$3)`,
    [ownerUserId, objectId ?? "", scope.evidenceDate],
  );
  const appointmentRow = (await query(
    `SELECT version, payload FROM physiqueos.canonical_execution_records
      WHERE owner_user_id=$1 AND collection_name='executionItems' AND record_id='execution_next_dexa'`,
    [ownerUserId],
  )).rows[0] ?? null;
  const appointment = appointmentRow ? {
    version: Number(appointmentRow.version),
    status: appointmentRow.payload?.status ?? null,
    active: appointmentRow.payload?.active !== false,
    scheduledDate: appointmentRow.payload?.preferredSchedule?.date ?? null,
    completedByEvidenceId: appointmentRow.payload?.completedByEvidenceId ?? null,
    completionsForScan: (appointmentRow.payload?.completionHistory ?? []).filter((entry) => entry?.canonicalEvidenceId === canonicalId).length,
  } : null;
  const eventBriefings = await count(
    `SELECT count(*)::int AS n FROM physiqueos.canonical_briefing_records
      WHERE owner_user_id=$1 AND collection_name='dailyBriefings' AND record_id=$2`,
    [ownerUserId, `dexa_event_${objectId ?? ""}`],
  );
  const dexaAnalyses = await count(
    `SELECT count(*)::int AS n FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name='analyses' AND payload->'evidenceIds' ? $2`,
    [ownerUserId, canonicalId],
  );
  const goalEvaluations = await count(
    `SELECT count(*)::int AS n FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name='analyses' AND record_id=$2`,
    [ownerUserId, `goal_evaluation_${packageId ?? ""}`],
  );
  const healthKitReceipts = (await query(
    `SELECT payload->>'measurementKind' AS kind, payload->>'canonicalRevision' AS revision, payload->>'outcome' AS outcome
       FROM physiqueos.canonical_training_records
      WHERE owner_user_id=$1 AND collection_name='dexaHealthKitWritebackReceipts' AND payload->>'canonicalId'=$2
      ORDER BY 1`,
    [ownerUserId, canonicalId],
  )).rows.map((row) => ({ kind: row.kind, revision: row.revision == null ? null : Number(row.revision), outcome: row.outcome }));
  return Object.freeze({
    receipts: receipts.map((row) => ({ id: row.id, reviewId: row.review_id, packageId: row.package_id, mediaState: row.media_state, interpretationState: row.interpretation_state })),
    receipt: receipt ? { id: receipt.id, reviewId: receipt.review_id, packageId: receipt.package_id, mediaState: receipt.media_state, interpretationState: receipt.interpretation_state } : null,
    review: reviewRow ? { version: Number(reviewRow.version), payload: reviewRow.payload } : null,
    otherOpenReviews,
    messages,
    canonicalId,
    canonicalRows,
    objectId,
    packageId,
    legacyRows,
    appointment,
    eventBriefings,
    dexaAnalyses,
    goalEvaluations,
    healthKitReceipts,
  });
}

/**
 * Pure plan. Returns a refusal, or the exact single-message insertion and the
 * seal that apply must match.
 */
export function planDexaContinuationRecovery({ facts, ownerUserId, scope = OCTOBER9_DEXA_CONTINUATION_RECOVERY_SCOPE, now = new Date(), messageId }) {
  const refuse = (code, detail) => Object.freeze({ outcome: "refused", code, detail });
  if (!String(ownerUserId ?? "").trim()) return refuse("OWNER_MISSING", "The runtime owner binding is required.");
  if (facts.receipts.length !== 1) return refuse("INTAKE_RECEIPT_NOT_SINGLETON", `Found ${facts.receipts.length} DEXA intake receipts for ${scope.evidenceDate}.`);
  const { receipt, review } = facts;
  if (receipt.mediaState !== "stored" || receipt.interpretationState !== "completed" || !receipt.reviewId) {
    return refuse("INTAKE_RECEIPT_STATE_UNEXPECTED", "The intake receipt is not stored and interpreted with a review.");
  }
  if (!review) return refuse("REVIEW_MISSING", "The receipt's review does not exist.");
  const payload = review.payload ?? {};
  if (payload.id !== receipt.reviewId || payload.userId !== ownerUserId) return refuse("REVIEW_IDENTITY_MISMATCH", "Review identity or owner differs.");
  if (payload.intakeReceiptId !== receipt.id) return refuse("REVIEW_INTAKE_MISMATCH", "Review does not belong to the intake receipt.");
  if (payload.confirmation || payload.status === "confirmed") {
    return Object.freeze({ outcome: "already_confirmed", detail: "The review is already confirmed; nothing to recover." });
  }
  if (payload.status !== "committing") return refuse("REVIEW_STATUS_UNEXPECTED", `Review status is ${payload.status}.`);
  if (facts.otherOpenReviews !== 0) return refuse("OTHER_OPEN_DEXA_REVIEW", "Another open DEXA review exists for the scope date.");
  const objects = (payload.interpretedEvidence?.evidence_objects ?? []).filter((item) => item?.removed !== true);
  if (objects.length !== 1 || !DEXA_TYPES.includes(objects[0].evidence_type) ||
      String(objects[0].observed_at ?? objects[0].measuredAt).slice(0, 10) !== scope.evidenceDate) {
    return refuse("REVIEW_NOT_SINGLE_DEXA_FOR_DATE", "The review is not exactly one DEXA scan for the scope date.");
  }

  const progress = payload.commitProgress ?? {};
  const completed = POST_CONFIRMATION_STEP_ORDER.filter((step) => progress[step]?.status === "completed");
  if (JSON.stringify(completed) !== JSON.stringify(scope.expectedCompletedSteps)) {
    return refuse("COMPLETED_STEPS_UNEXPECTED", `Completed steps are ${completed.join(",") || "none"}.`);
  }
  const next = POST_CONFIRMATION_STEP_ORDER.find((step) => progress[step]?.status !== "completed");
  if (next !== scope.expectedNextStep || !["started", "failed", undefined].includes(progress[next]?.status)) {
    return refuse("NEXT_STEP_UNEXPECTED", `Next step is ${next} (${progress[next]?.status ?? "not_started"}).`);
  }
  const canonicalIds = progress.canonical_commit?.result?.canonicalEvidenceIds ?? [];
  if (!canonicalIds.includes(facts.canonicalId)) return refuse("CANONICAL_COMMIT_RESULT_MISMATCH", "canonical_commit does not record the scope scan.");

  const claim = payload.commitClaim ?? {};
  if (claim.status !== "in_progress" || !String(claim.operationId ?? "").startsWith(scope.expectedClaimOperationPrefix)) {
    return refuse("CLAIM_UNEXPECTED", `Claim is ${claim.status} under ${String(claim.operationId ?? "").split(":")[0] || "none"}.`);
  }
  const leaseExpiresAt = Date.parse(claim.leaseExpiresAt ?? "");
  if (!Number.isFinite(leaseExpiresAt) || now.getTime() - leaseExpiresAt < scope.minimumLeaseLapseMs) {
    return refuse("CLAIM_LEASE_NOT_LAPSED", "The claim lease has not lapsed long enough; a process may still own the step.");
  }

  if (facts.canonicalRows.length !== 1) return refuse("CANONICAL_DEXA_NOT_SINGLETON", `Found ${facts.canonicalRows.length} canonical DEXA records for the scope date.`);
  const canonical = facts.canonicalRows[0];
  if (canonical.canonicalId !== facts.canonicalId || canonical.quality !== "active" ||
      canonical.revision !== scope.expectedCanonicalRevision || canonical.sourceReviewId !== payload.id) {
    return refuse("CANONICAL_DEXA_UNEXPECTED", "The canonical DEXA record is not the active scope revision from this review.");
  }
  if (facts.legacyRows !== 0) return refuse("LEGACY_ROW_ALREADY_PRESENT", "A legacy DEXA read-model row already exists for the scope date.");
  const appointment = facts.appointment;
  if (!appointment || appointment.status !== "scheduled" || !appointment.active ||
      appointment.scheduledDate !== scope.evidenceDate || appointment.completionsForScan !== 0) {
    return refuse("APPOINTMENT_UNEXPECTED", "The DEXA appointment is not the scheduled, uncompleted scope appointment.");
  }
  if (facts.eventBriefings !== 0) return refuse("DEXA_EVENT_BRIEFING_EXISTS", "A DEXA Event briefing already exists for this scan.");
  if (facts.dexaAnalyses !== 0 || facts.goalEvaluations !== 0) return refuse("ANALYSIS_ALREADY_EXISTS", "DEXA analysis or Goal evaluation already exists.");
  const receipts = facts.healthKitReceipts;
  if (receipts.length !== scope.expectedHealthKitReceiptCount ||
      receipts.some((item) => item.revision !== scope.expectedCanonicalRevision || !["saved", "already_present"].includes(item.outcome))) {
    return refuse("HEALTHKIT_RECEIPTS_UNEXPECTED", "Apple Health writeback receipts are not the expected pair for revision 1.");
  }

  const live = facts.messages.filter((message) => ["pending", "processing"].includes(message.status));
  if (live.length) return refuse("CONTINUATION_ALREADY_LIVE", "A continuation for this review is already pending or processing.");
  const dead = facts.messages.filter((message) => message.status === "dead");
  if (facts.messages.length !== 1 || dead.length !== 1) {
    return refuse("MESSAGE_HISTORY_UNEXPECTED", `Expected exactly one dead continuation; found ${facts.messages.length} message(s).`);
  }
  const continuationKey = createEvidenceReviewContinuationKey(payload);
  if (!continuationKey || !continuationKey.includes(`:${scope.expectedNextStep}:`)) {
    return refuse("CONTINUATION_KEY_UNAVAILABLE", "The review has no current continuation checkpoint.");
  }
  if (facts.messages.some((message) => message.dedupeKey === continuationKey)) {
    return refuse("CONTINUATION_KEY_ALREADY_USED", "A message already exists for the current checkpoint.");
  }
  if (!/^[0-9a-f-]{36}$/.test(String(messageId ?? ""))) return refuse("MESSAGE_ID_INVALID", "A predicted message id is required.");
  const message = createEvidenceReviewContinuationMessage(payload, { createId: () => messageId });

  const sealed = Object.freeze({
    sealVersion: DEXA_RECOVERY_SEAL_VERSION,
    recoveryId: scope.recoveryId,
    ownerDigest: digest(ownerUserId),
    receiptId: receipt.id,
    reviewId: payload.id,
    reviewVersion: review.version,
    reviewStateDigest: digest({ status: payload.status, commitClaim: payload.commitClaim, commitProgress: payload.commitProgress, packageId: payload.interpretedEvidence?.package_id ?? null }),
    // Canonical evidence rows are keyed by position, so the seal pins the
    // canonical identity, its revision and the row version, not the row key.
    canonical: Object.freeze({ canonicalId: canonical.canonicalId, version: canonical.version, revision: canonical.revision }),
    appointmentVersion: appointment.version,
    deadMessage: Object.freeze({ id: dead[0].id, attemptCount: dead[0].attemptCount, updatedAt: dead[0].updatedAt }),
    insert: Object.freeze({
      id: message.id, topic: message.topic, dedupeKey: message.dedupeKey,
      payloadVersion: message.payloadVersion, payload: message.payload,
    }),
  });
  return Object.freeze({
    outcome: "insert_continuation",
    sealed,
    sealDigest: digest(sealed),
    predictedMutation: `1 outbox INSERT ${message.topic} ${message.id} (pending, attempt 0) for checkpoint ${message.dedupeKey.split(":").slice(1).join(":")}; no other row written`,
  });
}

/**
 * preview: read-only plan + seal. apply: owner-locked re-plan with the sealed
 * message id; must reproduce the sealed digest exactly, then inserts the one
 * message. Callers own the transaction (see the entry script).
 */
export async function runDexaContinuationRecovery({
  query, ownerUserId, mode = "preview", seal = null, authorizationReference = "",
  scope = OCTOBER9_DEXA_CONTINUATION_RECOVERY_SCOPE, now = () => new Date(), createId,
}) {
  if (!["preview", "apply"].includes(mode)) throw recoveryError("MODE_INVALID");
  const apply = mode === "apply";
  if (apply && !String(authorizationReference).trim()) throw recoveryError("AUTHORIZATION_REFERENCE_REQUIRED");
  if (apply && (!seal?.sealDigest || !seal?.sealed?.insert?.id)) throw recoveryError("SEAL_REQUIRED");
  const facts = await loadDexaContinuationRecoveryFacts({ query, ownerUserId, scope, lock: apply });
  if (apply) {
    const existing = facts.messages.find((message) => message.id === seal.sealed.insert.id);
    if (existing) return Object.freeze({ mode, outcome: "already_applied", messageId: existing.id, status: existing.status });
  }
  const plan = planDexaContinuationRecovery({
    facts, ownerUserId, scope, now: now(), messageId: apply ? seal.sealed.insert.id : createId(),
  });
  if (plan.outcome !== "insert_continuation") return Object.freeze({ mode, ...plan });
  if (!apply) return Object.freeze({ mode, ...plan });
  if (plan.sealDigest !== seal.sealDigest || canonicalJson(plan.sealed) !== canonicalJson(seal.sealed)) {
    return Object.freeze({ mode, outcome: "refused", code: "SEAL_DRIFT", detail: "Production state differs from the sealed preview; run a fresh preview." });
  }
  const insert = plan.sealed.insert;
  const inserted = await query(
    `INSERT INTO physiqueos.outbox_messages
      (id,user_id,operation_id,topic,dedupe_key,payload_version,payload,status,due_at)
     VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb,'pending',now())
     ON CONFLICT (topic,dedupe_key) DO NOTHING
     RETURNING id,status,attempt_count`,
    [insert.id, ownerUserId, insert.topic, insert.dedupeKey, insert.payloadVersion, JSON.stringify(insert.payload)],
  );
  if (inserted.rowCount !== 1) throw recoveryError("MESSAGE_INSERT_CONFLICT");
  return Object.freeze({
    mode, outcome: "applied", sealDigest: plan.sealDigest, rowsChanged: 1,
    authorizationReference: String(authorizationReference),
    message: Object.freeze({ id: inserted.rows[0].id, status: inserted.rows[0].status, attemptCount: Number(inserted.rows[0].attempt_count) }),
  });
}

/**
 * Independent read-only postflight against the sealed preview. Reports where
 * the resumed pipeline is and, once confirmed, verifies every expected effect
 * and that nothing was duplicated or rewritten.
 */
export function verifyDexaContinuationRecoveryPostflight({ facts, seal, ownerUserId, scope = OCTOBER9_DEXA_CONTINUATION_RECOVERY_SCOPE }) {
  const sealed = seal?.sealed;
  if (!sealed) throw recoveryError("SEAL_REQUIRED");
  const checks = [];
  const check = (name, ok, detail = null) => checks.push(Object.freeze({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) }));
  const payload = facts.review?.payload ?? {};
  check("owner_matches_seal", digest(ownerUserId) === sealed.ownerDigest);
  check("review_matches_seal", payload.id === sealed.reviewId && facts.receipt?.id === sealed.receiptId);
  const recoveryMessage = facts.messages.find((message) => message.id === sealed.insert.id) ?? null;
  check("recovery_message_present", Boolean(recoveryMessage), recoveryMessage?.status ?? "missing");
  const progress = payload.commitProgress ?? {};
  const completed = POST_CONFIRMATION_STEP_ORDER.filter((step) => progress[step]?.status === "completed");
  const live = facts.messages.filter((message) => ["pending", "processing"].includes(message.status));
  const confirmed = payload.status === "confirmed" && Boolean(payload.confirmation);
  check("canonical_commit_not_replayed", progress.canonical_commit?.attempts === 1);
  check("canonical_dexa_single_unchanged", facts.canonicalRows.length === 1 &&
    facts.canonicalRows[0].canonicalId === sealed.canonical.canonicalId &&
    facts.canonicalRows[0].revision === sealed.canonical.revision);
  check("healthkit_receipts_unchanged", facts.healthKitReceipts.length === scope.expectedHealthKitReceiptCount &&
    facts.healthKitReceipts.every((item) => item.revision === sealed.canonical.revision));
  if (confirmed) {
    check("all_steps_completed", completed.length === POST_CONFIRMATION_STEP_ORDER.length);
    check("legacy_row_single", facts.legacyRows === 1);
    check("appointment_completed_once", facts.appointment?.status === "completed" &&
      facts.appointment.completedByEvidenceId === facts.canonicalId && facts.appointment.completionsForScan === 1);
    check("dexa_analysis_present", facts.dexaAnalyses >= 1);
    check("goal_evaluation_present", facts.goalEvaluations === 1);
    check("dexa_event_briefing_single", facts.eventBriefings === 1);
    check("no_live_continuation", live.length === 0);
  }
  const failedStep = POST_CONFIRMATION_STEP_ORDER.find((step) => progress[step]?.status === "failed") ?? null;
  const state = confirmed
    ? (checks.every((item) => item.ok) ? "complete" : "complete_with_discrepancies")
    : ["partially_committed", "commit_failed"].includes(payload.status) || facts.messages.some((m) => m.id === sealed.insert.id && m.status === "dead")
      ? "failed"
      : "in_progress";
  return Object.freeze({
    state,
    reviewStatus: payload.status ?? null,
    completedSteps: completed,
    nextStep: POST_CONFIRMATION_STEP_ORDER.find((step) => progress[step]?.status !== "completed") ?? null,
    failedStep,
    liveContinuations: live.length,
    checks: Object.freeze(checks),
  });
}

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}
function iso(value) { return value == null ? null : new Date(value).toISOString(); }
function recoveryError(code) { return Object.assign(new Error(code), { code }); }
