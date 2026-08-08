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

  it.each([
    ["detail, summary, detail", ["breakfastLunch", "summary", "dinnerSnacks"]],
    ["summary, detail, detail", ["summary", "breakfastLunch", "dinnerSnacks"]],
    ["detail, detail, summary", ["breakfastLunch", "dinnerSnacks", "summary"]],
  ])("selects the full-day summary independent of upload order: %s", (_name, order) => {
    const candidates = august6NutritionCandidates();
    const result = normalizeScreenshotEvidencePackageForTest({
      evidence_objects: order.map((key) => candidates[key]),
    }, {
      expectedEvidenceType: "nutrition",
      normalizedScreenshots: [
        { fileName: "nutrition-detail-a.png" },
        { fileName: "nutrition-summary.png" },
        { fileName: "nutrition-detail-b.png" },
      ],
    });

    const nutritionDay = result.evidence_objects[0];
    expect(nutritionDay.daily_totals).toEqual(expect.objectContaining({
      calories: 2280,
      protein_g: 189,
      carbs_g: 185,
      fat_g: 83,
    }));
    expect(nutritionDay.metadata).toEqual(expect.objectContaining({
      daily_totals_scope: "full_day_summary",
      daily_totals_source_artifact_refs: ["IMG_1804.jpeg"],
    }));
    expect(nutritionDay.macro_percentages).toEqual(expect.objectContaining({
      protein: expect.objectContaining({ grams: 189, percent_of_calories: 34 }),
      carbohydrates: expect.objectContaining({ grams: 185, percent_of_calories: 33 }),
      fat: expect.objectContaining({ grams: 83, percent_of_calories: 33 }),
    }));
    expect(nutritionDay.nutrients.map(({ name, total, provenance_ref }) => ({
      name, total, provenance_ref,
    }))).toEqual([
      { name: "Calories", total: 2280, provenance_ref: "IMG_1804.jpeg" },
      { name: "Protein", total: 189, provenance_ref: "IMG_1804.jpeg" },
      { name: "Carbohydrates", total: 185, provenance_ref: "IMG_1804.jpeg" },
      { name: "Fat", total: 83, provenance_ref: "IMG_1804.jpeg" },
    ]);
    expect(nutritionDay.meals.map(({ name, totals }) => ({
      name,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
    }))).toEqual([
      { name: "Breakfast", calories: 440, protein_g: 62, carbs_g: 37, fat_g: 6 },
      { name: "Lunch", calories: 640, protein_g: 64, carbs_g: 36, fat_g: 28 },
      { name: "Dinner", calories: 648, protein_g: 55, carbs_g: 28, fat_g: 25 },
      { name: "Snacks", calories: 553, protein_g: 8, carbs_g: 83, fat_g: 23 },
    ]);
  });
});

function august6NutritionCandidates() {
  const totals = (calories, protein_g, carbs_g, fat_g) => ({
    calories, protein_g, carbs_g, fat_g,
    fiber_g: null, sugar_g: null, sodium_mg: null, cholesterol_mg: null,
  });
  const metadata = (scope, ref, mealCount) => ({
    date: "2026-08-06",
    source: "MyFitnessPal",
    completeness: scope === "full_day_summary" ? "complete" : "partial",
    daily_totals_scope: scope,
    daily_totals_source_artifact_refs: [ref],
    meal_count: mealCount,
    food_count: 0,
    goal_set: false,
    confidence: "high",
    provenance: [ref],
  });
  const meal = (id, name, value, ref) => ({
    id, name, completeness: "known_foods_available", known_foods: [],
    additional_foods_detected: 0, totals: value, foods: [],
    provenance_ref: ref, provenance: { source_artifact_refs: [ref] },
  });
  const evidence = (id, ref, dailyTotals, scope, meals = [], extra = {}) => ({
    id,
    evidence_type: "nutrition",
    observed_at: "2026-08-06",
    source: { modality: "screenshot", application: "MyFitnessPal",
      integration: null, source_artifact_refs: [ref] },
    metadata: metadata(scope, ref, meals.length),
    daily_totals: dailyTotals,
    targets: totals(null, null, null, null),
    macro_percentages: {},
    goal_status: {},
    nutrients: [],
    meals,
    values: [],
    confidence: { extraction: "high", interpretation: "high" },
    quality: { status: "complete", limitations: [] },
    provenance: { source_artifact_refs: [ref] },
    ...extra,
  });
  const breakfastLunch = totals(1080, 126, 73, 34);
  const dinnerSnacks = totals(1201, 63, 111, 48);
  const fullDay = totals(2280, 189, 185, 83);
  return {
    breakfastLunch: evidence(
      "nutrition-detail-breakfast-lunch",
      "IMG_1805.jpeg",
      breakfastLunch,
      "partial_meal_subtotal",
      [
        meal("breakfast", "Breakfast", totals(440, 62, 37, 6), "IMG_1805.jpeg"),
        meal("lunch", "Lunch", totals(640, 64, 36, 28), "IMG_1805.jpeg"),
      ]
    ),
    summary: evidence(
      "nutrition-summary",
      "IMG_1804.jpeg",
      fullDay,
      "full_day_summary",
      [],
      {
        macro_percentages: {
          protein: { grams: 189, percent_of_calories: 34, goal_percent: null },
          carbohydrates: { grams: 185, percent_of_calories: 33, goal_percent: null },
          fat: { grams: 83, percent_of_calories: 33, goal_percent: null },
        },
        nutrients: [
          ["Calories", 2280, "cal"],
          ["Protein", 189, "g"],
          ["Carbohydrates", 185, "g"],
          ["Fat", 83, "g"],
        ].map(([name, total, unit]) => ({
          name, total, goal: null, remaining: null, unit,
          percent_daily_value: null, provenance_ref: "IMG_1804.jpeg",
        })),
      }
    ),
    dinnerSnacks: evidence(
      "nutrition-detail-dinner-snacks",
      "IMG_1806.png",
      dinnerSnacks,
      "partial_meal_subtotal",
      [
        meal("dinner", "Dinner", totals(648, 55, 28, 25), "IMG_1806.png"),
        meal("snacks", "Snacks", totals(553, 8, 83, 23), "IMG_1806.png"),
      ]
    ),
  };
}
