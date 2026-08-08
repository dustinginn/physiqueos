import { describe, expect, it } from "vitest";
import {
  CanonicalGoalPhaseStatus,
  PhaseReviewState,
  createCanonicalGoalPhase,
  resolveCanonicalPhaseReviewState,
} from "./canonicalGoalPhase";

const base = {
  id: "phase-1", goalId: "goal", name: "Establish Maintenance",
  purpose: "Establish maintenance before a controlled surplus.", order: 0,
  status: "active", startDate: "2026-07-19", timingMode: "completion_criteria",
  plannedReviewAt: "2026-08-15", completionDecisionRequired: true,
};

describe("canonical Goal phase", () => {
  it("keeps committed lifecycle status independent from calendar time", () => {
    const phase = createCanonicalGoalPhase(base);
    expect(phase).toMatchObject({
      phaseId: "phase-1", canonicalName: "Establish Maintenance",
      startedAt: "2026-07-19", plannedReviewAt: "2026-08-15",
      status: CanonicalGoalPhaseStatus.ACTIVE,
      reviewState: PhaseReviewState.SCHEDULED,
      completedAt: null, extensionCount: 0, revision: 0,
    });
    expect(resolveCanonicalPhaseReviewState(phase, { asOf: "2026-08-14" })).toBe("scheduled");
    expect(resolveCanonicalPhaseReviewState(phase, { asOf: "2026-08-15" })).toBe("due");
    expect(phase.status).toBe("active");
    expect(phase.completedAt).toBeNull();
  });

  it("adapts legacy upcoming and fixed-duration fields without mutating input", () => {
    const legacy = { ...base, id: "phase-2", order: 1, status: "upcoming",
      startDate: "2026-08-15", timingMode: "fixed_duration",
      duration: { value: 2, unit: "weeks" }, plannedReviewAt: undefined };
    const phase = createCanonicalGoalPhase(legacy);
    expect(phase).toMatchObject({ status: "planned", startedAt: "2026-08-15", plannedReviewAt: "2026-08-29" });
    expect(legacy.status).toBe("upcoming");
  });
});
