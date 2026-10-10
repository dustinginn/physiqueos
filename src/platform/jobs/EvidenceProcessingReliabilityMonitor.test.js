import { describe, expect, it, vi } from "vitest";
import { createEvidenceProcessingReliabilityMonitor, isStranded } from "./EvidenceProcessingReliabilityMonitor.js";

const now = new Date("2026-10-10T12:00:00.000Z");

describe("evidence processing reliability monitor", () => {
  it("classifies expired claims and missing continuations as stranded", () => {
    expect(isStranded({ status: "committing", claimStatus: "in_progress", claimLeaseExpiresAt: "2026-10-10T11:59:00Z", reviewAgeMs: 180_000 }, now)).toBe(true);
    expect(isStranded({ status: "committing", claimStatus: "available", liveContinuationCount: 0, reviewAgeMs: 180_000 }, now)).toBe(true);
    expect(isStranded({ status: "committing", claimStatus: "available", liveContinuationCount: 1, reviewAgeMs: 180_000 }, now)).toBe(false);
  });

  it("emits bounded metrics and resumes at most one stranded review per tick", async () => {
    const recover = vi.fn().mockResolvedValue({ status: "committing", commitClaim: { status: "available" }, processingReliability: { autoResumeCount: 1 } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const monitor = createEvidenceProcessingReliabilityMonitor({
      store: {
        inspect: vi.fn().mockResolvedValue({
          reviews: [
            { reviewId: "r1", status: "committing", claimStatus: "available", liveContinuationCount: 0, deadContinuationCount: 1, reviewAgeMs: 180_000, queueAgeMs: null },
            { reviewId: "r2", status: "committing", claimStatus: "available", liveContinuationCount: 0, deadContinuationCount: 0, reviewAgeMs: 180_000, queueAgeMs: null },
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
});
