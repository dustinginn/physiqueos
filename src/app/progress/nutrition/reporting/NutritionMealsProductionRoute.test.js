import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(new URL("./[reportId]/page.js", import.meta.url), "utf8");
const screen = fs.readFileSync(new URL("../../../../screens/NutritionMealsReportScreen.jsx", import.meta.url), "utf8");

describe("Nutrition Meals production route", () => {
  it("dispatches Meals and preserves the Calories, Macros, and placeholder branches", () => {
    expect(route).toContain('reportId === "meals"');
    expect(route).toContain("getNutritionMealsReport");
    expect(route).toContain("<NutritionMealsReportScreen");
    expect(route).toContain('reportId === "calories"');
    expect(route).toContain('reportId === "macros"');
    expect(route).toContain("<NutritionKnowledgeScreen");
  });

  it("contains the factual section order, mobile shell, drawers, and canonical links", () => {
    const titles = ["Period Summary", "Meal Distribution", "Meal Macro Mix", "Meal Trends Over Time", "Weekly Meal Summary", "Recurring Meals", "Recent Meal History"];
    let previous = -1;
    titles.forEach((title) => {
      const current = screen.indexOf(title);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    });
    expect(screen).toContain("max-w-[393px]");
    expect(screen).toContain("overflow-x-hidden");
    expect(screen.match(/<FloatingSheet/g)).toHaveLength(4);
    expect(screen).toContain("href={meal.href}");
  });

  it("does not introduce coaching, persistence, or future Meal Memory features", () => {
    expect(screen).not.toMatch(/healthy|unhealthy|ideal|optimize|recommendation|saved meals|meal templates|voice|quick logging/i);
  });
});
