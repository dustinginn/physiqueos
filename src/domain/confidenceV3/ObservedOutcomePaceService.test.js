import { describe, expect, test } from "vitest";
import { evaluateObservedOutcomePace, PaceState } from "./ObservedOutcomePaceService.js";

describe("evaluateObservedOutcomePace — the real Founder fixture", () => {
  test("+5.0 lb over 28 days, ~49 days remaining, ~5 lb gap => ahead, positive projected offset", () => {
    const result = evaluateObservedOutcomePace({
      observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 153.3, currentObservedOn: "2026-09-12" },
      direction: "increase",
      remainingGoalGap: 5.0,
      remainingDays: 49,
    });
    expect(result.paceState).toBe(PaceState.AHEAD);
    expect(result.paceRatio > 1.5).toBeTruthy();
    expect(result.projectedCompletionOffsetDays > 0).toBeTruthy();
  });
});

describe("recent pace predicts each qualitative outcome", () => {
  const interval = { priorValue: 0, priorObservedOn: "2026-08-01", currentValue: 2, currentObservedOn: "2026-08-29" }; // 28 days, +2

  test("early completion", () => {
    // observed = 2/28 ≈ 0.0714/day; required = 2/50 = 0.04/day => ratio ≈ 1.79 (>= 1.5 "ahead" threshold)
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 2, remainingDays: 50 });
    expect(result.paceState).toBe(PaceState.AHEAD);
  });
  test("on-time completion", () => {
    // required = 2/28 ≈ 0.0714/day; observed = 2/28 = 0.0714/day => ratio = 1.0 (within [0.85, 1.5))
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 2, remainingDays: 28 });
    expect(result.paceState).toBe(PaceState.ON_PACE);
  });
  test("late completion", () => {
    // observed ≈ 0.0714/day; required = 4/28 = 0.1429/day => ratio = 0.5 (within [0.4, 0.85) "behind")
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 4, remainingDays: 28 });
    expect(result.paceState).toBe(PaceState.BEHIND);
  });
  test("interval too short is unassessable, never a fabricated bucket", () => {
    const shortInterval = { priorValue: 0, priorObservedOn: "2026-09-10", currentValue: 1, currentObservedOn: "2026-09-12" };
    const result = evaluateObservedOutcomePace({ observedInterval: shortInterval, remainingGoalGap: 2, remainingDays: 28 });
    expect(result.paceState).toBe(PaceState.UNASSESSABLE);
    expect(result.paceRatio).toBe(null);
    expect(result.observedOutcomePace).toBe(null);
  });
  test("no observed interval at all is unassessable", () => {
    const result = evaluateObservedOutcomePace({ observedInterval: null, remainingGoalGap: 2, remainingDays: 28 });
    expect(result.paceState).toBe(PaceState.UNASSESSABLE);
  });
  test("goal already nearly/fully complete reads as ahead regardless of pace math", () => {
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 0, remainingDays: 10 });
    expect(result.paceState).toBe(PaceState.AHEAD);
  });
  test("deadline very near with only adequate pace can still read as behind", () => {
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 5, remainingDays: 5 });
    // required = 5/5 = 1.0/day, observed = 2/28 ≈ 0.0714/day — far behind
    expect(result.paceState).toBe(PaceState.STALLED);
  });
});

describe("deadline-optional capability", () => {
  const interval = { priorValue: 0, priorObservedOn: "2026-08-01", currentValue: 2, currentObservedOn: "2026-08-29" };
  test("no deadline: paceState is unassessable, never a fabricated 'ahead of nothing'", () => {
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 5, remainingDays: null });
    expect(result.paceState).toBe(PaceState.UNASSESSABLE);
    expect(result.paceRatio).toBe(null);
    expect(result.projectedCompletionOffsetDays).toBe(null);
    // The raw rate itself is still reported — it is a real, computable fact.
    expect(result.observedOutcomePace != null).toBeTruthy();
  });
});

describe("regression direction", () => {
  test("negative delta is regressing, never stalled or a positive bucket", () => {
    const interval = { priorValue: 10, priorObservedOn: "2026-08-01", currentValue: 8, currentObservedOn: "2026-08-29" };
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 5, remainingDays: 30 });
    expect(result.paceState).toBe(PaceState.REGRESSING);
  });
  test("zero delta is stalled", () => {
    const interval = { priorValue: 10, priorObservedOn: "2026-08-01", currentValue: 10, currentObservedOn: "2026-08-29" };
    const result = evaluateObservedOutcomePace({ observedInterval: interval, remainingGoalGap: 5, remainingDays: 30 });
    expect(result.paceState).toBe(PaceState.STALLED);
  });
});

describe("genericity", () => {
  test("no evidence-type-specific (e.g. DEXA) branch in source", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./ObservedOutcomePaceService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/dexa/i);
    expect(source).not.toMatch(/build[_ -]?lean[_ -]?mass/i);
  });
});
