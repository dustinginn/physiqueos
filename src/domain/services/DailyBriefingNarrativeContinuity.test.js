import { describe, expect, it } from "vitest";
import { getTrainingPerformanceBriefingSignal } from "./DailyBriefingService";

const observation = {
  id: "performance|exercise|seated_cable_row",
  exercise: { name: "Seated Cable Row" },
  status: "improving",
  evidence_date_range: { end: "2026-07-10" },
  explanation_data: {
    pr_detection: {
      detected: true,
      prs: [{ type: "reps_at_load", value: 12, unit: "reps", load: 150 }],
    },
  },
};
const claimId = "training:performance|exercise|seated_cable_row:2026-07-10:reps_at_load:12:reps:150";

function createSignal(overrides = {}) {
  return getTrainingPerformanceBriefingSignal({
    briefingMemory: {},
    evidenceDate: "2026-07-13",
    primaryEvaluation: { confidence: 60, progress: 60 },
    report: { exerciseObservations: [observation], overallObservation: { explanation_data: { summary: {} } } },
    weightStats: { weekOverWeek: -1 },
    ...overrides,
  });
}

describe("Daily training claim continuity", () => {
  it("narrates a supported PR that has not been communicated", () => {
    const signal = createSignal();
    expect(signal.shouldMention).toBe(true);
    expect(signal.status).toBe("recent_pr");
    expect(signal.communicatedClaimIds).toEqual([claimId]);
  });

  it("does not reframe an already communicated rolling PR as a fresh improvement", () => {
    const signal = createSignal({ briefingMemory: { communicatedClaimIds: [claimId] } });
    expect(signal.shouldMention).toBe(false);
    expect(signal.status).toBe("insufficient_signal");
  });

  it("moves a repeatedly considered historical PR from background to retired", () => {
    const once = createSignal({ briefingMemory: { communicatedClaimIds: [claimId], claimHistory: [{ claimId }] } });
    const repeated = createSignal({ briefingMemory: { communicatedClaimIds: [claimId], claimHistory: [{ claimId }, { claimId }] } });
    expect(once.claimLifecycles[claimId]).toBe("background");
    expect(repeated.claimLifecycles[claimId]).toBe("retired");
    expect(once.shouldMention).toBe(false);
    expect(repeated.shouldMention).toBe(false);
  });

  it("allows genuinely new overload after an older PR", () => {
    const advanced = { ...observation, evidence_date_range: { end: "2026-07-14" }, explanation_data: { pr_detection: { detected: true, prs: [{ type: "reps_at_load", value: 13, unit: "reps", load: 150 }] } } };
    const signal = createSignal({ evidenceDate: "2026-07-14", briefingMemory: { communicatedClaimIds: [claimId], claimHistory: [{ claimId }, { claimId }] }, report: { exerciseObservations: [advanced], overallObservation: { explanation_data: { summary: {} } } } });
    expect(signal.shouldMention).toBe(true);
    expect(signal.status).toBe("recent_pr");
    expect(signal.communicatedClaimIds[0]).not.toBe(claimId);
  });

  it("allows a claim from the current evidence window", () => {
    const current = { ...observation, evidence_date_range: { end: "2026-07-13" } };
    const currentClaim = "training:performance|exercise|seated_cable_row:2026-07-13:reps_at_load:12:reps:150";
    const signal = createSignal({
      briefingMemory: { communicatedClaimIds: [currentClaim] },
      report: { exerciseObservations: [current], overallObservation: { explanation_data: { summary: {} } } },
    });
    expect(signal.shouldMention).toBe(true);
    expect(signal.communicatedClaimIds).toEqual([currentClaim]);
  });
});
