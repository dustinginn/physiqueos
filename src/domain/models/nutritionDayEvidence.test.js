import { describe, expect, it } from "vitest";
import {
  createNutritionDayEvidenceObject,
  reconcileNutritionDayEvidence,
  restoreCollapsedNutritionFoodDuplicates,
} from "./nutritionDayEvidence";

describe("NutritionDay evidence structure", () => {
  it("preserves repeated foods as distinct stable children", () => {
    const object = createNutritionDayEvidenceObject({
      id: "nutrition-day",
      date: "2026-07-17",
      meals: [{
        id: "dinner",
        name: "Dinner",
        foods: [
          { name: "Chicken", nutrients: { calories: 210 } },
          { name: "Chicken", nutrients: { calories: 210 } },
        ],
      }],
    });

    expect(object.meals[0].foods).toHaveLength(2);
    expect(object.meals[0].foods.map((food) => food.id)).toEqual([
      "dinner_food_1",
      "dinner_food_2",
    ]);
  });

  it("keeps explicit daily totals authoritative and reconciles small rounding differences", () => {
    const result = reconcileNutritionDayEvidence({
      dailyTotals: { calories: 1930, protein_g: 171, carbs_g: 161, fat_g: 79 },
      meals: [
        { name: "Breakfast", totals: { calories: 440, protein_g: 62, carbs_g: 37, fat_g: 6 } },
        { name: "Lunch", totals: { calories: 467, protein_g: 47, carbs_g: 14, fat_g: 26 } },
        { name: "Dinner", totals: { calories: 813, protein_g: 60, carbs_g: 74, fat_g: 39 } },
        { name: "Snacks", totals: { calories: 210, protein_g: 3, carbs_g: 36, fat_g: 7 } },
      ],
    });

    expect(result.authoritative_source).toBe("daily_totals");
    expect(result.status).toBe("reconciled");
    expect(result.meal_sums).toEqual(expect.objectContaining({
      calories: 1930,
      protein_g: 172,
      carbs_g: 161,
      fat_g: 78,
    }));
  });

  it("flags material discrepancies instead of overwriting daily totals", () => {
    const result = reconcileNutritionDayEvidence({
      dailyTotals: { calories: 1930, protein_g: 171 },
      meals: [{ name: "Dinner", totals: { calories: 813, protein_g: 60 } }],
    });

    expect(result.status).toBe("needs_review");
    expect(result.differences).toEqual(expect.objectContaining({
      calories: 1117,
      protein_g: 111,
    }));
  });

  it("recovers a legacy collapsed duplicate only with corroborating ID and calorie gaps", () => {
    const foods = restoreCollapsedNutritionFoodDuplicates({
      totals: { calories: 420 },
      foods: [
        { id: "food-dinner-1", name: "Chicken", nutrients: { calories: 210 } },
        { id: "food-dinner-3", name: "Sauce", nutrients: { calories: 0 } },
      ],
    });

    expect(foods.map((food) => food.id)).toEqual([
      "food-dinner-1",
      "food-dinner-2",
      "food-dinner-3",
    ]);
    expect(foods[1]).toEqual(expect.objectContaining({ name: "Chicken" }));
  });
});
