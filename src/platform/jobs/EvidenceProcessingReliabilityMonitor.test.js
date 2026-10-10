import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceProcessingReliabilityMonitor,
  isAdoptedForAutomaticRecovery,
  isStranded,
  resolveAdoptionBoundary,
} from "./EvidenceProcessingReliabilityMonitor.js";

const now = new Date("2026-10-10T12:00:00.000Z");

describe("evidence processing reliability monitor", () => {
  it("routes a healthy observation so prior alerts can resolve", async () => {
    const observe = vi.fn().mockResolvedValue(undefined);
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: {
        inspect: async () => ({ reviews: [], heartbeat: { ageMs: 1, workerId: "worker" }, adoptionBoundary: "2026-10-10T00:00:00.000Z", adoptionBoundaryStatus: "durable" }),
        recover: vi.fn(),
      },
      logger: { info: vi.fn(), error: vi.fn() }, workerId: "worker", buildId: "build",
      now: () => new Date("2026-10-10T20:00:00.000Z"), processStartedAt: new Date("2026-10-10T19:00:00.000Z"),
      sampleMemory: () => ({ rss: 100 }), sampleCpu: () => 0, serviceLimitBytes: 1_000,
      alertRouter: { observe },
    });
    await monitor.runOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ codes: [] }));
  });
  it("classifies expired claims and missing continuations as stranded", () => {
    expect(isStranded({ status: "committing", claimStatus: "in_progress", claimLeaseExpiresAt: "2026-10-10T11:59:00Z", reviewAgeMs: 180_000 }, now)).toBe(true);
    expect(isStranded({ status: "committing", claimStatus: "available", liveContinuationCount: 0, reviewAgeMs: 180_000 }, now)).toBe(true);
    expect(isStranded({ status: "committing", claimStatus: "available", liveContinuationCount: 1, reviewAgeMs: 180_000 }, now)).toBe(false);
  });

  it("adopts only work that transitioned at or after the deployment boundary", () => {
    const boundary = new Date("2026-10-10T11:00:00Z");
    expect(isAdoptedForAutomaticRecovery({ updatedAt: "2026-10-10T10:59:59.999Z" }, boundary)).toBe(false);
    expect(isAdoptedForAutomaticRecovery({ updatedAt: "2026-10-10T11:00:00.000Z" }, boundary)).toBe(true);
    expect(isAdoptedForAutomaticRecovery({ updatedAt: "invalid" }, boundary)).toBe(false);
  });

  it("keeps post-deployment work adopted across a worker restart", async () => {
    const persistedBoundary = "2026-10-10T10:00:00.000Z";
    const restartedAt = new Date("2026-10-10T11:00:00.000Z");
    expect(resolveAdoptionBoundary({ persistedBuildBoundary: persistedBoundary, processStartedAt: restartedAt }).toISOString())
      .toBe(persistedBoundary);
    expect(resolveAdoptionBoundary({ persistedBuildBoundary: null, processStartedAt: restartedAt }).toISOString())
      .toBe(restartedAt.toISOString());

    const recover = vi.fn().mockResolvedValue({
      status: "committing",
      commitClaim: { status: "available" },
      processingReliability: { autoResumeCount: 1 },
    });
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: {
        inspect: vi.fn().mockResolvedValue({
          adoptionBoundary: persistedBoundary,
          adoptionBoundaryStatus: "durable",
          reviews: [{
            reviewId: "created-before-restart",
            status: "committing",
            claimStatus: "available",
            liveContinuationCount: 0,
            deadContinuationCount: 1,
            reviewAgeMs: 30 * 60_000,
            queueAgeMs: null,
            updatedAt: "2026-10-10T10:30:00.000Z",
          }],
          heartbeat: { workerId: "new-worker", ageMs: 1_000 },
        }),
        recover,
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      workerId: "new-worker",
      buildId: "same-build",
      now: () => now,
      processStartedAt: restartedAt,
      sampleMemory: () => ({ rss: 100 * 1024 * 1024 }),
      sampleCpu: () => 1,
    });

    await monitor.runOnce();

    expect(recover).toHaveBeenCalledWith("created-before-restart", expect.objectContaining({ maximumAutoResumes: 2 }));
  });

  it("emits bounded metrics and resumes at most one stranded review per tick", async () => {
    const recover = vi.fn().mockResolvedValue({ status: "committing", commitClaim: { status: "available" }, processingReliability: { autoResumeCount: 1 } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: {
        inspect: vi.fn().mockResolvedValue({
          adoptionBoundaryStatus: "durable",
          reviews: [
            { reviewId: "r1", status: "committing", claimStatus: "available", liveContinuationCount: 0, deadContinuationCount: 1, reviewAgeMs: 180_000, queueAgeMs: null, updatedAt: "2026-10-10T11:57:00Z" },
            { reviewId: "r2", status: "committing", claimStatus: "available", liveContinuationCount: 0, deadContinuationCount: 0, reviewAgeMs: 180_000, queueAgeMs: null, updatedAt: "2026-10-10T11:57:00Z" },
          ],
          heartbeat: { workerId: "old", ageMs: 100_000 },
        }),
        recover,
      },
      logger,
      workerId: "worker",
      buildId: "build",
      now: () => now,
      processStartedAt: new Date("2026-10-10T11:00:00Z"),
      sampleMemory: () => ({ rss: 800 * 1024 * 1024 }),
      sampleCpu: () => 90,
    });
    const result = await monitor.runOnce();
    expect(recover).toHaveBeenCalledTimes(1);
    expect(result.alerts).toEqual(expect.arrayContaining([
      "EVIDENCE_REVIEW_STALE", "EVIDENCE_CONTINUATION_DEAD",
      "EVIDENCE_WORKER_HEARTBEAT_STALE", "EVIDENCE_PROCESS_RSS_HIGH", "EVIDENCE_PROCESS_CPU_HIGH",
    ]));
    expect(logger.info).toHaveBeenCalledWith("evidence.processing.reliability", expect.objectContaining({ staleReviewCount: 2 }));
  });

  it("alerts on pre-existing stranded work without recovering or reviving it", async () => {
    const recover = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: {
        inspect: vi.fn().mockResolvedValue({
          adoptionBoundaryStatus: "durable",
          reviews: [{
            reviewId: "historical", status: "committing", claimStatus: "available",
            liveContinuationCount: 0, deadContinuationCount: 1,
            reviewAgeMs: 30 * 24 * 60 * 60_000, queueAgeMs: null,
            updatedAt: "2026-09-14T17:01:32.232Z",
          }],
          heartbeat: { workerId: "worker", ageMs: 1_000 },
        }),
        recover,
      },
      logger,
      workerId: "worker",
      buildId: "build",
      now: () => now,
      processStartedAt: new Date("2026-10-10T11:00:00Z"),
      sampleMemory: () => ({ rss: 100 * 1024 * 1024 }),
      sampleCpu: () => 1,
    });

    const result = await monitor.runOnce();

    expect(recover).not.toHaveBeenCalled();
    expect(result.recovery).toBeNull();
    expect(result.alerts).toContain("EVIDENCE_REVIEW_STALE");
    expect(logger.info).toHaveBeenCalledWith("evidence.processing.reliability", expect.objectContaining({
      staleReviewCount: 1,
      adoptedStaleReviewCount: 0,
      historicalStaleReviewCount: 1,
    }));
  });

  it("fails closed and alerts when the durable watermark is invalid", async () => {
    const recover = vi.fn();
    const processStartedAt = new Date("2026-10-10T11:00:00.000Z");
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: {
        inspect: vi.fn().mockResolvedValue({
          adoptionBoundary: null,
          adoptionBoundaryStatus: "invalid",
          reviews: [{
            reviewId: "before-current-process", status: "committing", claimStatus: "available",
            liveContinuationCount: 0, deadContinuationCount: 0,
            reviewAgeMs: 30 * 60_000, queueAgeMs: null,
            updatedAt: "2026-10-10T10:30:00.000Z",
          }],
          heartbeat: { workerId: "worker", ageMs: 1_000 },
        }),
        recover,
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      workerId: "worker",
      buildId: "build",
      now: () => now,
      processStartedAt,
      sampleMemory: () => ({ rss: 100 * 1024 * 1024 }),
      sampleCpu: () => 1,
    });

    const result = await monitor.runOnce();

    expect(result.alerts).toContain("EVIDENCE_ADOPTION_BOUNDARY_UNAVAILABLE");
    expect(result.metrics).toMatchObject({
      adoptionBoundary: processStartedAt.toISOString(),
      adoptionBoundaryStatus: "invalid",
      adoptionBoundaryDurable: false,
      historicalStaleReviewCount: 1,
      adoptedStaleReviewCount: 0,
    });
    expect(recover).not.toHaveBeenCalled();
  });
});
