import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getNutritionReportExtras,
  getPlaceholderEntries,
  getValidNutritionCalorieRange,
} from "./ProgressReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("ProgressReportingService Nutrition calorie-range handling", () => {
  it("preserves a valid configured calorie range", () => {
    const nutritionContext = {
      estimatedDailyCaloricIntake: {
        min: 1900,
        max: 2200,
        unit: "kcal",
      },
    };

    expect(getValidNutritionCalorieRange(nutritionContext)).toEqual({
      min: 1900,
      max: 2200,
      unit: "kcal",
    });
    expect(
      getPlaceholderEntries("nutrition", { nutritionContext })
    ).toEqual([
      { label: "Calorie Range", value: "1900-2200 kcal" },
    ]);
    expect(
      getNutritionReportExtras({ nutritionContext }).currentNutritionProtocol
        .calorieTarget
    ).toBe("1900-2200 kcal/day");
  });

  it.each([
    null,
    {},
    { min: null, max: 2200 },
    { min: 1900, max: null },
    { min: 2300, max: 2200 },
    { min: "invalid", max: 2200 },
  ])("treats %j as unavailable without inventing a target", (range) => {
    const nutritionContext = {
      estimatedDailyCaloricIntake: range,
    };
    const extras = getNutritionReportExtras({ nutritionContext });

    expect(getValidNutritionCalorieRange(nutritionContext)).toBeNull();
    expect(getPlaceholderEntries("nutrition", { nutritionContext })).toEqual(
      []
    );
    expect(extras.currentNutritionProtocol.calorieTarget).toBe("Not set");
    expect(extras.latestNutrition.value).toBe("Nutrition target not set");
    expect(JSON.stringify(extras)).not.toMatch(/0-0|undefined-undefined/);
  });

  it("keeps evidence-dependent Nutrition records when the target is unavailable", () => {
    const nutritionContext = {
      id: "calibration",
      estimatedDailyCaloricIntake: null,
    };
    const nutritionDays = [
      {
        daily_totals: {
          calories: 2105,
          carbs_g: 220,
          fat_g: 65,
          protein_g: 180,
        },
        id: "nutrition-day",
        meals: [{ id: "meal" }],
        observed_at: "2026-07-23",
      },
    ];
    const extras = getNutritionReportExtras({
      nutritionContext,
      nutritionDays,
    });

    expect(extras.latestNutrition).toMatchObject({
      id: "nutrition-day",
      value: "2105 calories",
    });
    expect(extras.nutritionDays[0].totals).toEqual(
      nutritionDays[0].daily_totals
    );
    expect(extras.nutritionDays[0].detail).toContain("180g protein");
    expect(extras.nutritionLibrary[0].detail).toBe("Logged daily totals");
  });

  it(
    "does not mutate production state or input records",
    () => {
      const before = fs.readFileSync(storePath);
      const nutritionContext = {
        estimatedDailyCaloricIntake: null,
        proteinTarget: { unit: "g", value: 167 },
      };
      const snapshot = structuredClone(nutritionContext);

      getPlaceholderEntries("nutrition", { nutritionContext });
      getNutritionReportExtras({ nutritionContext });

      expect(nutritionContext).toEqual(snapshot);
      expect(fs.readFileSync(storePath)).toEqual(before);
    },
    30000
  );
});
