import { describe, expect, it } from "vitest";
import {
  loadDexaContinuationRecoveryFacts,
  OCTOBER9_DEXA_CONTINUATION_RECOVERY_SCOPE as SCOPE,
  planDexaContinuationRecovery,
  runDexaContinuationRecovery,
  verifyDexaContinuationRecoveryPostflight,
} from "./DexaContinuationRecovery.js";
import { createEvidenceReviewContinuationKey } from "../../domain/services/EvidenceReviewBackgroundContinuation.js";

// Synthetic identities in the production shape observed read-only on
// 2026-10-09; no Founder identifier is reproduced.
const OWNER = "user_synthetic_owner";
const RECEIPT_ID = "evidence_intake_synthetic";
const REVIEW_ID = "evidence_review_synthetic";
const PACKAGE_ID = "evidence_submission_synthetic_package";
const OBJECT_ID = "evidence_submission_synthetic_pdf_1_2026_10_09";
const CANONICAL_ID = `dexa_scan|${OWNER}|2026-10-09`;
const DEAD_ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-09T18:00:00.000Z");

function review(overrides = {}) {
  return {
    id: REVIEW_ID, userId: OWNER, status: "committing", confirmation: null, intakeReceiptId: RECEIPT_ID,
    interpretedEvidence: { package_id: PACKAGE_ID, detected_evidence_type: "dexa_scan",
      evidence_objects: [{ id: OBJECT_ID, evidence_type: "dexa_scan", observed_at: "2026-10-09" }] },
    commitProgress: {
      canonical_commit: { status: "completed", attempts: 1, result: { status: "completed", canonicalEvidenceIds: ["other", CANONICAL_ID] } },
      compatibility_writes: { status: "started", attempts: 3, startedAt: "2026-10-09T14:37:29.057Z" },
    },
    commitClaim: { status: "in_progress", operationId: "native-confirm:synthetic-operation", leaseExpiresAt: "2026-10-09T14:47:29.058Z", packageId: PACKAGE_ID },
    ...overrides,
  };
}

function facts(overrides = {}) {
  return {
    receipts: [{ id: RECEIPT_ID, reviewId: REVIEW_ID, packageId: PACKAGE_ID, mediaState: "stored", interpretationState: "completed" }],
    receipt: { id: RECEIPT_ID, reviewId: REVIEW_ID, packageId: PACKAGE_ID, mediaState: "stored", interpretationState: "completed" },
    review: { version: 12, payload: review() },
    otherOpenReviews: 0,
    messages: [{ id: DEAD_ID, status: "dead", attemptCount: 4, dedupeKey: `${REVIEW_ID}:canonical_commit:compatibility_writes:not_started:0`, claimExpiresAt: null, updatedAt: "2026-10-09T14:28:37.961Z" }],
    canonicalId: CANONICAL_ID,
    canonicalRows: [{ recordId: "@index:594", version: 1, canonicalId: CANONICAL_ID, quality: "active", revision: 1, sourceReviewId: REVIEW_ID }],
    objectId: OBJECT_ID,
    packageId: PACKAGE_ID,
    legacyRows: 0,
    appointment: { version: 5, status: "scheduled", active: true, scheduledDate: "2026-10-09", completedByEvidenceId: null, completionsForScan: 0 },
    eventBriefings: 0,
    dexaAnalyses: 0,
    goalEvaluations: 0,
    healthKitReceipts: [
      { kind: "bodyFatPercentage", revision: 1, outcome: "already_present" },
      { kind: "leanBodyMassFatFree", revision: 1, outcome: "already_present" },
    ],
    ...overrides,
  };
}

const plan = (overrides = {}, { now = NOW, messageId = NEW_ID } = {}) =>
  planDexaContinuationRecovery({ facts: facts(overrides), ownerUserId: OWNER, now, messageId });

describe("October 9 DEXA continuation recovery plan", () => {
  it("plans exactly one continuation insert for the review's current checkpoint", () => {
    const result = plan();
    const currentKey = createEvidenceReviewContinuationKey(review());
    expect(currentKey).toBe(`${REVIEW_ID}:canonical_commit:compatibility_writes:started:3`);
    expect(result).toMatchObject({
      outcome: "insert_continuation",
      sealed: {
        reviewId: REVIEW_ID, reviewVersion: 12, receiptId: RECEIPT_ID, appointmentVersion: 5,
        canonical: { canonicalId: CANONICAL_ID, version: 1, revision: 1 },
        deadMessage: { id: DEAD_ID, attemptCount: 4 },
        insert: { id: NEW_ID, topic: "evidence.review.continue", dedupeKey: currentKey, payloadVersion: "1", payload: { reviewId: REVIEW_ID, continuationKey: currentKey } },
      },
    });
    expect(result.sealDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.predictedMutation).toContain("1 outbox INSERT");
    // The owner is bound by digest. The seal still holds real identifiers (the
    // canonical id embeds the owner), so it stays in local operator scratch and
    // is never published.
    expect(result.sealed.ownerDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: the same facts and message id give the same seal", () => {
    expect(plan().sealDigest).toBe(plan().sealDigest);
    expect(plan({ review: { version: 13, payload: review() } }).sealDigest).not.toBe(plan().sealDigest);
  });

  it("reports an already confirmed review as nothing to do", () => {
    expect(plan({ review: { version: 20, payload: review({ status: "confirmed", confirmation: { confirmedAt: "x" } }) } }))
      .toMatchObject({ outcome: "already_confirmed" });
  });

  it.each([
    ["no receipt", { receipts: [], receipt: null }, "INTAKE_RECEIPT_NOT_SINGLETON"],
    ["two receipts", { receipts: [facts().receipt, facts().receipt] }, "INTAKE_RECEIPT_NOT_SINGLETON"],
    ["receipt not interpreted", { receipt: { ...facts().receipt, interpretationState: "processing" } }, "INTAKE_RECEIPT_STATE_UNEXPECTED"],
    ["review missing", { review: null }, "REVIEW_MISSING"],
    ["foreign owner", { review: { version: 12, payload: review({ userId: "someone_else" }) } }, "REVIEW_IDENTITY_MISMATCH"],
    ["other intake", { review: { version: 12, payload: review({ intakeReceiptId: "other" }) } }, "REVIEW_INTAKE_MISMATCH"],
    ["dead-lettered again", { review: { version: 13, payload: review({ status: "partially_committed" }) } }, "REVIEW_STATUS_UNEXPECTED"],
    ["second open DEXA review", { otherOpenReviews: 1 }, "OTHER_OPEN_DEXA_REVIEW"],
    ["not a single DEXA for the date", { review: { version: 12, payload: review({ interpretedEvidence: { package_id: PACKAGE_ID, evidence_objects: [{ id: "w", evidence_type: "weight", observed_at: "2026-10-09" }] } }) } }, "REVIEW_NOT_SINGLE_DEXA_FOR_DATE"],
    ["compatibility already completed", { review: { version: 12, payload: review({ commitProgress: { ...review().commitProgress, compatibility_writes: { status: "completed", attempts: 4 } } }) } }, "COMPLETED_STEPS_UNEXPECTED"],
    ["canonical commit missing the scan", { review: { version: 12, payload: review({ commitProgress: { ...review().commitProgress, canonical_commit: { status: "completed", attempts: 1, result: { canonicalEvidenceIds: ["other"] } } } }) } }, "CANONICAL_COMMIT_RESULT_MISMATCH"],
    ["claim released", { review: { version: 12, payload: review({ commitClaim: { ...review().commitClaim, status: "available" } }) } }, "CLAIM_UNEXPECTED"],
    ["claim by a worker", { review: { version: 12, payload: review({ commitClaim: { ...review().commitClaim, operationId: "evidence-review-background:x" } }) } }, "CLAIM_UNEXPECTED"],
    ["two canonical scans for the date", { canonicalRows: [facts().canonicalRows[0], { ...facts().canonicalRows[0], recordId: "@index:9" }] }, "CANONICAL_DEXA_NOT_SINGLETON"],
    ["canonical revised", { canonicalRows: [{ ...facts().canonicalRows[0], revision: 2 }] }, "CANONICAL_DEXA_UNEXPECTED"],
    ["canonical from another review", { canonicalRows: [{ ...facts().canonicalRows[0], sourceReviewId: "other" }] }, "CANONICAL_DEXA_UNEXPECTED"],
    ["legacy row present", { legacyRows: 1 }, "LEGACY_ROW_ALREADY_PRESENT"],
    ["appointment completed", { appointment: { ...facts().appointment, status: "completed" } }, "APPOINTMENT_UNEXPECTED"],
    ["appointment moved", { appointment: { ...facts().appointment, scheduledDate: "2026-10-10" } }, "APPOINTMENT_UNEXPECTED"],
    ["appointment missing", { appointment: null }, "APPOINTMENT_UNEXPECTED"],
    ["briefing exists", { eventBriefings: 1 }, "DEXA_EVENT_BRIEFING_EXISTS"],
    ["analysis exists", { dexaAnalyses: 1 }, "ANALYSIS_ALREADY_EXISTS"],
    ["goal evaluation exists", { goalEvaluations: 1 }, "ANALYSIS_ALREADY_EXISTS"],
    ["one HealthKit receipt", { healthKitReceipts: [facts().healthKitReceipts[0]] }, "HEALTHKIT_RECEIPTS_UNEXPECTED"],
    ["HealthKit receipt for another revision", { healthKitReceipts: [facts().healthKitReceipts[0], { ...facts().healthKitReceipts[1], revision: 2 }] }, "HEALTHKIT_RECEIPTS_UNEXPECTED"],
    ["a live continuation", { messages: [...facts().messages, { id: "x", status: "pending", attemptCount: 0, dedupeKey: "k" }] }, "CONTINUATION_ALREADY_LIVE"],
    ["no message history", { messages: [] }, "MESSAGE_HISTORY_UNEXPECTED"],
    ["an extra succeeded message", { messages: [...facts().messages, { id: "y", status: "succeeded", attemptCount: 1, dedupeKey: "k2" }] }, "MESSAGE_HISTORY_UNEXPECTED"],
  ])("refuses: %s", (_name, overrides, code) => {
    expect(plan(overrides)).toMatchObject({ outcome: "refused", code });
  });

  it("refuses while the native claim lease lapsed less than five minutes ago", () => {
    expect(plan({}, { now: new Date("2026-10-09T14:50:00.000Z") })).toMatchObject({ outcome: "refused", code: "CLAIM_LEASE_NOT_LAPSED" });
  });

  it("refuses a predicted message id that is not a UUID", () => {
    expect(plan({}, { messageId: "not-a-uuid" })).toMatchObject({ outcome: "refused", code: "MESSAGE_ID_INVALID" });
  });
});

// Scripted SQL: every statement the recovery issues, keyed by its shape.
function scriptedQuery(state) {
  const statements = [];
  const query = async (text, values = []) => {
    const sql = String(text);
    statements.push(sql);
    if (/INSERT INTO physiqueos\.outbox_messages/.test(sql)) {
      state.inserted.push(values);
      return state.insertConflict ? { rows: [], rowCount: 0 } : { rows: [{ id: values[0], status: "pending", attempt_count: 0 }], rowCount: 1 };
    }
    if (!/^\s*SELECT/.test(sql)) throw new Error(`unexpected statement ${sql.slice(0, 60)}`);
    if (/FROM physiqueos\.evidence_intake_receipts/.test(sql)) return rows(state.facts.receipts.map((r) => ({ id: r.id, review_id: r.reviewId, package_id: r.packageId, media_state: r.mediaState, interpretation_state: r.interpretationState })));
    if (/record_id<>\$2/.test(sql)) return rows([{ n: state.facts.otherOpenReviews }]);
    if (/collection_name='evidenceReviews' AND record_id=\$2/.test(sql)) return rows(state.facts.review ? [state.facts.review] : []);
    if (/FROM physiqueos\.outbox_messages/.test(sql)) return rows(state.facts.messages.map((m) => ({ id: m.id, status: m.status, attempt_count: m.attemptCount, dedupe_key: m.dedupeKey, claim_expires_at: m.claimExpiresAt, updated_at: m.updatedAt, continuation_key: null })));
    if (/collection_name='canonicalEvidenceObjects'/.test(sql)) return rows(state.facts.canonicalRows.map((r) => ({ record_id: r.recordId, version: r.version, canonical_id: r.canonicalId, quality: r.quality, revision: String(r.revision), source_review_id: r.sourceReviewId })));
    if (/collection_name='dexaScans'/.test(sql)) return rows([{ n: state.facts.legacyRows }]);
    if (/record_id='execution_next_dexa'/.test(sql)) {
      const a = state.facts.appointment;
      return rows(a ? [{ version: a.version, payload: { status: a.status, active: a.active, preferredSchedule: { date: a.scheduledDate }, completedByEvidenceId: a.completedByEvidenceId,
        completionHistory: Array.from({ length: a.completionsForScan }, () => ({ canonicalEvidenceId: CANONICAL_ID })) } }] : []);
    }
    if (/collection_name='dailyBriefings'/.test(sql)) return rows([{ n: state.facts.eventBriefings }]);
    if (/payload->'evidenceIds' \?/.test(sql)) return rows([{ n: state.facts.dexaAnalyses }]);
    if (/collection_name='analyses' AND record_id=\$2/.test(sql)) return rows([{ n: state.facts.goalEvaluations }]);
    if (/dexaHealthKitWritebackReceipts/.test(sql)) return rows(state.facts.healthKitReceipts.map((r) => ({ kind: r.kind, revision: String(r.revision), outcome: r.outcome })));
    throw new Error(`unscripted SELECT ${sql.slice(0, 80)}`);
  };
  return { query, statements };
}
const rows = (list) => ({ rows: list, rowCount: list.length });

describe("October 9 DEXA continuation recovery run", () => {
  const state = (overrides = {}) => ({ facts: facts(overrides), inserted: [], insertConflict: false });

  it("loads facts with SELECTs only, and row locks only for apply", async () => {
    const preview = scriptedQuery(state());
    await loadDexaContinuationRecoveryFacts({ query: preview.query, ownerUserId: OWNER });
    expect(preview.statements.every((sql) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(preview.statements.some((sql) => /FOR UPDATE/.test(sql))).toBe(false);
    const locked = scriptedQuery(state());
    await loadDexaContinuationRecoveryFacts({ query: locked.query, ownerUserId: OWNER, lock: true });
    expect(locked.statements.filter((sql) => /FOR UPDATE/.test(sql))).toHaveLength(2);
  });

  it("previews without writing and seals the predicted message", async () => {
    const s = state();
    const { query } = scriptedQuery(s);
    const result = await runDexaContinuationRecovery({ query, ownerUserId: OWNER, now: () => NOW, createId: () => NEW_ID });
    expect(result).toMatchObject({ mode: "preview", outcome: "insert_continuation", sealed: { insert: { id: NEW_ID } } });
    expect(s.inserted).toEqual([]);
  });

  it("applies only with an authorization reference and a seal", async () => {
    const { query } = scriptedQuery(state());
    await expect(runDexaContinuationRecovery({ query, ownerUserId: OWNER, mode: "apply", seal: plan() }))
      .rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    await expect(runDexaContinuationRecovery({ query, ownerUserId: OWNER, mode: "apply", authorizationReference: "founder-approval" }))
      .rejects.toMatchObject({ code: "SEAL_REQUIRED" });
  });

  it("inserts exactly the sealed message when production still matches the seal", async () => {
    const s = state();
    const { query } = scriptedQuery(s);
    const seal = plan();
    const result = await runDexaContinuationRecovery({ query, ownerUserId: OWNER, mode: "apply", seal, authorizationReference: "founder-approval-ref", now: () => NOW });
    expect(result).toMatchObject({ mode: "apply", outcome: "applied", rowsChanged: 1, sealDigest: seal.sealDigest, message: { id: NEW_ID, status: "pending", attemptCount: 0 } });
    expect(s.inserted).toHaveLength(1);
    const [id, user, topic, dedupeKey, payloadVersion, payload] = s.inserted[0];
    expect({ id, user, topic, dedupeKey, payloadVersion, payload: JSON.parse(payload) }).toEqual({
      id: NEW_ID, user: OWNER, topic: "evidence.review.continue", dedupeKey: seal.sealed.insert.dedupeKey, payloadVersion: "1",
      payload: { reviewId: REVIEW_ID, continuationKey: seal.sealed.insert.dedupeKey },
    });
  });

  it("refuses on drift between preview and apply and writes nothing", async () => {
    const seal = plan();
    for (const drift of [
      { review: { version: 13, payload: review() } },
      { appointment: { ...facts().appointment, version: 6 } },
      { canonicalRows: [{ ...facts().canonicalRows[0], version: 2 }] },
      { messages: [{ ...facts().messages[0], attemptCount: 5 }] },
    ]) {
      const s = state(drift);
      const { query } = scriptedQuery(s);
      const result = await runDexaContinuationRecovery({ query, ownerUserId: OWNER, mode: "apply", seal, authorizationReference: "ref", now: () => NOW });
      expect(result).toMatchObject({ outcome: "refused", code: "SEAL_DRIFT" });
      expect(s.inserted).toEqual([]);
    }
  });

  it("refuses on a changed owner without revealing either owner", async () => {
    const seal = plan();
    const s = state({ review: { version: 12, payload: review({ userId: "user_other" }) } });
    const { query } = scriptedQuery(s);
    const result = await runDexaContinuationRecovery({ query, ownerUserId: "user_other", mode: "apply", seal, authorizationReference: "ref", now: () => NOW });
    expect(result).toMatchObject({ outcome: "refused" });
    expect(s.inserted).toEqual([]);
  });

  it("is idempotent once the sealed message exists", async () => {
    const s = state({ messages: [...facts().messages, { id: NEW_ID, status: "processing", attemptCount: 1, dedupeKey: "k" }] });
    const { query } = scriptedQuery(s);
    const result = await runDexaContinuationRecovery({ query, ownerUserId: OWNER, mode: "apply", seal: plan(), authorizationReference: "ref", now: () => NOW });
    expect(result).toMatchObject({ outcome: "already_applied", messageId: NEW_ID });
    expect(s.inserted).toEqual([]);
  });

  it("fails closed if the insert does not land", async () => {
    const s = { ...state(), insertConflict: true };
    const { query } = scriptedQuery(s);
    await expect(runDexaContinuationRecovery({ query, ownerUserId: OWNER, mode: "apply", seal: plan(), authorizationReference: "ref", now: () => NOW }))
      .rejects.toMatchObject({ code: "MESSAGE_INSERT_CONFLICT" });
  });
});

describe("October 9 DEXA continuation recovery postflight", () => {
  const seal = plan();
  const after = (overrides) => facts({ messages: [...facts().messages, { id: NEW_ID, status: "succeeded", attemptCount: 1, dedupeKey: seal.sealed.insert.dedupeKey }], ...overrides });
  const confirmedReview = () => review({
    status: "confirmed", confirmation: { confirmedAt: "2026-10-09T19:00:00.000Z" },
    commitProgress: Object.fromEntries(["canonical_commit", "compatibility_writes", "scheduled_completion", "analysis", "training_performance_events",
      "goal_evaluation", "event_eligibility", "briefing", "home_refresh"].map((step) => [step, { status: "completed", attempts: step === "canonical_commit" ? 1 : 4 }])),
    commitClaim: { status: "completed", operationId: "evidence-review-background:z" },
  });

  it("reports progress while the worker is still resuming", () => {
    const result = verifyDexaContinuationRecoveryPostflight({ facts: after(), seal, ownerUserId: OWNER });
    expect(result).toMatchObject({ state: "in_progress", nextStep: "compatibility_writes" });
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("verifies every effect once the review is confirmed", () => {
    const result = verifyDexaContinuationRecoveryPostflight({
      facts: after({
        review: { version: 40, payload: confirmedReview() }, legacyRows: 1, eventBriefings: 1, dexaAnalyses: 1, goalEvaluations: 1,
        appointment: { version: 6, status: "completed", active: false, scheduledDate: "2026-10-09", completedByEvidenceId: CANONICAL_ID, completionsForScan: 1 },
      }),
      seal, ownerUserId: OWNER,
    });
    expect(result.state).toBe("complete");
    expect(result.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "legacy_row_single", "appointment_completed_once", "dexa_event_briefing_single", "healthkit_receipts_unchanged", "canonical_commit_not_replayed",
    ]));
  });

  it("flags duplicated effects after confirmation", () => {
    const result = verifyDexaContinuationRecoveryPostflight({
      facts: after({
        review: { version: 40, payload: confirmedReview() }, legacyRows: 2, eventBriefings: 1, dexaAnalyses: 1, goalEvaluations: 1,
        appointment: { version: 6, status: "completed", active: false, scheduledDate: "2026-10-09", completedByEvidenceId: CANONICAL_ID, completionsForScan: 1 },
      }),
      seal, ownerUserId: OWNER,
    });
    expect(result.state).toBe("complete_with_discrepancies");
    expect(result.checks.find((check) => check.name === "legacy_row_single").ok).toBe(false);
  });

  it("reports a failed resume", () => {
    const result = verifyDexaContinuationRecoveryPostflight({
      facts: after({ review: { version: 30, payload: review({ status: "partially_committed" }) } }), seal, ownerUserId: OWNER,
    });
    expect(result.state).toBe("failed");
  });
});
