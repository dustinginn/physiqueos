import { describe, expect, it, vi } from "vitest";
import {
  createPostgresEvidenceProcessingReliabilityStore,
  resolveImmutableBuildAdoption,
} from "./PostgresEvidenceProcessingReliabilityStore.js";

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
      }] })
      .mockResolvedValueOnce({ rows: [
        { build_adopted_at: "2026-10-10T10:00:00.000Z" },
        { build_adopted_at: "2026-10-10T11:00:00.000Z" },
      ] });
    const pool = { query, connect: vi.fn() };
    const store = createPostgresEvidenceProcessingReliabilityStore({
      pool,
      ownerUserId: "owner",
      buildId: "build",
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
    expect(inspection.adoptionBoundary).toBe("2026-10-10T10:00:00.000Z");
    expect(inspection.adoptionBoundaryStatus).toBe("durable");
    expect(query.mock.calls[0][1]).toEqual(["owner", 64]);
    expect(query.mock.calls[1][1][0]).toBe("owner");
    expect(query.mock.calls[3][1]).toEqual(["build", 65]);
  });

  it("fails closed when any current-build watermark is missing, malformed, or unbounded", () => {
    expect(resolveImmutableBuildAdoption([])).toMatchObject({ boundary: null, status: "missing" });
    expect(resolveImmutableBuildAdoption([
      { build_adopted_at: "2026-10-10T10:00:00.000Z" },
      { build_adopted_at: null },
    ])).toMatchObject({ boundary: null, status: "invalid" });
    expect(resolveImmutableBuildAdoption([
      { build_adopted_at: "not-a-timestamp" },
    ])).toMatchObject({ boundary: null, status: "invalid" });
    expect(resolveImmutableBuildAdoption(Array.from({ length: 65 }, () => ({
      build_adopted_at: "2026-10-10T10:00:00.000Z",
    })))).toMatchObject({ boundary: null, status: "ambiguous", count: 65 });
  });

  it("normalizes the earliest valid immutable watermark across changed worker IDs", () => {
    expect(resolveImmutableBuildAdoption([
      { build_adopted_at: "2026-10-10T10:00:00+00:00" },
      { build_adopted_at: "2026-10-10T10:30:00.123456+00:00" },
    ])).toEqual({
      boundary: "2026-10-10T10:00:00.000Z",
      status: "durable",
      count: 2,
    });
  });
});
