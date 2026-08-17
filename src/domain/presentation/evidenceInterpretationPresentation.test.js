import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { describeWeightAndEnergyInterpretation } from "./evidenceInterpretationPresentation";

describe("evidenceInterpretationPresentation", () => {
  it("says it's too early when the phase just started, without fabricating a trend", () => {
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: [{ measuredAt: "2026-08-15", weight: { value: 165.3, unit: "lb" } }],
      phaseStartDate: "2026-08-15",
      currentDate: new Date("2026-08-16T12:00:00Z"),
      caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
      activityExpenditureTarget: { value: 800, unit: "kcal/day" },
      goalDirection: "increase",
    });
    expect(result).toMatch(/still early in this phase/i);
    expect(result).toMatch(/next DEXA/i);
    expect(result).toMatch(/2,500 kcal\/day intake/);
    expect(result).not.toMatch(/trending (up|down)/i);
  });

  it("says it's too early when there isn't a phase start date at all", () => {
    const result = describeWeightAndEnergyInterpretation({ weightEntries: [], phaseStartDate: null });
    expect(result).toMatch(/still early/i);
  });

  it("never uses pre-phase weight entries to claim a post-phase trend", () => {
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: [
        { measuredAt: "2026-07-01", weight: { value: 150, unit: "lb" } },
        { measuredAt: "2026-07-15", weight: { value: 170, unit: "lb" } },
      ],
      phaseStartDate: "2026-08-15",
      currentDate: new Date("2026-08-23T12:00:00Z"),
    });
    expect(result).toMatch(/still early in this phase/i);
  });

  it("describes an upward trend consistent with an increasing-direction goal", () => {
    const entries = [
      { measuredAt: "2026-08-15", weight: { value: 165.3, unit: "lb" } },
      { measuredAt: "2026-08-17", weight: { value: 165.6, unit: "lb" } },
      { measuredAt: "2026-08-19", weight: { value: 165.9, unit: "lb" } },
      { measuredAt: "2026-08-21", weight: { value: 166.3, unit: "lb" } },
      { measuredAt: "2026-08-23", weight: { value: 166.7, unit: "lb" } },
    ];
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: entries, phaseStartDate: "2026-08-15", currentDate: new Date("2026-08-23T12:00:00Z"),
      goalDirection: "increase",
    });
    expect(result).toMatch(/trending up, consistent with the plan/i);
  });

  it("flags a trend moving against the plan's intended direction without editorializing", () => {
    const entries = [
      { measuredAt: "2026-08-15", weight: { value: 165.3, unit: "lb" } },
      { measuredAt: "2026-08-17", weight: { value: 165.6, unit: "lb" } },
      { measuredAt: "2026-08-19", weight: { value: 165.9, unit: "lb" } },
      { measuredAt: "2026-08-21", weight: { value: 166.3, unit: "lb" } },
      { measuredAt: "2026-08-23", weight: { value: 166.7, unit: "lb" } },
    ];
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: entries, phaseStartDate: "2026-08-15", currentDate: new Date("2026-08-23T12:00:00Z"),
      goalDirection: "decrease",
    });
    expect(result).toMatch(/trending up — worth watching/i);
  });

  it("describes a flat trend as flat", () => {
    const entries = [
      { measuredAt: "2026-08-15", weight: { value: 165.0, unit: "lb" } },
      { measuredAt: "2026-08-17", weight: { value: 165.1, unit: "lb" } },
      { measuredAt: "2026-08-19", weight: { value: 164.9, unit: "lb" } },
      { measuredAt: "2026-08-21", weight: { value: 165.0, unit: "lb" } },
    ];
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: entries, phaseStartDate: "2026-08-15", currentDate: new Date("2026-08-21T12:00:00Z"),
    });
    expect(result).toMatch(/stayed roughly flat/i);
  });

  it("omits the targets sentence when no targets are supplied, without crashing", () => {
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: [], phaseStartDate: null, caloricIntakeTarget: null, activityExpenditureTarget: null,
    });
    expect(result).not.toMatch(/kcal\/day/);
  });

  it("against the real production store: renders without throwing and is a non-empty string", () => {
    const store = JSON.parse(fs.readFileSync("private/founder/runtime-store.json", "utf8"));
    const result = describeWeightAndEnergyInterpretation({
      weightEntries: store.weightEntries ?? [],
      phaseStartDate: "2026-08-15",
      currentDate: new Date("2026-08-16T12:00:00Z"),
      caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
      activityExpenditureTarget: { value: 800, unit: "kcal/day" },
      goalDirection: "increase",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
