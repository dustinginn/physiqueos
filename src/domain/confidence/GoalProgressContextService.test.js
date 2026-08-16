import { describe, expect, it } from "vitest";
import { deriveCanonicalGoalProgress } from "./GoalProgressContextService";

describe("canonical Goal progress context", () => {
  it("binds an accepted transition baseline to canonical evidence and derives cumulative progress", () => {
    const result = deriveCanonicalGoalProgress({
      goal: goal(), canonicalStore: store(), activePhase: phase(),
      asOf: "2026-08-15T23:59:59.999Z",
    });
    expect(result).toMatchObject({
      status: "available", metric: "lean_mass", cumulativeProgress: 2,
      requiredProgress: 8, remainingGap: 6, progressFraction: 0.25,
      baseline: { sourceRef: "scan-baseline", observedOn: "2026-07-01",
        derivation: "accepted_goal_transition_opening_baseline" },
      current: { sourceRef: "scan-current", observedOn: "2026-08-15" },
      phase: { phaseId: "phase-build", cumulativeProgress: 2 },
    });
  });

  it("preserves unknown when the accepted Goal baseline is unavailable", () => {
    const input = store();
    input.goalTransitionDrafts = [];
    input.dexaScans = [scan("scan-current", "2026-08-15", 142)];
    const result = deriveCanonicalGoalProgress({ goal: goal(), canonicalStore: input,
      activePhase: phase(), asOf: "2026-08-15" });
    expect(result).toMatchObject({ status: "unavailable", cumulativeProgress: null,
      remainingGap: null, uncertainty: ["goal_baseline_unavailable"] });
  });

  it("supports explicit numeric Goal contracts without requiring DEXA", () => {
    const input = goal();
    input.target = { type: "numeric_absolute", metric: "performance_score",
      direction: "increase", targetValue: 100, unit: "points",
      baseline: { value: 60, observedOn: "2026-07-01", evidenceId: "test-one" },
      currentMeasurement: { value: 82, observedOn: "2026-08-01", evidenceId: "test-two" } };
    const result = deriveCanonicalGoalProgress({ goal: input, asOf: "2026-08-01" });
    expect(result).toMatchObject({ status: "available", cumulativeProgress: 22,
      requiredProgress: 40, remainingGap: 18, progressFraction: 0.55 });
  });

  it("does not fabricate numeric pace for a qualitative Goal", () => {
    const input = goal();
    input.target = { type: "qualitative", metric: "appearance",
      direction: "increase" };
    expect(deriveCanonicalGoalProgress({ goal: input })).toMatchObject({
      status: "unavailable", uncertainty: ["goal_is_not_quantitative"],
    });
  });

  it("does not coerce absent numeric values into zero", () => {
    const input = goal();
    input.target.targetValue = null;
    const canonicalStore = store();
    canonicalStore.dexaScans = [scan("scan-baseline", "2026-07-01", 140),
      scan("scan-empty", "2026-08-15", null)];
    const result = deriveCanonicalGoalProgress({ goal: input, canonicalStore,
      activePhase: phase(), asOf: "2026-08-15" });
    expect(result).toMatchObject({ status: "available", targetValue: null,
      current: { sourceRef: "scan-baseline", value: 140 }, cumulativeProgress: 0 });
  });
});

function goal() {
  return { id: "goal-generic", createdFromTransitionId: "transition-one",
    target: { type: "numeric_change", metric: "lean_mass", direction: "increase",
      amount: 8, unit: "lb" }, timeline: { startDate: "2026-07-01" } };
}
function phase() { return { id: "phase-build", name: "Build", status: "active",
  startDate: "2026-07-01" }; }
function scan(id, date, leanMass) { return { id, date,
  leanMass: { value: leanMass, unit: "lb" } }; }
function store() { return {
  goalTransitionDrafts: [{ id: "transition-one", consumed: true, superseded: false,
    openingBaseline: { date: "2026-07-01", leanMass: 140 } }],
  dexaScans: [scan("scan-baseline", "2026-07-01", 140),
    scan("scan-current", "2026-08-15", 142)],
}; }
