import { describe, expect, it, vi } from "vitest";
import { createPostgresEvidenceProcessingReliabilityStore } from "./PostgresEvidenceProcessingReliabilityStore.js";

describe("PostgreSQL evidence processing reliability inspection", () => {
  it("returns bounded owner-scoped review, queue and heartbeat ages", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        record_id: "review-1",
        updated_at: "2026-10-10T11:55:00.000Z",
        payload: {
          status: "committing",
          updatedAt: "2026-10-10T11:55:00.000Z",
          commitClaim: { status: "available", leaseExpiresAt: "2026-10-10T11:55:00.000Z" },
        },
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: "message-1", review_id: "review-1", status: "dead", attempt_count: 8,
        created_at: "2026-10-10T11:56:00.000Z",
      }] })
      .mockResolvedValueOnce({ rows: [{
        worker_id: "worker", build_id: "build", status: "healthy",
        observed_at: "2026-10-10T11:59:30.000Z",
      }] });
    const pool = { query, connect: vi.fn() };
    const store = createPostgresEvidenceProcessingReliabilityStore({
      pool,
      ownerUserId: "owner",
      authorityStore: {},
    });
    const inspection = await store.inspect({ observedAt: new Date("2026-10-10T12:00:00.000Z") });
    expect(inspection.reviews[0]).toMatchObject({
      reviewId: "review-1",
      reviewAgeMs: 300_000,
      liveContinuationCount: 0,
      deadContinuationCount: 1,
      maximumAttemptCount: 8,
    });
    expect(inspection.heartbeat).toMatchObject({ workerId: "worker", ageMs: 30_000 });
    expect(query.mock.calls[0][1]).toEqual(["owner", 64]);
    expect(query.mock.calls[1][1][0]).toBe("owner");
  });
});
