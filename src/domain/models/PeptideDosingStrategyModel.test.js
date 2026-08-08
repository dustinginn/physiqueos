import { describe, expect, it } from "vitest";
import {
  formatDosingStrategyPreview,
  generatePeptideDosingTimeline,
  hydratePeptideDosingStrategy,
} from "./PeptideDosingStrategyModel";

describe("peptide dosing strategy", () => {
  it("generates a stay-at-dose phase with an open final state", () => {
    expect(generatePeptideDosingTimeline(base({ pattern: "stay" }))).toEqual([
      phase("2026-05-21", null, "0.5"),
    ]);
  });

  it("generates deterministic titrate-up and titrate-down dates", () => {
    expect(generatePeptideDosingTimeline(base({ pattern: "titrate_up", targetDose: "1.5" }))).toEqual([
      phase("2026-05-21", "2026-05-27", "0.5"),
      phase("2026-05-28", "2026-06-03", "1"),
      phase("2026-06-04", null, "1.5"),
    ]);
    expect(generatePeptideDosingTimeline(base({ pattern: "titrate_down", startingDose: { amount: "1.5", unit: "mg" }, targetDose: "0.5" }))).toEqual([
      phase("2026-05-21", "2026-05-27", "1.5"),
      phase("2026-05-28", "2026-06-03", "1"),
      phase("2026-06-04", null, "0.5"),
    ]);
  });

  it("generates the Retatrutide-style up, hold, and down plan", () => {
    const timeline = generatePeptideDosingTimeline(base({
      pattern: "up_hold_down",
      targetDose: "2",
      holdDuration: 6,
      decreaseAmount: "0.5",
      decreaseInterval: 1,
      decreaseUnit: "weeks",
      landingDose: "0.5",
    }));
    expect(timeline).toHaveLength(7);
    expect(timeline[3]).toMatchObject({ startDate: "2026-06-11", endDate: "2026-07-22", dose: { amount: "2" } });
    expect(timeline.at(-1)).toEqual(phase("2026-08-06", null, "0.5"));
    expect(formatDosingStrategyPreview(base({ pattern: "up_hold_down", targetDose: "2", holdDuration: 6, decreaseAmount: "0.5", landingDose: "0.5" })).at(-1)).toContain("Continue until changed");
  });

  it("rehydrates generated data and fails legacy manual data safely", () => {
    const strategy = base({ pattern: "titrate_up", targetDose: "1.5" });
    const timeline = generatePeptideDosingTimeline(strategy);
    expect(hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline }).mode).toBe("structured");
    expect(hydratePeptideDosingStrategy({ timeline: [phase("2026-05-21", "2026-05-27", "0.5"), phase("2026-06-01", null, "0.8")] })).toMatchObject({
      mode: "legacy_custom",
      strategy: { pattern: "custom" },
    });
  });
});

function base(overrides = {}) {
  return {
    pattern: "stay",
    startingDose: { amount: "0.5", unit: "mg" },
    startDate: "2026-05-21",
    stepAmount: "0.5",
    stepInterval: 1,
    stepUnit: "weeks",
    targetDose: "0.5",
    holdDuration: 1,
    holdUnit: "weeks",
    decreaseAmount: "0.5",
    decreaseInterval: 1,
    decreaseUnit: "weeks",
    landingDose: "0.5",
    endDate: null,
    ...overrides,
  };
}
function phase(startDate, endDate, amount) { return { startDate, endDate, dose: { amount, unit: "mg" }, notes: "" }; }
