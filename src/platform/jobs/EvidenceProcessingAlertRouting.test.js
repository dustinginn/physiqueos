import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceProcessingAlertRouter,
  createEvidenceProcessingOperatorAlertHandler,
  readEvidenceProcessingAlertRoutingConfig,
} from "./EvidenceProcessingAlertRouting.js";

describe("EvidenceProcessingAlertRouting", () => {
  it("is inert by default and rejects unsafe destinations when explicitly enabled", () => {
    expect(readEvidenceProcessingAlertRoutingConfig({})).toBeNull();
    expect(() => readEvidenceProcessingAlertRoutingConfig({
      PHYSIQUEOS_EVIDENCE_ALERT_ROUTING_ENABLED: "1",
      PHYSIQUEOS_EVIDENCE_ALERT_WEBHOOK_URL: "http://operator.example.test/alerts",
    })).toThrow();
  });

  it("redacts identities and free text before durable reconciliation", async () => {
    const reconcile = vi.fn().mockResolvedValue({ enqueued: 1 });
    const router = createEvidenceProcessingAlertRouter({ store: { reconcile } });
    await router.observe({
      codes: ["EVIDENCE_REVIEW_STALE", "EVIDENCE_REVIEW_STALE"],
      observedAt: new Date("2026-10-10T20:00:00.000Z"),
      metrics: { staleReviewCount: 2, rssFraction: 0.72, workerId: "secret-worker", reviewId: "secret-review" },
    });
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({
      codes: ["EVIDENCE_REVIEW_STALE"],
      metrics: { staleReviewCount: 2, rssFraction: 0.72 },
    }));
  });

  it("delivers a redacted durable payload with an idempotency key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const handler = createEvidenceProcessingOperatorAlertHandler({
      config: { destination: "https://operator.example.test/alerts", authorization: "token", timeoutMs: 1_000 },
      fetchImpl,
    });
    await handler({ messageId: "message-1", payload: { code: "EVIDENCE_REVIEW_STALE" } });
    expect(fetchImpl).toHaveBeenCalledWith("https://operator.example.test/alerts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "idempotency-key": "message-1" }),
    }));
  });

  it("turns delivery rejection into a retryable worker error", async () => {
    const handler = createEvidenceProcessingOperatorAlertHandler({
      config: { destination: "https://operator.example.test/alerts", authorization: null, timeoutMs: 1_000 },
      fetchImpl: vi.fn().mockResolvedValue({ ok: false }),
    });
    await expect(handler({ messageId: "message-2", payload: {} }))
      .rejects.toMatchObject({ code: "EVIDENCE_ALERT_DELIVERY_REJECTED" });
  });
});
