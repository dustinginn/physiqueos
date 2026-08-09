import { describe, expect, it } from "vitest";
import {
  createHistoricalRmrIndex,
  getCanonicalLocalDate,
  reconcileEnergyDays,
  resolveHistoricalRmr,
} from "./EnergyDailyReconciliationService";

describe("EnergyDailyReconciliationService", () => {
  it("joins Nutrition, Activity, and historically applicable DEXA RMR", () => {
    const nutritionDays = [
      {
        id: "nutrition-1",
        date: "2026-07-23",
        totals: { calories: 2321 },
        meals: [{ totals: { calories: 1 } }],
      },
    ];
    const activityDays = [
      {
        id: "activity-1",
        date: "2026-07-23",
        activeCalories: 897,
        totalCalories: 2987,
      },
    ];
    const result = reconcileEnergyDays({
      activityDays,
      nutritionDays,
      dexaScans: [
        {
          id: "dexa-1",
          measuredAt: "2026-07-18",
          restingMetabolicRate: { value: 1794 },
        },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({
        date: "2026-07-23",
        calorieIntake: 2321,
        activeCalories: 897,
        rmr: 1794,
        rmrScanId: "dexa-1",
        rmrScanDate: "2026-07-18",
        estimatedExpenditure: 2691,
        expenditureKind: "estimated_rmr_plus_active",
        energyBalance: -370,
        completeness: "complete",
      }),
    ]);
    expect(nutritionDays[0].totals.calories).toBe(2321);
    expect(activityDays[0].activeCalories).toBe(897);
  });

  it("normalizes timestamps to Los Angeles local dates", () => {
    expect(getCanonicalLocalDate("2026-07-24T01:30:00Z")).toBe("2026-07-23");
    expect(getCanonicalLocalDate("2026-07-23T18:30:00-07:00")).toBe(
      "2026-07-23"
    );
  });

  it("ignores Apple total calories and never uses active calories without RMR", () => {
    const [row] = reconcileEnergyDays({
      nutritionDays: [
        { id: "nutrition-1", date: "2026-07-23", totals: { calories: 2200 } },
      ],
      activityDays: [
        {
          id: "activity-1",
          date: "2026-07-23",
          activeCalories: 700,
          totalCalories: 9999,
        },
      ],
    });

    expect(row).toMatchObject({
      activeCalories: 700,
      estimatedExpenditure: null,
      energyBalance: null,
      expenditureKind: "unavailable",
      completeness: "missing-rmr",
    });
    expect(row).not.toHaveProperty("totalExpenditure");
  });

  it("uses only the latest explicit Nutrition revision for a date", () => {
    const [row] = reconcileEnergyDays({
      nutritionDays: [
        { id: "old", date: "2026-07-23", totals: { calories: 2200 },
          _canonicalNutritionRevision: { revision: 1 } },
        { id: "current", date: "2026-07-23", totals: { calories: 2450 },
          _canonicalNutritionRevision: { revision: 2 } },
      ],
    });

    expect(row.nutritionDayId).toBe("current");
    expect(row.calorieIntake).toBe(2450);
  });

  it.each([
    [
      "nutrition-only",
      [{ id: "n", date: "2026-07-20", totals: { calories: 2000 } }],
      [],
    ],
    [
      "activity-only",
      [],
      [{ id: "a", date: "2026-07-20", activeCalories: 500 }],
    ],
    [
      "missing-rmr",
      [{ id: "n", date: "2026-07-20", totals: { calories: 2000 } }],
      [{ id: "a", date: "2026-07-20", activeCalories: 500 }],
    ],
  ])("resolves %s without fabricating balance", (state, nutritionDays, activityDays) => {
    const [row] = reconcileEnergyDays({ activityDays, nutritionDays });
    expect(row.completeness).toBe(state);
    expect(row.energyBalance).toBeNull();
  });

  it("selects the latest valid RMR on or before each date without applying future scans backward", () => {
    const history = createHistoricalRmrIndex([
      {
        id: "early",
        measuredAt: "2026-06-20",
        restingMetabolicRate: { value: 1783 },
      },
      {
        id: "same-day-old",
        measuredAt: "2026-07-18",
        restingMetabolicRate: { value: 1790 },
        updatedAt: "2026-07-18T10:00:00Z",
      },
      {
        id: "same-day-authoritative",
        measuredAt: "2026-07-18",
        restingMetabolicRate: { value: 1794 },
        updatedAt: "2026-07-18T12:00:00Z",
      },
      {
        id: "future",
        measuredAt: "2026-08-01",
        restingMetabolicRate: { value: 1810 },
      },
    ]);

    expect(resolveHistoricalRmr(history, "2026-06-19")).toBeNull();
    expect(resolveHistoricalRmr(history, "2026-06-20")).toMatchObject({
      scanId: "early",
      rmr: 1783,
    });
    expect(resolveHistoricalRmr(history, "2026-07-18")).toMatchObject({
      scanId: "same-day-authoritative",
      rmr: 1794,
    });
    expect(resolveHistoricalRmr(history, "2026-07-31")).toMatchObject({
      scanId: "same-day-authoritative",
      rmr: 1794,
    });
    expect(resolveHistoricalRmr(history, "2026-08-01")).toMatchObject({
      scanId: "future",
      rmr: 1810,
    });
  });
});
