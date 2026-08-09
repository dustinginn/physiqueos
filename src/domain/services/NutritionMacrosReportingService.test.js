import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  aggregateNutritionMacroWeeks,
  createNutritionMacrosPageModel,
  getNutritionMacrosReport,
} from "./NutritionMacrosReportingService";
import {
  createMacroDistribution,
  filterNutritionMacrosReport,
} from "./NutritionMacrosPresentationService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Nutrition Macros reporting", () => {
  it("uses canonical contexts and the Macros production path", async () => {
    const [fallback, invalid, visible, all] = await Promise.all([
      getNutritionMacrosReport({ currentDate: new Date("2026-07-24T12:00:00Z") }),
      getNutritionMacrosReport({ context: "invalid", currentDate: new Date("2026-07-24T12:00:00Z") }),
      getNutritionMacrosReport({ context: "visible-abs", currentDate: new Date("2026-07-24T12:00:00Z") }),
      getNutritionMacrosReport({ context: "all", currentDate: new Date("2026-07-24T12:00:00Z") }),
    ]);

    expect(fallback.timeline.contextId).toBe("build-lean-mass");
    expect(invalid.timeline.contextId).toBe("build-lean-mass");
    expect(visible.days.every((day) => day.date >= "2026-05-24" && day.date <= "2026-07-18")).toBe(true);
    expect(all.days.length).toBeGreaterThan(fallback.days.length);
    expect(fallback.timeline.currentPath).toBe("/progress/nutrition/reporting/macros");
  }, 60000);

  it("uses authoritative daily macro totals and rejects invalid values", () => {
    const model = fixture([
      nutritionDay("one", "2026-07-19", { protein_g: 180, carbs_g: 200, fat_g: 70 }, {
        meals: [{ totals: { protein_g: 1, carbs_g: 2, fat_g: 3 } }],
      }),
      nutritionDay("two", "2026-07-20", { protein_g: -1, carbs_g: "bad", fat_g: 80 }),
    ]);

    expect(model.days[0]).toMatchObject({
      href: "/progress/nutrition/day/one",
      macros: { protein: 180, carbohydrates: 200, fat: 70 },
    });
    expect(model.days[1].macros).toEqual({
      protein: null,
      carbohydrates: null,
      fat: 80,
    });
  });

  it("aggregates Sunday through Saturday with per-macro logged-day divisors", () => {
    const weeks = aggregateNutritionMacroWeeks([
      macroDay("2026-07-18", 100, 200, 50),
      macroDay("2026-07-19", 180, 200, 70),
      macroDay("2026-07-21", 200, null, 90),
    ]);

    expect(weeks[1]).toMatchObject({
      weekStart: "2026-07-19",
      weekEnd: "2026-07-25",
      loggedDayCount: 2,
      macros: {
        protein: { average: 190, count: 2, minimum: 180, maximum: 200 },
        carbohydrates: { average: 200, count: 1 },
        fat: { average: 80, count: 2 },
      },
    });
  });

  it("calculates distribution from 4/4/9 calories and rounds the visible shares to 100", () => {
    const distribution = createMacroDistribution([
      macroDay("2026-07-19", 100, 100, 100),
    ]);

    expect(distribution.totalCalories).toBe(1700);
    expect(distribution.items.map((item) => item.percentage)).toEqual([24, 23, 53]);
    expect(distribution.items.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
  });

  it.each(["1m", "3m", "6m", "1y", "all"])(
    "keeps %s inside the selected Evidence Context and summarizes the selected macro",
    (rangeId) => {
      const view = filterNutritionMacrosReport(
        fixture([
          nutritionDay("outside", "2026-07-18", { protein_g: 50, carbs_g: 50, fat_g: 50 }),
          nutritionDay("low", "2026-07-19", { protein_g: 180, carbs_g: 200, fat_g: 70 }),
          nutritionDay("high", "2026-07-21", { protein_g: 200, carbs_g: 220, fat_g: 80 }),
        ], { startDate: "2026-07-19", endDate: "2026-07-24" }),
        { macroKey: "protein", rangeId }
      );

      expect(view.days.every((day) => day.date >= "2026-07-19")).toBe(true);
      expect(view.summary).toMatchObject({
        average: 190,
        loggedDays: 2,
        calendarDays: rangeId === "all" ? 6 : 3,
        lowestDay: { date: "2026-07-19", value: 180 },
        highestDay: { date: "2026-07-21", value: 200 },
      });
    }
  );

  it("keeps targets neutral, excludes energy interpretation, and does not mutate runtime", async () => {
    const before = fileHash(storePath);
    const report = await getNutritionMacrosReport({
      context: "all",
      currentDate: new Date("2026-07-24T12:00:00Z"),
    });

    expect(report.target).toEqual({
      available: false,
      label: "Targets unavailable for this period",
    });
    expect(JSON.stringify(report)).not.toMatch(/energyBalance|estimatedExpenditure|deficit|surplus|adherence/i);
    expect(fileHash(storePath)).toBe(before);
  }, 30000);
});

function fixture(days, window = {}) {
  return createNutritionMacrosPageModel({
    report: { nutritionDays: days, dataSources: [] },
    timeline: {
      contextId: "build-lean-mass",
      startDate: window.startDate ?? null,
      endDate: window.endDate ?? null,
      options: [],
    },
  });
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function nutritionDay(id, date, totals, extras = {}) {
  return {
    id,
    date,
    href: `/progress/nutrition/day/${id}`,
    meals: extras.meals ?? [],
    sourceEvidence: ["Screenshot"],
    totals,
  };
}

function macroDay(date, protein, carbohydrates, fat) {
  return {
    id: date,
    date,
    macros: { protein, carbohydrates, fat },
  };
}
