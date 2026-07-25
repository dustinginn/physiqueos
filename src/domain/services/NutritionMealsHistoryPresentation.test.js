import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createMealHistoryGroups } from "./NutritionMealsPresentationService";

const screen = fs.readFileSync(
  new URL("../../screens/NutritionMealsReportScreen.jsx", import.meta.url),
  "utf8"
);
const appearance = fs.readFileSync(
  new URL("../../presentation/nutritionMealPresentation.js", import.meta.url),
  "utf8"
);

describe("Nutrition Meals grouped history presentation", () => {
  it("groups newest dates first and orders canonical meal slots within each day", () => {
    const groups = createMealHistoryGroups([
      day("2026-07-22", [
        meal("snacks", "Snacks", 300),
        meal("breakfast", "Breakfast", 440),
        meal("dinner", "Dinner", 800),
        meal("lunch", "Lunch", 700),
      ]),
      day("2026-07-23", [meal("dinner", "Dinner", 900)]),
    ]);

    expect(groups.map((group) => group.date)).toEqual(["2026-07-23", "2026-07-22"]);
    expect(groups[0].dateLabel).toBe("Jul 23, 2026");
    expect(groups[1].meals.map((item) => item.slot)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snacks",
    ]);
  });

  it("carries canonical day totals into the compact day-entry model", () => {
    const [group] = createMealHistoryGroups([{
      ...day("2026-07-23", [meal("dinner", "Dinner", 900)]),
      totals: {
        calories: 2321,
        protein_g: 198,
        carbs_g: 185,
        fat_g: 74,
      },
    }]);

    expect(group).toMatchObject({
      mealCount: 1,
      dailyCalories: 2321,
      dailyMacros: {
        protein: 198,
        carbohydrates: 185,
        fat: 74,
      },
      href: "/progress/nutrition/day/2026-07-23",
    });
  });

  it("does not create missing-slot rows and preserves unknown slots after canonical slots", () => {
    const [group] = createMealHistoryGroups([
      day("2026-07-23", [
        meal("late-meal", "Late Meal", 500),
        meal("snacks", "Snacks", 200),
        meal("breakfast", "Breakfast", 400),
        meal("custom", "Second Custom", 600),
      ]),
    ]);

    expect(group.meals.map((item) => item.slot)).toEqual([
      "breakfast",
      "snacks",
      "late-meal",
      "custom",
    ]);
    expect(group.meals).toHaveLength(4);
  });

  it("removes redundant labels while retaining meaningful distinct names and values", () => {
    const [group] = createMealHistoryGroups([
      day("2026-07-23", [
        meal("breakfast", "Breakfast", 440),
        meal("lunch", "Chicken Sandwich", 630, {
          protein_g: 67,
          carbs_g: 24,
          fat_g: 24,
          foodCount: 4,
        }),
      ]),
    ]);

    expect(group.meals[0]).toMatchObject({
      displayName: "Breakfast",
      showDistinctName: false,
      totals: { calories: 440 },
    });
    expect(group.meals[1]).toMatchObject({
      displayName: "Chicken Sandwich",
      showDistinctName: true,
      href: "/progress/nutrition/day/2026-07-23",
      totals: {
        calories: 630,
        protein_g: 67,
        carbs_g: 24,
        fat_g: 24,
      },
      foodCount: 4,
    });
  });

  it("uses compact day entries inline and one grouped renderer for day and full drawers", () => {
    const groupedRenderer = screen.slice(
      screen.indexOf("export function MealHistoryGroups"),
      screen.indexOf("function Empty")
    );
    expect(screen.match(/<MealHistoryGroups/g)).toHaveLength(2);
    expect(screen.match(/<MealHistoryDayEntries/g)).toHaveLength(1);
    expect(screen).toContain("view.historyGroups.slice(0, INLINE_LIMIT)");
    expect(screen).toContain("groups={view.historyGroups}");
    expect(screen).not.toContain("<MealRows");
    expect(groupedRenderer).not.toContain("longDate(meal.date)");
    expect(screen).toContain("href={meal.href}");
    expect(screen).toContain("setSelectedHistoryGroupId");
    expect(screen).toContain("selectedHistoryGroup ? [selectedHistoryGroup] : []");
    expect(screen).toContain("hideDateHeading");
    expect(screen).toContain("setSelectedHistoryGroupId(null)");
  });

  it("keeps responsive spacing, wrapping, tap targets, and semantic colors", () => {
    expect(screen).toContain("max-w-[393px]");
    expect(screen).toContain("overflow-x-hidden");
    expect(screen).toContain("min-h-11");
    expect(screen).toContain("min-h-14");
    expect(screen).toContain("w-full");
    expect(screen).toContain("break-words");
    expect(screen).toContain('groupIndex ? "mt-4');
    expect(screen).toContain('className="block min-h-11 px-4 py-2.5"');
    for (const variable of [
      "--meal-breakfast",
      "--meal-lunch",
      "--meal-dinner",
      "--meal-snacks",
    ]) {
      expect(appearance).toContain(variable);
    }
  });

  it("keeps the shared production drawer controls and scrolling contract unchanged", () => {
    const floatingSheet = fs.readFileSync(
      new URL("../../components/ui/FloatingSheet.jsx", import.meta.url),
      "utf8"
    );
    expect(floatingSheet).toContain("DialogPrimitive.Close");
    expect(floatingSheet).toContain("overflow-y-auto");
    expect(floatingSheet).toContain("overscroll-contain");
    expect(floatingSheet).toContain("max-h-[min(78dvh,42rem)]");
    expect(floatingSheet).toContain("safe-area-inset-bottom");
  });
});

function day(date, meals) {
  return {
    id: date,
    date,
    href: `/progress/nutrition/day/${date}`,
    meals: meals.map((item) => ({
      ...item,
      date,
      dayId: date,
      href: `/progress/nutrition/day/${date}`,
    })),
  };
}

function meal(slot, name, calories, extras = {}) {
  return {
    id: `${slot}-${name}`,
    slot,
    name,
    totals: {
      calories,
      protein_g: extras.protein_g ?? null,
      carbs_g: extras.carbs_g ?? null,
      fat_g: extras.fat_g ?? null,
    },
    foodCount: extras.foodCount,
  };
}
