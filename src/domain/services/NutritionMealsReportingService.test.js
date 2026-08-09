import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createNutritionMealsPageModel,
  getNutritionMealsReport,
} from "./NutritionMealsReportingService";
import {
  aggregateNutritionMealWeeks,
  createMealDistribution,
  createMealMacroMix,
  createMealTrend,
  createRecurringMeals,
  filterNutritionMealsReport,
} from "./NutritionMealsPresentationService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Nutrition Meals reporting", () => {
  it("uses canonical contexts and the Meals production path", async () => {
    const [fallback, invalid, visible, all] = await Promise.all([
      getNutritionMealsReport({ currentDate: new Date("2026-07-24T12:00:00Z") }),
      getNutritionMealsReport({ context: "invalid", currentDate: new Date("2026-07-24T12:00:00Z") }),
      getNutritionMealsReport({ context: "visible-abs", currentDate: new Date("2026-07-24T12:00:00Z") }),
      getNutritionMealsReport({ context: "all", currentDate: new Date("2026-07-24T12:00:00Z") }),
    ]);
    expect(fallback.timeline.contextId).toBe("build-lean-mass");
    expect(invalid.timeline.contextId).toBe("build-lean-mass");
    expect(fallback.timeline.currentPath).toBe("/progress/nutrition/reporting/meals");
    expect(visible.days.every((day) => day.date >= "2026-05-24" && day.date <= "2026-07-18")).toBe(true);
    expect(all.days.length).toBeGreaterThan(fallback.days.length);
  }, 60000);

  it("preserves meal order and authoritative meal totals without summing foods", () => {
    const model = fixture([
      day("one", "2026-07-19", [
        meal("b", "Breakfast", 440, { foods: [{ name: "Food", nutrients: { calories: 1 } }] }),
        meal("l", "Lunch", 700),
      ]),
    ]);
    expect(model.days[0].meals.map((item) => item.slot)).toEqual(["breakfast", "lunch"]);
    expect(model.days[0].meals[0]).toMatchObject({
      totals: { calories: 440 },
      href: "/progress/nutrition/day/one",
    });
  });

  it("calculates unnormalized average calories by occurrence and preserves missing slots", () => {
    const distribution = createMealDistribution([
      canonicalMeal("breakfast", 400),
      canonicalMeal("breakfast", 600),
      canonicalMeal("dinner", 900),
    ]);
    expect(distribution).toEqual([
      expect.objectContaining({ slot: "breakfast", averageCalories: 500, occurrenceCount: 2 }),
      expect.objectContaining({ slot: "lunch", averageCalories: null, occurrenceCount: 0 }),
      expect.objectContaining({ slot: "dinner", averageCalories: 900, occurrenceCount: 1 }),
      expect.objectContaining({ slot: "snacks", averageCalories: null, occurrenceCount: 0 }),
    ]);
  });

  it("calculates selected-slot macro mix using 4/4/9 and excludes missing macros", () => {
    const mix = createMealMacroMix([
      canonicalMeal("dinner", 900, 100, 100, 100),
      canonicalMeal("breakfast", 400, 999, 999, 999),
      canonicalMeal("dinner", 700, null, null, null),
    ], "dinner");
    expect(mix.items.map((item) => item.percentage)).toEqual([24, 23, 53]);
    expect(mix.items.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
    expect(createMealMacroMix([canonicalMeal("lunch", 700)], "lunch").available).toBe(false);
  });

  it("aggregates Sunday-Saturday and divides metrics by contributing meal occurrences", () => {
    const weeks = aggregateNutritionMealWeeks([
      canonicalDay("2026-07-19", [canonicalMeal("breakfast", 400), canonicalMeal("dinner", 800)]),
      canonicalDay("2026-07-21", [canonicalMeal("dinner", 1000)]),
    ]);
    expect(weeks[0]).toMatchObject({
      weekStart: "2026-07-19",
      weekEnd: "2026-07-25",
      mealCount: 3,
      loggedDayCount: 2,
      slots: {
        breakfast: { averageCalories: 400, occurrenceCount: 1 },
        dinner: { averageCalories: 900, occurrenceCount: 2 },
      },
    });
    expect(createMealTrend(weeks, "dinner", "mealCount")[0].value).toBe(2);
    expect(createMealTrend(weeks, "dinner", "calories")[0].value).toBe(900);
  });

  it("groups only exact repeated food signatures and never loosely similar meals", () => {
    const exact = { ...canonicalMeal("breakfast", 440), signature: "blueberries|whey|yogurt", foodNames: ["Blueberries", "Whey", "Yogurt"], date: "2026-07-21", href: "/day/1" };
    const recurring = createRecurringMeals([
      exact,
      { ...exact, id: "two", date: "2026-07-23", href: "/day/2" },
      { ...exact, id: "three", signature: "banana|whey|yogurt", foodNames: ["Banana", "Whey", "Yogurt"] },
    ]);
    expect(recurring).toHaveLength(1);
    expect(recurring[0]).toMatchObject({ occurrenceCount: 2, lastEaten: "2026-07-23" });
  });

  it.each(["1m", "3m", "6m", "1y", "all"])("keeps %s inside the Evidence Context", (rangeId) => {
    const view = filterNutritionMealsReport(fixture([
      day("outside", "2026-07-18", [meal("a", "Breakfast", 400)]),
      day("inside", "2026-07-19", [meal("b", "Dinner", 800)]),
    ], { startDate: "2026-07-19", endDate: "2026-07-24" }), { rangeId });
    expect(view.days.map((item) => item.date)).toEqual(["2026-07-19"]);
    expect(view.summary).toMatchObject({
      averageMealsPerLoggedDay: 1,
      mostCommonSlot: "dinner",
      averageCaloriesPerMeal: 800,
      loggedDays: 1,
    });
  });

  it("does not mutate runtime state", async () => {
    const before = fileHash(storePath);
    await getNutritionMealsReport({ context: "all", currentDate: new Date("2026-07-24T12:00:00Z") });
    expect(fileHash(storePath)).toBe(before);
  }, 30000);
});

function fixture(days, window = {}) {
  return createNutritionMealsPageModel({
    report: { nutritionDays: days, dataSources: [] },
    timeline: { contextId: "build-lean-mass", startDate: window.startDate ?? null, endDate: window.endDate ?? null, options: [] },
  });
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function day(id, date, meals) { return { id, date, href: `/progress/nutrition/day/${id}`, meals, sourceEvidence: [] }; }
function meal(id, name, calories, extras = {}) { return { id, name, totals: { calories, protein_g: extras.protein ?? null, carbs_g: extras.carbs ?? null, fat_g: extras.fat ?? null }, foods: extras.foods ?? [] }; }
function canonicalDay(date, meals) { return { id: date, date, meals }; }
function canonicalMeal(slot, calories, protein = null, carbohydrates = null, fat = null) {
  return { id: `${slot}-${calories}`, slot, totals: { calories, protein_g: protein, carbs_g: carbohydrates, fat_g: fat }, foodNames: [], signature: null };
}
