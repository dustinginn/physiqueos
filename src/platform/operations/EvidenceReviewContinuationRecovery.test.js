import { describe, expect, it } from "vitest";
import {
  planEvidenceReviewContinuationRecovery,
  runEvidenceReviewContinuationRecovery,
} from "./EvidenceReviewContinuationRecovery.js";
import { BUILD46_PHOTO_CONTINUATION_RECOVERY_AUTHORIZATION as AUTH } from "./build46PhotoContinuationRecoveryAuthorization.js";

const NOW = new Date("2026-09-20T18:00:00.000Z");
const completed = (extra = {}) => ({ status: "completed", attempts: 1, ...extra });

function reviewRow(overrides = {}) {
  return {
    version: 34,
    payload: {
      id: AUTH.reviewId, userId: AUTH.ownerUserId, status: "partially_committed", createdAt: "2026-09-20T13:50:08.950Z",
      confirmation: null, intakeReceiptId: AUTH.intakeReceiptId,
      interpretedEvidence: { package_id: AUTH.packageId },
      commitProgress: {
        canonical_commit: completed(), compatibility_writes: completed({ attempts: 4 }), scheduled_completion: completed(),
        analysis: { status: "started", attempts: 6 },
      },
      commitClaim: { operationId: `evidence-review-background:${AUTH.messageId}`, status: "failed" },
      ...overrides,
    },
  };
}
const message = (overrides = {}) => ({
  id: AUTH.messageId, topic: "evidence.review.continue", status: "dead", attemptCount: 4,
  claimExpiresAt: null, lastErrorCode: "OUTBOX_ATTEMPTS_EXHAUSTED", reviewId: AUTH.reviewId, ...overrides,
});
const facts = (overrides = {}) => ({
  review: reviewRow(), messages: [message()],
  counts: { canonicalSessions: 1, canonicalPhotos: 5, priorityCompletions: 1, photoAnalyses: 0, eventBriefings: 0 },
  ...overrides,
});
const plan = (overrides) => planEvidenceReviewContinuationRecovery({ facts: facts(overrides), authorization: AUTH, now: NOW });

describe("evidence review continuation recovery plan", () => {
  it("resets exactly the spent message when every fact matches the authorization", () => {
    expect(plan()).toMatchObject({
      outcome: "reset_message", messageId: AUTH.messageId,
      before: { status: "dead", attemptCount: 4 }, after: { status: "pending", attemptCount: 0 },
      completedSteps: ["canonical_commit", "compatibility_writes", "scheduled_completion"],
    });
  });

  it("also recovers a message the crashed worker still holds once its lease has lapsed", () => {
    const result = plan({ messages: [message({ status: "processing", attemptCount: 30, claimExpiresAt: "2026-09-20T17:00:00.000Z" })] });
    expect(result).toMatchObject({ outcome: "reset_message", before: { status: "processing", attemptCount: 30 } });
  });

  it("refuses while a live worker holds the lease", () => {
    expect(plan({ messages: [message({ status: "processing", attemptCount: 2, claimExpiresAt: "2026-09-20T18:00:30.000Z" })] }))
      .toMatchObject({ outcome: "refused", code: "MESSAGE_LEASE_ACTIVE" });
  });

  it("is a no-op when the message already has a fresh budget", () => {
    expect(plan({ messages: [message({ status: "pending", attemptCount: 0 })] })).toMatchObject({ outcome: "already_armed" });
  });

  it("is a no-op once analysis has completed", () => {
    const review = reviewRow();
    review.payload.commitProgress.analysis = completed();
    review.payload.commitProgress.goal_evaluation = completed();
    expect(plan({ review })).toMatchObject({ outcome: "already_progressed" });
  });

  it.each([
    ["a different review", () => ({ review: reviewRow({ id: "other" }) }), "REVIEW_IDENTITY_MISMATCH"],
    ["a different owner", () => ({ review: reviewRow({ userId: "someone" }) }), "REVIEW_OWNER_MISMATCH"],
    ["a different package", () => ({ review: reviewRow({ interpretedEvidence: { package_id: "other" } }) }), "PACKAGE_IDENTITY_MISMATCH"],
    ["a different intake", () => ({ review: reviewRow({ intakeReceiptId: "other" }) }), "INTAKE_IDENTITY_MISMATCH"],
    ["a confirmed review", () => ({ review: reviewRow({ confirmation: { confirmedAt: "x" } }) }), "REVIEW_ALREADY_CONFIRMED"],
    ["an unexpected review status", () => ({ review: reviewRow({ status: "pending" }) }), "REVIEW_STATUS_UNEXPECTED"],
    ["a claim owned by another message", () => ({ review: reviewRow({ commitClaim: { operationId: "evidence-review-background:other", status: "failed" } }) }), "CLAIM_OPERATION_MISMATCH"],
    ["an available claim", () => ({ review: reviewRow({ commitClaim: { operationId: `evidence-review-background:${AUTH.messageId}`, status: "available" } }) }), "CLAIM_STATUS_UNEXPECTED"],
    ["no canonical session", () => ({ counts: { ...facts().counts, canonicalSessions: 0 } }), "CANONICAL_SESSION_NOT_SINGLETON"],
    ["a duplicated canonical session", () => ({ counts: { ...facts().counts, canonicalSessions: 2 } }), "CANONICAL_SESSION_NOT_SINGLETON"],
    ["four canonical photos", () => ({ counts: { ...facts().counts, canonicalPhotos: 4 } }), "CANONICAL_PHOTO_COUNT_UNEXPECTED"],
    ["no priority completion", () => ({ counts: { ...facts().counts, priorityCompletions: 0 } }), "PRIORITY_COMPLETION_NOT_SINGLETON"],
    ["a duplicated priority completion", () => ({ counts: { ...facts().counts, priorityCompletions: 2 } }), "PRIORITY_COMPLETION_NOT_SINGLETON"],
    ["analyses that already exist", () => ({ counts: { ...facts().counts, photoAnalyses: 1 } }), "ANALYSIS_ALREADY_EXISTS"],
    ["a Photo Event that already exists", () => ({ counts: { ...facts().counts, eventBriefings: 1 } }), "PHOTO_BRIEFING_ALREADY_EXISTS"],
    ["a missing message", () => ({ messages: [] }), "MESSAGE_MISSING"],
    ["another active continuation", () => ({ messages: [message(), message({ id: "other", status: "pending", attemptCount: 0 })] }), "OTHER_CONTINUATION_ACTIVE"],
    ["an already succeeded message", () => ({ messages: [message({ status: "succeeded" })] }), "MESSAGE_ALREADY_SUCCEEDED"],
  ])("refuses %s", (_name, build, code) => {
    expect(plan(build())).toMatchObject({ outcome: "refused", code });
  });

  it("refuses when the completed steps differ from the authorized set", () => {
    const review = reviewRow();
    delete review.payload.commitProgress.scheduled_completion;
    expect(plan({ review })).toMatchObject({ outcome: "refused", code: "COMPLETED_STEPS_UNEXPECTED" });
  });
});

function fakeQuery({ review = reviewRow(), messages = [message()], counts = facts().counts, updateRowCount = 1 } = {}) {
  const statements = [];
  const query = async (text, values) => {
    statements.push({ text, values });
    if (/collection_name='evidenceReviews'/.test(text)) return { rows: [review] };
    if (/FROM physiqueos.outbox_messages/.test(text) && /^\s*SELECT/.test(text)) {
      return { rows: messages.map((m) => ({ id: m.id, topic: m.topic, status: m.status, attempt_count: m.attemptCount, claim_expires_at: m.claimExpiresAt, last_error_code: m.lastErrorCode, review_id: m.reviewId })) };
    }
    if (/collection_name='canonicalEvidenceObjects'/.test(text) && /photo_session/.test(text)) return { rows: [{ n: counts.canonicalSessions }] };
    if (/collection_name='canonicalEvidenceObjects'/.test(text)) return { rows: [{ n: counts.canonicalPhotos }] };
    if (/collection_name='reminders'/.test(text)) return { rows: [{ n: counts.priorityCompletions }] };
    if (/collection_name='analyses'/.test(text)) return { rows: [{ n: counts.photoAnalyses }] };
    if (/collection_name='dailyBriefings'/.test(text)) return { rows: [{ n: counts.eventBriefings }] };
    if (/^\s*UPDATE physiqueos.outbox_messages/.test(text)) {
      return { rowCount: updateRowCount, rows: updateRowCount ? [{ id: AUTH.messageId, status: "pending", attempt_count: 0 }] : [] };
    }
    throw new Error(`Unexpected statement: ${text.slice(0, 80)}`);
  };
  return { query, statements };
}
const writes = (statements) => statements.filter((s) => /^\s*(UPDATE|INSERT|DELETE)/.test(s.text));

describe("evidence review continuation recovery runner", () => {
  it("dry-run reads only and reports the exact expected mutation", async () => {
    const { query, statements } = fakeQuery();
    const result = await runEvidenceReviewContinuationRecovery({ query, authorization: AUTH, apply: false, now: () => NOW });
    expect(result).toMatchObject({ mode: "dry-run", outcome: "reset_message" });
    expect(result.expectedMutation).toContain(`1 outbox row ${AUTH.messageId}`);
    expect(result.expectedMutation).toContain("no other row written");
    expect(writes(statements)).toEqual([]);
    for (const s of statements) expect(s.values[0]).toBe(AUTH.ownerUserId);
  });

  it("apply writes exactly one fenced outbox row and nothing else", async () => {
    const { query, statements } = fakeQuery();
    const result = await runEvidenceReviewContinuationRecovery({ query, authorization: AUTH, apply: true, now: () => NOW });
    expect(result).toMatchObject({ mode: "apply", outcome: "applied", rowsChanged: 1, after: { status: "pending", attemptCount: 0 } });
    const changes = writes(statements);
    expect(changes).toHaveLength(1);
    expect(changes[0].text).toContain("physiqueos.outbox_messages");
    // Fenced by id, owner, topic, observed status, and observed attempt count.
    expect(changes[0].values).toEqual([AUTH.messageId, AUTH.ownerUserId, "evidence.review.continue", "dead", NOW.toISOString(), 4]);
    // Locks the review's messages before deciding.
    expect(statements.some((s) => /FOR UPDATE/.test(s.text))).toBe(true);
  });

  it("apply refuses to act when the message changed after inspection", async () => {
    const { query } = fakeQuery({ updateRowCount: 0 });
    await expect(runEvidenceReviewContinuationRecovery({ query, authorization: AUTH, apply: true, now: () => NOW }))
      .rejects.toMatchObject({ code: "MESSAGE_CHANGED_AFTER_INSPECTION" });
  });

  it("apply writes nothing when any guard refuses", async () => {
    const { query, statements } = fakeQuery({ counts: { ...facts().counts, eventBriefings: 1 } });
    const result = await runEvidenceReviewContinuationRecovery({ query, authorization: AUTH, apply: true, now: () => NOW });
    expect(result).toMatchObject({ outcome: "refused", code: "PHOTO_BRIEFING_ALREADY_EXISTS" });
    expect(writes(statements)).toEqual([]);
  });

  it("a second apply after success is a no-op and never resets a message that is already armed", async () => {
    const { query, statements } = fakeQuery({ messages: [message({ status: "pending", attemptCount: 0 })] });
    const result = await runEvidenceReviewContinuationRecovery({ query, authorization: AUTH, apply: true, now: () => NOW });
    expect(result).toMatchObject({ outcome: "already_armed" });
    expect(writes(statements)).toEqual([]);
  });
});
