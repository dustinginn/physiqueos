import { describe, expect, it } from "vitest";
import { createBriefingCadenceSettlementGate } from "./BriefingCadenceSettlementGate.js";

function reader({ activeDomains = [], domainStates = {} } = {}) {
  const calls = { beginRun: 0, readSettlementCoverage: 0, args: [] };
  return {
    calls,
    beginRun() { calls.beginRun += 1; },
    async readSettlementCoverage(args) {
      calls.readSettlementCoverage += 1;
      calls.args.push(args);
      return { activeDomains, domainStates };
    },
  };
}

function coverage(domain, coverageState, overrides = {}) {
  return { present: true, coverage: coverageState, canonicalRecordId: `${domain}-rec`, revision: 1, ...overrides };
}

describe("Briefing cadence settlement gate", () => {
  it("generates immediately (bypasses the gate) when the owner has no HealthKit-backed readiness domains", async () => {
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader({ activeDomains: [] }) });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T10:00:00.000Z",
    });
    expect(result.action).toBe("generate");
    expect(result.reasonCode).toBe("no_healthkit_backed_domains_settlement_not_applicable");
    expect(result.readiness).toBeNull();
  });

  it("waits before the earliest publish time even when a HealthKit-backed domain is already settled", async () => {
    const gate = createBriefingCadenceSettlementGate({
      healthKitGraduationReader: reader({
        activeDomains: ["activity", "nutrition"],
        domainStates: { activity: coverage("activity", "complete_day"), nutrition: coverage("nutrition", "complete_day") },
      }),
    });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T05:00:00.000Z",
    });
    expect(result.action).toBe("wait");
  });

  it("retries (does not generate) when a HealthKit-backed domain has not settled and the deadline has not passed", async () => {
    const gate = createBriefingCadenceSettlementGate({
      healthKitGraduationReader: reader({
        activeDomains: ["activity", "nutrition"],
        domainStates: { activity: coverage("activity", "complete_day"), nutrition: coverage("nutrition", "partial_day") },
      }),
    });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T11:00:00.000Z",
    });
    expect(result.action).toBe("retry");
    expect(result.unsettledDomains).toEqual(["nutrition"]);
  });

  it("treats a domain the reader returns no state for as unsettled, fail-closed", async () => {
    const gate = createBriefingCadenceSettlementGate({
      healthKitGraduationReader: reader({
        activeDomains: ["activity", "nutrition"],
        domainStates: { activity: coverage("activity", "complete_day") },
      }),
    });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T11:00:00.000Z",
    });
    expect(result.unsettledDomains).toEqual(["nutrition"]);
  });

  it("generates once every HealthKit-backed readiness domain has settled as complete_day", async () => {
    const gate = createBriefingCadenceSettlementGate({
      healthKitGraduationReader: reader({
        activeDomains: ["activity", "nutrition"],
        domainStates: { activity: coverage("activity", "complete_day"), nutrition: coverage("nutrition", "complete_day") },
      }),
    });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T11:00:00.000Z",
    });
    expect(result.action).toBe("generate");
    expect(result.reasonCode).toBe("readiness_satisfied");
  });

  it("generates at the hard deadline with unsettled domains recorded, even though not ready", async () => {
    const gate = createBriefingCadenceSettlementGate({
      healthKitGraduationReader: reader({
        activeDomains: ["activity", "nutrition"],
        domainStates: { activity: coverage("activity", "complete_day"), nutrition: coverage("nutrition", "partial_day") },
      }),
    });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z",
      now: "2026-09-24T18:00:00.000Z", // earliestPublishAt + 480 min (8h)
    });
    expect(result.action).toBe("generate");
    expect(result.reasonCode).toBe("hard_deadline_reached");
    expect(result.unsettledDomains).toEqual(["nutrition"]);
  });

  it("begins a fresh reader run once per tick, and asks the reader for coverage per cadence evaluated", async () => {
    const backing = reader({
      activeDomains: ["activity", "nutrition"],
      domainStates: { activity: coverage("activity", "complete_day"), nutrition: coverage("nutrition", "complete_day") },
    });
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: backing });
    await gate.beginTick();
    await gate.evaluate({ finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T11:00:00.000Z" });
    await gate.evaluate({ finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T11:00:00.000Z" });
    expect(backing.calls.beginRun).toBe(1);
    expect(backing.calls.readSettlementCoverage).toBe(2);
    expect(backing.calls.args[0]).toMatchObject({ localDate: "2026-09-24" });
  });

  it("begins a new reader run on each subsequent tick", async () => {
    const backing = reader({ activeDomains: [] });
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: backing });
    await gate.beginTick();
    await gate.beginTick();
    expect(backing.calls.beginRun).toBe(2);
  });

  it("passes the policy's readiness domains through to the reader so it can restrict to evidence-eligibility scope itself", async () => {
    const backing = reader({ activeDomains: ["activity"], domainStates: { activity: coverage("activity", "complete_day") } });
    const gate = createBriefingCadenceSettlementGate({ healthKitGraduationReader: backing });
    await gate.beginTick();
    const result = await gate.evaluate({
      finalEvidenceDate: "2026-09-24", earliestPublishAt: "2026-09-24T10:00:00.000Z", now: "2026-09-24T11:00:00.000Z",
    });
    expect(backing.calls.args[0].domains).toEqual(["activity", "nutrition"]);
    // Nutrition was not in the reader's active-domain result, so its absence
    // must never block generation — only activity was ever in scope.
    expect(result.action).toBe("generate");
    expect(result.readiness.domains).not.toHaveProperty("nutrition");
  });

  it("throws at construction time without a HealthKit graduation reader", () => {
    expect(() => createBriefingCadenceSettlementGate({})).toThrow();
  });
});
