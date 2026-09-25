import { describe, expect, it } from "vitest";
import {
  buildEvidenceSettlementWatermarkV1,
  decideBriefingPublishActionV1,
  DEFAULT_SETTLEMENT_POLICY,
  evaluateBriefingReadinessV1,
  recordDeviceCloseoutReceiptV1,
} from "./BriefingEvidenceSettlementPolicy.js";
import { resolveBriefingDueInstant } from "./BriefingScheduleAuthority.js";

const settledDomains = Object.freeze({
  activity: { present: true, coverage: "complete_day", canonicalRecordId: "act-1", revision: 3 },
  nutrition: { present: true, coverage: "complete_day", canonicalRecordId: "nut-1", revision: 2 },
});
const partialDomains = Object.freeze({
  activity: { present: true, coverage: "complete_day", canonicalRecordId: "act-1", revision: 3 },
  nutrition: { present: true, coverage: "partial_day", canonicalRecordId: "nut-1", revision: 1 },
});

describe("Briefing evidence settlement policy", () => {
  describe("readiness semantics (D1)", () => {
    it("is ready when every configured domain has settled as complete_day", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      expect(readiness.ready).toBe(true);
      expect(readiness.unsettledDomains).toEqual([]);
      expect(readiness.domains.activity.settled).toBe(true);
      expect(readiness.domains.nutrition.settled).toBe(true);
    });

    it("is not ready when a domain is only partial_day", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: partialDomains });
      expect(readiness.ready).toBe(false);
      expect(readiness.unsettledDomains).toEqual(["nutrition"]);
    });

    it("treats an entirely missing domain as unsettled, fail-closed", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: { activity: settledDomains.activity } });
      expect(readiness.ready).toBe(false);
      expect(readiness.unsettledDomains).toEqual(["nutrition"]);
      expect(readiness.domains.nutrition.coverage).toBe("missing");
    });

    it("never uses observed values to decide readiness — only coverage/canonical-state/revision metadata", () => {
      // Any observed-value-shaped fields on the state are simply ignored;
      // only `coverage` determines settlement.
      const readiness = evaluateBriefingReadinessV1({ domainStates: {
        activity: { present: true, coverage: "complete_day", observedCalories: 4000 },
        nutrition: { present: true, coverage: "complete_day", observedCalories: 1200 },
      } });
      expect(readiness.ready).toBe(true);
    });

    it("readiness domains exclude Training — its legitimate absence never blocks readiness", () => {
      expect(DEFAULT_SETTLEMENT_POLICY.readinessDomains).not.toContain("training");
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      expect(readiness.ready).toBe(true);
    });

    it("is extensible to a future Sleep domain via policy configuration alone, no function change", () => {
      const policyWithSleep = { ...DEFAULT_SETTLEMENT_POLICY,
        readinessDomains: [...DEFAULT_SETTLEMENT_POLICY.readinessDomains, "sleep"] };
      const readiness = evaluateBriefingReadinessV1({
        policy: policyWithSleep,
        domainStates: { ...settledDomains, sleep: { present: true, coverage: "complete_day" } },
      });
      expect(readiness.ready).toBe(true);
      expect(readiness.domains.sleep.settled).toBe(true);
    });
  });

  describe("device closeout contract (D2)", () => {
    it("records an uploaded closeout receipt", () => {
      const receipt = recordDeviceCloseoutReceiptV1({
        requestedAt: "2026-09-23T10:15:00.000Z", respondedAt: "2026-09-23T10:15:04.000Z", outcome: "uploaded",
      });
      expect(receipt).toMatchObject({ outcome: "uploaded" });
    });

    it("records that no device closeout was attempted, without requiring app-open", () => {
      const receipt = recordDeviceCloseoutReceiptV1({
        requestedAt: "2026-09-23T10:15:00.000Z", outcome: "not_attempted",
      });
      expect(receipt.outcome).toBe("not_attempted");
      expect(receipt.respondedAt).toBeNull();
    });

    it("rejects an unrecognized outcome", () => {
      expect(() => recordDeviceCloseoutReceiptV1({ requestedAt: "2026-09-23T10:15:00.000Z", outcome: "bogus" }))
        .toThrow();
    });
  });

  describe("earliest publish + hard deadline (D3)", () => {
    const earliestPublishAt = resolveBriefingDueInstant({
      localDate: "2026-09-23", timeZone: "America/Los_Angeles",
    }).toISOString();

    it("waits before the earliest publish time even if evidence is already ready", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      const decision = decideBriefingPublishActionV1({
        earliestPublishAt, now: "2026-09-23T05:00:00.000Z", readiness,
      });
      expect(decision.action).toBe("wait");
      expect(decision.reasonCode).toBe("before_earliest_publish_time");
    });

    it("generates at/after the earliest publish time once readiness is satisfied", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      const decision = decideBriefingPublishActionV1({
        earliestPublishAt, now: earliestPublishAt, readiness,
      });
      expect(decision.action).toBe("generate");
      expect(decision.reasonCode).toBe("readiness_satisfied");
      expect(decision.unsettledDomains).toEqual([]);
    });

    it("retries (does not generate) when past earliest publish time but not yet ready and not at the deadline", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: partialDomains });
      const now = new Date(new Date(earliestPublishAt).valueOf() + 60 * 60_000).toISOString();
      const decision = decideBriefingPublishActionV1({ earliestPublishAt, now, readiness });
      expect(decision.action).toBe("retry");
      expect(decision.reasonCode).toBe("awaiting_settlement");
      expect(decision.unsettledDomains).toEqual(["nutrition"]);
      expect(new Date(decision.nextCheckAt).valueOf()).toBeGreaterThan(new Date(now).valueOf());
    });

    it("generates at the hard deadline with unsettled domains explicitly recorded, even though not ready", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: partialDomains });
      const atDeadline = new Date(new Date(earliestPublishAt).valueOf() +
        DEFAULT_SETTLEMENT_POLICY.maximumWaitMinutes * 60_000).toISOString();
      const decision = decideBriefingPublishActionV1({ earliestPublishAt, now: atDeadline, readiness });
      expect(decision.action).toBe("generate");
      expect(decision.reasonCode).toBe("hard_deadline_reached");
      expect(decision.unsettledDomains).toEqual(["nutrition"]);
    });

    it("never generates before the deadline just because a long time has passed, without readiness or deadline", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: partialDomains });
      const justBeforeDeadline = new Date(new Date(earliestPublishAt).valueOf() +
        DEFAULT_SETTLEMENT_POLICY.maximumWaitMinutes * 60_000 - 60_000).toISOString();
      const decision = decideBriefingPublishActionV1({ earliestPublishAt, now: justBeforeDeadline, readiness });
      expect(decision.action).toBe("retry");
    });
  });

  describe("freeze/watermark (D4)", () => {
    it("freezes evidence window, domain settlement state, and the publish decision together", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      const publishDecision = { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [] };
      const watermark = buildEvidenceSettlementWatermarkV1({
        evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-22", timeZone: "America/Los_Angeles", cutoff: "2026-09-23T06:59:59.999Z" },
        readiness, publishDecision, generatedAt: "2026-09-23T10:01:29.328Z",
      });
      expect(watermark.readyAtGeneration).toBe(true);
      expect(watermark.unsettledDomainsAtGeneration).toEqual([]);
      expect(watermark.domains.activity.canonicalRecordId).toBe("act-1");
      expect(watermark.evidenceWindow.startDate).toBe("2026-09-20");
      expect(watermark.generatedAt).toBe("2026-09-23T10:01:29.328Z");
    });

    it("records unsettled domains at generation when the hard-deadline fallback was used", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: partialDomains });
      const publishDecision = { action: "generate", reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"] };
      const watermark = buildEvidenceSettlementWatermarkV1({
        evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-22", timeZone: "America/Los_Angeles" },
        readiness, publishDecision, generatedAt: "2026-09-23T14:01:00.000Z",
      });
      expect(watermark.readyAtGeneration).toBe(false);
      expect(watermark.unsettledDomainsAtGeneration).toEqual(["nutrition"]);
      expect(watermark.publishReasonCode).toBe("hard_deadline_reached");
    });

    it("is immutable — the returned watermark cannot be mutated after construction", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      const watermark = buildEvidenceSettlementWatermarkV1({
        evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-22" },
        readiness, publishDecision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [] },
        generatedAt: "2026-09-23T10:01:29.328Z",
      });
      expect(() => { watermark.publishReasonCode = "tampered"; }).toThrow();
    });

    it("is deeply immutable — a nested evidenceWindow field cannot be mutated either", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      const watermark = buildEvidenceSettlementWatermarkV1({
        evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-22",
          // A nested field, to prove the freeze isn't only shallow.
          notes: { source: "goal_contract" } },
        readiness, publishDecision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [] },
        generatedAt: "2026-09-23T10:01:29.328Z",
      });
      expect(() => { watermark.evidenceWindow.notes.source = "tampered"; }).toThrow();
    });

    it("records a device closeout receipt on the watermark when one occurred", () => {
      const readiness = evaluateBriefingReadinessV1({ domainStates: settledDomains });
      const receipt = recordDeviceCloseoutReceiptV1({
        requestedAt: "2026-09-23T09:50:00.000Z", respondedAt: "2026-09-23T09:50:03.000Z", outcome: "uploaded",
      });
      const watermark = buildEvidenceSettlementWatermarkV1({
        evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-22" },
        readiness, publishDecision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [] },
        closeoutReceipt: receipt, generatedAt: "2026-09-23T10:01:29.328Z",
      });
      expect(watermark.closeoutReceipt).toMatchObject({ outcome: "uploaded" });
    });
  });

  describe("cross-cadence / Monthly day-1 unchanged", () => {
    it("does not alter BriefingScheduleAuthority's Monthly day-1 default", () => {
      // This policy is additive and composes with the existing authority; it
      // never reads or overrides its cadence/day configuration.
      expect(DEFAULT_SETTLEMENT_POLICY).not.toHaveProperty("monthly");
      expect(DEFAULT_SETTLEMENT_POLICY).not.toHaveProperty("dayOfMonth");
    });
  });
});
