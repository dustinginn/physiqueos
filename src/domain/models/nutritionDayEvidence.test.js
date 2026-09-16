import { describe, expect, it } from "vitest";
import {
  applyNutritionDayMealAggregation,
  createNutritionDayEvidenceObject,
  reconcilePersistedNutritionPartialSubtotal,
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

  it("uses deterministic meal sums and reconciles small source-summary rounding differences", () => {
    const result = reconcileNutritionDayEvidence({
      dailyTotals: { calories: 1930, protein_g: 171, carbs_g: 161, fat_g: 79 },
      meals: [
        { name: "Breakfast", totals: { calories: 440, protein_g: 62, carbs_g: 37, fat_g: 6 } },
        { name: "Lunch", totals: { calories: 467, protein_g: 47, carbs_g: 14, fat_g: 26 } },
        { name: "Dinner", totals: { calories: 813, protein_g: 60, carbs_g: 74, fat_g: 39 } },
        { name: "Snacks", totals: { calories: 210, protein_g: 3, carbs_g: 36, fat_g: 7 } },
      ],
    });

    expect(result.authoritative_source).toBe("canonical_meal_sums");
    expect(result.status).toBe("reconciled");
    expect(result.meal_sums).toEqual(expect.objectContaining({
      calories: 1930,
      protein_g: 172,
      carbs_g: 161,
      fat_g: 78,
    }));
  });

  it("flags a materially conflicting full-day summary while projecting canonical meal sums", () => {
    const result = reconcileNutritionDayEvidence({
      dailyTotals: { calories: 1930, protein_g: 171 },
      dailyTotalsScope: "full_day_summary",
      meals: [{ name: "Dinner", totals: { calories: 813, protein_g: 60 } }],
    });

    expect(result.status).toBe("needs_review");
    expect(result.canonical_totals).toEqual(expect.objectContaining({
      calories: 813,
      protein_g: 60,
    }));
    expect(result.differences).toEqual(expect.objectContaining({
      calories: 1117,
      protein_g: 111,
    }));
  });

  it("derives the concrete four-meal aggregate without a separate day summary", () => {
    const day = createNutritionDayEvidenceObject({
      id: "nutrition-sep-5-shaped-fixture",
      date: "2026-09-05",
      meals: [
        { name: "Breakfast", totals: { calories: 585, protein_g: 33, carbs_g: 64, fat_g: 23 } },
        { name: "Lunch", totals: { calories: 620, protein_g: 53, carbs_g: 50, fat_g: 32 } },
        { name: "Dinner", totals: { calories: 1584, protein_g: 78, carbs_g: 139, fat_g: 77 } },
        { name: "Snacks", totals: { calories: 1131, protein_g: 20, carbs_g: 131, fat_g: 60 } },
      ],
      metadata: { daily_totals_scope: "partial_meal_subtotal" },
    });

    expect(day.daily_totals).toEqual(expect.objectContaining({
      calories: 3920,
      protein_g: 184,
      carbs_g: 384,
      fat_g: 192,
    }));
    expect(day.metadata.daily_totals_reconciliation).toEqual(expect.objectContaining({
      authoritative_source: "canonical_meal_sums",
      status: "derived_from_meals",
    }));
  });

  it("derives a one-meal day and does not fabricate fields missing from any meal", () => {
    const day = applyNutritionDayMealAggregation({
      daily_totals: { calories: 700, protein_g: 50, carbs_g: 80, fat_g: 20 },
      metadata: { daily_totals_scope: "full_day_summary" },
      meals: [{
        name: "Dinner",
        totals: { calories: 700, protein_g: 50, carbs_g: null, fat_g: 20 },
      }],
    });

    expect(day.daily_totals).toEqual(expect.objectContaining({
      calories: 700,
      protein_g: 50,
      carbs_g: 80,
      fat_g: 20,
    }));
    expect(day.metadata.daily_totals_reconciliation.computed_fields).toEqual([
      "calories", "protein_g", "fat_g",
    ]);
    expect(day.metadata.daily_totals_reconciliation.preserved_source_fields)
      .toContain("carbs_g");
  });

  it("deterministically recovers a persisted split-artifact subtotal without rereading evidence", () => {
    const persisted = createNutritionDayEvidenceObject({
      id: "nutrition-sep-15",
      date: "2026-09-15",
      dailyTotals: { calories: 1496, protein_g: 59, carbs_g: 114, fat_g: 91 },
      metadata: {
        daily_totals_scope: "full_day_summary",
        daily_totals_source_artifact_refs: ["artifact-dinner-snacks"],
      },
      meals: [
        meal("Breakfast", 400, 61, 27, 6, "artifact-breakfast-lunch"),
        meal("Lunch", 588, 61, 24, 23, "artifact-breakfast-lunch"),
        meal("Dinner", 809, 47, 27, 57, "artifact-dinner-snacks"),
        meal("Snacks", 687, 12, 87, 34, "artifact-dinner-snacks"),
      ],
    });

    expect(persisted.metadata.daily_totals_reconciliation.status).toBe("needs_review");
    const recovered = reconcilePersistedNutritionPartialSubtotal(persisted);

    expect(recovered.changed).toBe(true);
    expect(recovered.proof).toEqual({
      sourceArtifactRefs: ["artifact-dinner-snacks"],
      sourceMealIds: ["dinner", "snacks"],
      totalMealCount: 4,
    });
    expect(recovered.evidenceObject.daily_totals).toEqual(expect.objectContaining({
      calories: 2484,
      protein_g: 181,
      carbs_g: 165,
      fat_g: 120,
    }));
    expect(recovered.evidenceObject.metadata).toEqual(expect.objectContaining({
      daily_totals_scope: "partial_meal_subtotal",
      daily_totals_source_artifact_refs: ["artifact-dinner-snacks"],
      daily_totals_reconciliation: expect.objectContaining({
        status: "reconciled",
        conflicting_fields: [],
        source_daily_totals: expect.objectContaining({ calories: 1496 }),
      }),
    }));
  });

  it("does not demote a genuine independent full-day summary", () => {
    const persisted = createNutritionDayEvidenceObject({
      id: "nutrition-full-summary",
      date: "2026-09-15",
      dailyTotals: { calories: 2484, protein_g: 181, carbs_g: 165, fat_g: 120 },
      metadata: {
        daily_totals_scope: "full_day_summary",
        daily_totals_source_artifact_refs: ["artifact-summary"],
      },
      meals: [
        meal("Breakfast", 400, 61, 27, 6, "artifact-meals"),
        meal("Lunch", 588, 61, 24, 23, "artifact-meals"),
        meal("Dinner", 809, 47, 27, 57, "artifact-meals"),
        meal("Snacks", 687, 12, 87, 34, "artifact-meals"),
      ],
    });

    const recovered = reconcilePersistedNutritionPartialSubtotal(persisted);
    expect(recovered).toEqual({ changed: false, evidenceObject: persisted });
    expect(persisted.metadata.daily_totals_scope).toBe("full_day_summary");
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

function meal(name, calories, protein_g, carbs_g, fat_g, artifactRef) {
  return {
    id: name.toLowerCase(),
    name,
    totals: { calories, protein_g, carbs_g, fat_g },
    provenance_ref: artifactRef,
    provenance: { source_artifact_refs: [artifactRef] },
  };
}
