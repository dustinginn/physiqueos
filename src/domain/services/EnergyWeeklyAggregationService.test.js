import { describe, expect, it } from "vitest";
import {
  aggregateEnergyWeeks,
  getCanonicalWeekStart,
} from "./EnergyWeeklyAggregationService";

describe("EnergyWeeklyAggregationService", () => {
  it("uses the production Sunday week boundary", () => {
    expect(getCanonicalWeekStart("2026-07-19")).toBe("2026-07-19");
    expect(getCanonicalWeekStart("2026-07-25")).toBe("2026-07-19");
  });

  it("uses separate denominators and complete paired days for balance", () => {
    const [week] = aggregateEnergyWeeks({
      startDate: "2026-07-19",
      endDate: "2026-07-25",
      days: [
        row("2026-07-19", 2000, 2500),
        row("2026-07-20", 3000, null),
        row("2026-07-21", null, 1000),
      ],
    });

    expect(week).toMatchObject({
      averageIntake: 2500,
      intakeDayCount: 2,
      averageExpenditure: 1750,
      expenditureDayCount: 2,
      averageBalance: -500,
      completeDayCount: 1,
      evidenceDayCount: 3,
      partial: true,
    });
  });

  it("clips expected days at a goal boundary", () => {
    const [week] = aggregateEnergyWeeks({
      startDate: "2026-07-19",
      endDate: "2026-07-21",
      days: [
        row("2026-07-19", 2000, 2100),
        row("2026-07-20", 2000, 2100),
        row("2026-07-21", 2000, 2100),
      ],
    });
    expect(week.expectedDayCount).toBe(3);
    expect(week.partial).toBe(false);
  });
});

function row(date, calorieIntake, estimatedExpenditure) {
  return {
    date,
    calorieIntake,
    estimatedExpenditure,
    energyBalance:
      calorieIntake != null && estimatedExpenditure != null
        ? calorieIntake - estimatedExpenditure
        : null,
  };
}
