import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import {
  aggregateNutritionCalorieWeeks,
  createNutritionCaloriesPageModel,
  filterNutritionCaloriesReport,
  getNutritionCaloriesReport,
} from "./NutritionCaloriesReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Nutrition Calories reporting", () => {
  it("uses canonical Nutrition contexts and falls back safely", async () => {
    const [fallback, invalid, visible, all] = await Promise.all([
      getNutritionCaloriesReport({
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getNutritionCaloriesReport({
        context: "invalid",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getNutritionCaloriesReport({
        context: "visible-abs",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getNutritionCaloriesReport({
        context: "all",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
    ]);

    expect(fallback.timeline.contextId).toBe("build-lean-mass");
    expect(invalid.timeline.contextId).toBe("build-lean-mass");
    expect(fallback.period).toMatchObject({
      startDate: "2026-07-19",
      endDate: "2026-07-24",
    });
    expect(visible.period).toMatchObject({
      startDate: "2026-05-24",
      endDate: "2026-07-18",
    });
    expect(visible.days.every(
      (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
    )).toBe(true);
    expect(all.days.length).toBeGreaterThan(fallback.days.length);
    expect(all.days.length).toBeGreaterThan(visible.days.length);
    expect(fallback.timeline.currentPath).toBe(
      "/progress/nutrition/reporting/calories"
    );
  }, 60000);

  it("uses authoritative daily totals and canonical Nutrition Day links", () => {
    const model = fixtureModel([
      day("one", "2026-07-19", 2200, {
        meals: [{ totals: { calories: 999 } }],
      }),
    ]);

    expect(model.days).toEqual([
      expect.objectContaining({
        calories: 2200,
        href: "/progress/nutrition/day/one",
      }),
    ]);
    expect(JSON.stringify(model)).not.toMatch(
      /estimatedExpenditure|energyBalance|activeCalories/
    );
  });

  it("aggregates Sunday-through-Saturday by logged days, including partial weeks", () => {
    const weeks = aggregateNutritionCalorieWeeks([
      calorieDay("2026-07-18", 1800),
      calorieDay("2026-07-19", 2200),
      calorieDay("2026-07-21", 2400),
    ]);

    expect(weeks).toEqual([
      expect.objectContaining({
        weekStart: "2026-07-12",
        weekEnd: "2026-07-18",
        averageCalories: 1800,
        loggedDayCount: 1,
      }),
      expect.objectContaining({
        weekStart: "2026-07-19",
        weekEnd: "2026-07-25",
        averageCalories: 2300,
        loggedDayCount: 2,
      }),
    ]);
  });

  it.each(["1m", "3m", "6m", "1y", "all"])(
    "keeps %s inside the selected Evidence Context",
    (rangeId) => {
      const model = fixtureModel(
        [
          day("outside", "2026-07-18", 1900),
          day("first", "2026-07-19", 2200),
          day("latest", "2026-07-23", 2400),
        ],
        {
          startDate: "2026-07-19",
          endDate: "2026-07-24",
        }
      );
      const filtered = filterNutritionCaloriesReport(model, rangeId);

      expect(filtered.days.every((item) => item.date >= "2026-07-19")).toBe(true);
      expect(filtered.startDate.localeCompare("2026-07-19")).toBeGreaterThanOrEqual(0);
      expect(filtered.endDate.localeCompare("2026-07-24")).toBeLessThanOrEqual(0);
    }
  );

  it("derives range-specific summaries without treating missing dates as zero", () => {
    const filtered = filterNutritionCaloriesReport(
      fixtureModel(
        [
          day("low", "2026-07-19", 2100),
          day("high", "2026-07-21", 2500),
        ],
        {
          startDate: "2026-07-19",
          endDate: "2026-07-24",
        }
      ),
      "all"
    );

    expect(filtered.summary).toMatchObject({
      averageCalories: 2300,
      loggedDays: 2,
      calendarDays: 6,
      lowestDay: expect.objectContaining({ date: "2026-07-19", calories: 2100 }),
      highestDay: expect.objectContaining({ date: "2026-07-21", calories: 2500 }),
    });
  });

  it("returns calm null summaries and no zero weeks when evidence is absent", () => {
    const filtered = filterNutritionCaloriesReport(
      fixtureModel([], {
        startDate: "2026-07-19",
        endDate: "2026-07-24",
      }),
      "all"
    );

    expect(filtered.weeks).toEqual([]);
    expect(filtered.summary).toMatchObject({
      averageCalories: null,
      loggedDays: 0,
      lowestDay: null,
      highestDay: null,
    });
  });

  it("keeps target comparison unavailable and never applies current context backward", async () => {
    const report = await getNutritionCaloriesReport({
      context: "visible-abs",
      currentDate: new Date("2026-07-24T12:00:00Z"),
      repositories: FounderRepositories,
    });

    expect(report.target).toEqual({
      available: false,
      label: "Target unavailable for this period",
    });
    expect(JSON.stringify(report)).not.toMatch(
      /targetRange|differenceFromTarget|deficit|surplus|adherence/i
    );
  }, 30000);

  it("does not mutate the runtime store", async () => {
    const before = fs.readFileSync(storePath);
    await getNutritionCaloriesReport({
      context: "all",
      currentDate: new Date("2026-07-24T12:00:00Z"),
    });
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);
});

function fixtureModel(days, window = {}) {
  return createNutritionCaloriesPageModel({
    report: {
      nutritionDays: days,
      dataSources: [],
    },
    timeline: {
      contextId: "build-lean-mass",
      startDate: window.startDate ?? null,
      endDate: window.endDate ?? null,
      options: [],
    },
  });
}

function day(id, date, calories, extras = {}) {
  return {
    id,
    date,
    href: `/progress/nutrition/day/${id}`,
    meals: extras.meals ?? [],
    sourceEvidence: ["Screenshot"],
    totals: { calories },
  };
}

function calorieDay(date, calories) {
  return { id: date, date, calories };
}
