import { describe, expect, it, vi } from "vitest";
import { planHistoricalEvidenceReviewRetirement, runHistoricalEvidenceReviewRetirement } from "./HistoricalEvidenceReviewRetirement.js";

const authorization = Object.freeze({
  authorizationReference: "founder-test",
  ownerUserId: "owner",
  targetReviewMd5: "a".repeat(32),
  expectedVersion: 19,
  expectedUpdatedAt: "2026-09-14T17:01:32.232Z",
  expectedPayloadUpdatedAt: "2026-09-14T17:01:32.232Z",
  expectedPayloadSha256: "review-sha",
  expectedCompletedSteps: ["analysis", "canonical_commit", "compatibility_writes", "scheduled_completion"],
  expectedCanonicalWorkoutSha256: "workout-sha",
  expectedExerciseCount: 4,
  expectedSetCount: 16,
  expectedPerformanceEventCount: 5,
  expectedPerformanceEventPayloadSha256: ["1", "2", "3", "4", "5"],
  expectedSessionHistorySha256: "history-sha",
  expectedAggregateSeals: {
    goals: { count: 1, digest: "g" }, briefings: { count: 2, digest: "b" }, training: { count: 3, digest: "t" },
  },
});

function facts(overrides = {}) {
  const review = {
    id: "private-id", userId: "owner", version: 19, status: "committing",
    updatedAt: authorization.expectedUpdatedAt, commitError: null,
    commitClaim: { status: "available", operationId: "old" },
    commitProgress: Object.fromEntries(authorization.expectedCompletedSteps.map((step) => [step, { status: "completed" }])),
  };
  return {
    reviewRow: { reviewSeal: authorization.targetReviewMd5, version: 19, status: "committing", updatedAt: authorization.expectedUpdatedAt, payload: review },
    reviewPayloadSha256: authorization.expectedPayloadSha256,
    liveContinuationCount: 0,
    deadContinuationCount: 1,
    preservation: {
      canonicalSingleton: true, semanticMatch: true, detailsComplete: true,
      canonicalWorkoutSha256: "workout-sha", exerciseCount: 4, setCount: 16,
      performanceSemanticsMatch: true, performanceEventCount: 5,
      performanceEventPayloadSha256: ["5", "4", "3", "2", "1"],
      sessionHistoryContainsTarget: true, sessionHistoryCount: 5, sessionHistorySha256: "history-sha",
    },
    aggregateSeals: structuredClone(authorization.expectedAggregateSeals),
    ...overrides,
  };
}

describe("historical evidence review retirement", () => {
  it("retires only the confirmation and embeds a reversible audit anchor", () => {
    const input = facts();
    const result = planHistoricalEvidenceReviewRetirement({ facts: input, authorization, retiredAt: "2026-10-10T18:00:00.000Z" });
    expect(result.outcome).toBe("retire");
    expect(result.payload).toMatchObject({
      version: 20, status: "retired", updatedAt: "2026-10-10T18:00:00.000Z",
      commitClaim: { status: "failed", operationId: "old", retirementReason: "historical_confirmation_safely_retired" },
      processingReliability: {
        state: "operator_retired",
        rollbackAnchor: { priorVersion: 19, priorStatus: "committing", priorCommitClaim: { status: "available", operationId: "old" } },
      },
    });
    expect(result.payload.commitProgress).toEqual(input.reviewRow.payload.commitProgress);
  });

  it.each([
    ["live continuation", { liveContinuationCount: 1 }, "LIVE_CONTINUATION_PRESENT"],
    ["workout mismatch", { preservation: { ...facts().preservation, semanticMatch: false } }, "CANONICAL_WORKOUT_NOT_PRESERVED"],
    ["performance mismatch", { preservation: { ...facts().preservation, performanceSemanticsMatch: false } }, "PERFORMANCE_EVENT_PROOF_FAILED"],
    ["goal drift", { aggregateSeals: { ...facts().aggregateSeals, goals: { count: 1, digest: "changed" } } }, "PROTECTED_AGGREGATE_SEAL_MISMATCH"],
  ])("refuses %s", (_label, override, code) => {
    expect(planHistoricalEvidenceReviewRetirement({ facts: facts(override), authorization, retiredAt: new Date() }))
      .toMatchObject({ outcome: "refused", code });
  });

  it("uses one row-version, timestamp, status, payload and identity-fenced update", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ version: 20, status: "retired" }] });
    const input = facts();
    const result = await runHistoricalEvidenceReviewRetirement({
      query,
      authorization,
      apply: true,
      now: () => new Date("2026-10-10T18:00:00.000Z"),
      loadFacts: vi.fn().mockResolvedValue(input),
    });
    expect(result).toMatchObject({ mode: "apply", outcome: "applied", rowsChanged: 1 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("md5(record_id)=$3");
    expect(query.mock.calls[0][0]).toContain("version=$7");
    expect(query.mock.calls[0][0]).toContain("updated_at >= $8::timestamptz");
    expect(query.mock.calls[0][0]).toContain("updated_at < ($8::timestamptz + interval '1 millisecond')");
    expect(query.mock.calls[0][0]).toContain("payload=$9::jsonb");
    expect(query.mock.calls[0][1].slice(0, 3)).toEqual(["owner", "evidenceReviews", authorization.targetReviewMd5]);
  });
});
