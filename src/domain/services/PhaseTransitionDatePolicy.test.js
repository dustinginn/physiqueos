import { describe, expect, it } from "vitest";
import {
  PhaseTransitionDatePolicy,
  resolvePhaseTransitionDate,
} from "./PhaseTransitionDatePolicy";

describe("Phase transition date policy", () => {
  it("uses the evidence-review milestone as the semantic activation boundary", () => {
    expect(resolvePhaseTransitionDate({
      policy: PhaseTransitionDatePolicy.REVIEW_MILESTONE_BOUNDARY,
      reviewMilestoneDate: "2026-08-15",
    })).toEqual({
      policy: "review_milestone_boundary",
      effectiveDate: "2026-08-15",
      rule: "review_milestone_boundary",
    });
  });

  it("fails closed for a missing date or unsupported policy", () => {
    expect(() => resolvePhaseTransitionDate({ reviewMilestoneDate: null })).toThrow(/required/);
    expect(() => resolvePhaseTransitionDate({
      policy: "next_full_execution_day",
      reviewMilestoneDate: "2026-08-15",
    })).toThrow(/Unsupported/);
  });
});
