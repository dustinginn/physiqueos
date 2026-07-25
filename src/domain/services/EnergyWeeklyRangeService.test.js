import { describe, expect, it } from "vitest";
import {
  ENERGY_RANGE_OPTIONS,
  filterWeeklyEnergyByRange,
  getRecentFourWeeklyEnergy,
  reconcileSelectedWeekId,
} from "./EnergyWeeklyRangeService";

describe("EnergyWeeklyRangeService", () => {
  const weeks = [
    week("2026-07-19", "2026-07-25"),
    week("2026-06-28", "2026-07-04"),
    week("2026-04-19", "2026-04-25"),
    week("2026-01-18", "2026-01-24"),
    week("2025-07-20", "2025-07-26"),
    week("2025-06-29", "2025-07-05"),
  ];

  it("defaults to All and preserves every canonical weekly object", () => {
    expect(ENERGY_RANGE_OPTIONS.at(-1)).toMatchObject({
      id: "all",
      label: "All",
    });
    const result = filterWeeklyEnergyByRange(weeks);
    expect(result).toEqual(weeks);
    expect(result[0]).toBe(weeks[0]);
  });

  it.each([
    ["1m", ["2026-07-19", "2026-06-28"]],
    ["3m", ["2026-07-19", "2026-06-28", "2026-04-19"]],
    [
      "6m",
      ["2026-07-19", "2026-06-28", "2026-04-19", "2026-01-18"],
    ],
    [
      "1y",
      [
        "2026-07-19",
        "2026-06-28",
        "2026-04-19",
        "2026-01-18",
        "2025-07-20",
      ],
    ],
  ])("filters %s by calendar intersection", (rangeId, expectedStarts) => {
    expect(
      filterWeeklyEnergyByRange(weeks, rangeId, "2026-07-24").map(
        (item) => item.weekStart
      )
    ).toEqual(expectedStarts);
  });

  it("keeps filtering inside the supplied context collection", () => {
    const visibleAbs = weeks.slice(1, 3);
    expect(
      filterWeeklyEnergyByRange(visibleAbs, "1y", "2026-07-18")
    ).toEqual(visibleAbs);
  });

  it("returns the newest four without mutating chronological identity", () => {
    const result = getRecentFourWeeklyEnergy(weeks);
    expect(result.map((item) => item.weekStart)).toEqual([
      "2026-07-19",
      "2026-06-28",
      "2026-04-19",
      "2026-01-18",
    ]);
    expect(result[0]).toBe(weeks[0]);
  });

  it("preserves a visible selection and otherwise selects the newest week", () => {
    expect(reconcileSelectedWeekId(weeks, weeks[2].id)).toBe(weeks[2].id);
    expect(reconcileSelectedWeekId(weeks, "outside-context")).toBe(weeks[0].id);
    expect(reconcileSelectedWeekId([], weeks[0].id)).toBeNull();
  });
});

function week(weekStart, weekEnd) {
  return {
    id: `energy-week-${weekStart}`,
    weekStart,
    weekEnd,
    averageIntake: 2000,
    averageExpenditure: 2500,
    averageBalance: -500,
    completeDayCount: 4,
    evidenceDayCount: 5,
    partial: true,
  };
}
