import { describe, expect, it } from "vitest";
import { normalizeScreenshotEvidencePackageForTest } from "./ScreenshotInterpreterService";

describe("screenshot NutritionDay reconciliation", () => {
  it("merges one day, orders meals, preserves duplicate foods, and avoids overlap copies", () => {
    const food = (id, name, calories, ref) => ({
      id,
      name,
      canonical_name: name,
      meal: "Dinner",
      nutrients: { calories },
      provenance_ref: ref,
    });
    const result = normalizeScreenshotEvidencePackageForTest({
      evidence_objects: [
        {
          id: "nutrition-day",
          evidence_type: "nutrition",
          observed_at: "2026-07-17",
          daily_totals: { calories: 1930, protein_g: 171, carbs_g: 161, fat_g: 79 },
          meals: [
            { id: "snacks", name: "Snacks", totals: { calories: 210 }, foods: [] },
            {
              id: "dinner",
              name: "Dinner",
              totals: { calories: 813 },
              foods: [
                food("food-dinner-1", "Chicken", 210, "screenshot_0"),
                food("food-dinner-2", "Chicken", 210, "screenshot_0"),
              ],
            },
          ],
          provenance: { source_artifact_refs: ["screenshot_0"] },
        },
        {
          id: "nutrition-day-overlap",
          evidence_type: "nutrition",
          observed_at: "2026-07-17",
          meals: [
            { id: "breakfast", name: "Breakfast", totals: { calories: 440 }, foods: [] },
            { id: "lunch", name: "Lunch", totals: { calories: 467 }, foods: [] },
            {
              id: "dinner",
              name: "Dinner",
              totals: { calories: 813 },
              foods: [food("food-dinner-1", "Chicken", 210, "screenshot_1")],
            },
          ],
          provenance: { source_artifact_refs: ["screenshot_1"] },
        },
      ],
    }, {
      expectedEvidenceType: "nutrition",
      normalizedScreenshots: [
        { fileName: "nutrition-1.png" },
        { fileName: "nutrition-2.png" },
      ],
    });

    expect(result.evidence_objects).toHaveLength(1);
    const nutritionDay = result.evidence_objects[0];
    expect(nutritionDay.meals.map((meal) => meal.name)).toEqual([
      "Breakfast", "Lunch", "Dinner", "Snacks",
    ]);
    expect(nutritionDay.meals[2].foods.map((item) => item.id)).toEqual([
      "food-dinner-1", "food-dinner-2",
    ]);
    expect(nutritionDay.daily_totals).toEqual(expect.objectContaining({
      calories: 1930,
      protein_g: 171,
      carbs_g: 161,
      fat_g: 79,
    }));
  });
});
