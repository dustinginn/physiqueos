import { describe, expect, it } from "vitest";
import { formatWholeNumber } from "./HealthKitEvidenceNumberFormatting";
import {
  createProviderActivityEvidenceReport,
  getNutritionReportExtras,
} from "./ProgressReportingService";
import { createEvidenceTimelineItems } from "./EvidenceTimelineService";

// The exact strings the Founder saw on Build 53's Evidence Reports: real
// HealthKit daily totals are binary floating-point sums, and every
// summary/headline/Areas builder used to interpolate them raw. The metric
// cards on the same screens were already compact ("2406", "178g", "782 cal",
// "241 cal"), so these pin headline == cards, character for character.
const NUTRITION_TOTALS = Object.freeze({
  calories: 2405.5120239257812,
  protein_g: 178.25211668014526,
  carbs_g: 173.8842658996582,
  fat_g: 109.46525192260742,
});

const ACTIVITY_PAYLOAD = Object.freeze({
  id: "healthkit_canonical_day_activity_2026-09-22",
  evidence_type: "activity_day",
  observed_at: "2026-09-22T12:00:00.000Z",
  daily_activity: {
    move_calories: 782.1669999999962,
    exercise_minutes: 42.00000000000001,
    total_calories_burned: 2891.9999999999995,
  },
  derived_metrics: {
    workout_active_calories: 541.0000000000002,
    non_workout_active_calories: 241.16699999999616,
  },
});

const RAW_DOUBLE_TAIL = /\d+\.\d+/;

describe("HealthKit Evidence summary formatting", () => {
  it("rounds every reported ugly value to a whole number and never emits a fractional tail", () => {
    expect(formatWholeNumber(2405.5120239257812)).toBe("2406");
    expect(formatWholeNumber(178.25211668014526)).toBe("178");
    expect(formatWholeNumber(173.8842658996582)).toBe("174");
    expect(formatWholeNumber(109.46525192260742)).toBe("109");
    expect(formatWholeNumber(782.1669999999962)).toBe("782");
    expect(formatWholeNumber(241.16699999999616)).toBe("241");
    expect(formatWholeNumber(0)).toBe("0");
    expect(formatWholeNumber(Number.NaN)).toBeNull();
    expect(formatWholeNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatWholeNumber(undefined)).toBeNull();
  });

  it("formats the Nutrition headline and subheadline with whole calories and whole grams, preserving canonical precision", () => {
    const extras = getNutritionReportExtras({
      nutritionEvidenceScoped: true,
      nutritionDays: [{
        id: "healthkit_canonical_day_nutrition_2026-09-22",
        observed_at: "2026-09-22T12:00:00.000Z",
        daily_totals: NUTRITION_TOTALS,
        meals: [],
        source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      }],
    });

    expect(extras.latestNutrition.value).toBe("2406 calories");
    expect(extras.latestNutrition.detail).toBe("178g protein · 174g carbs · 109g fat");
    expect(extras.nutritionDays[0].value).toBe("2406 calories");
    expect(extras.nutritionDays[0].detail).toBe("178g protein · 174g carbs · 109g fat");
    // Presentation only: the record still carries the exact canonical totals.
    expect(extras.latestNutrition.totals).toEqual(NUTRITION_TOTALS);
    for (const text of [extras.latestNutrition.value, extras.latestNutrition.detail]) {
      expect(text).not.toMatch(RAW_DOUBLE_TAIL);
    }
  });

  it("falls back to whole-gram protein when calories are absent", () => {
    const extras = getNutritionReportExtras({
      nutritionEvidenceScoped: true,
      nutritionDays: [{
        id: "nutrition-protein-only",
        observed_at: "2026-09-22T12:00:00.000Z",
        daily_totals: { protein_g: 178.25211668014526 },
        meals: [],
      }],
    });
    expect(extras.latestNutrition.value).toBe("178g protein");
  });

  it("formats the Activity headline, detail, report metric, history rows, and Activity Areas as whole numbers, preserving canonical precision", () => {
    const report = createProviderActivityEvidenceReport({
      canonicalEvidenceObjects: [{ canonicalId: "activity-1", payload: ACTIVITY_PAYLOAD }],
    });
    const day = report.latestActivityDay;

    expect(report.metric).toBe("782 active cal / 42 min");
    expect(day.value).toBe("782 active cal / 42 min");
    expect(day.detail).toBe("2892 total calories · 241 non-workout active cal");
    expect(report.activityHistory[0].value).toBe("782 active cal / 42 min");
    expect(report.activityHistory[0].detail).toBe("2892 total calories · 241 non-workout active cal");

    const areas = Object.fromEntries(report.activityAreas.map((area) => [area.id, area.value]));
    expect(areas).toEqual({
      "active-calories": "782 cal",
      "exercise-minutes": "42 min",
      "workout-activity": "541 cal",
      "non-workout-activity": "241 cal",
    });

    // Presentation only: the numeric fields the Native cards format themselves
    // still carry the exact canonical values (the cards round independently).
    expect(day.activeCalories).toBe(782.1669999999962);
    expect(day.nonWorkoutActiveCalories).toBe(241.16699999999616);
    expect(day.workoutActiveCalories).toBe(541.0000000000002);
    expect(day.totalCalories).toBe(2891.9999999999995);

    for (const text of [report.metric, day.value, day.detail, ...report.activityAreas.map((area) => area.value)]) {
      expect(text).not.toMatch(RAW_DOUBLE_TAIL);
    }
  });

  it("formats Evidence timeline Activity rows as whole numbers", () => {
    const [item] = createEvidenceTimelineItems({
      canonicalEvidenceObjects: [{ canonicalId: "activity-1", payload: ACTIVITY_PAYLOAD }],
    });

    expect(item).toMatchObject({
      type: "Daily Activity",
      title: "782 active cal / 42 exercise min",
      detail: "2892 total calories · 241 non-workout active cal",
    });
    expect(item.title).not.toMatch(RAW_DOUBLE_TAIL);
    expect(item.detail).not.toMatch(RAW_DOUBLE_TAIL);
  });

  it("keeps the move-only and exercise-only Activity fallbacks whole on both surfaces", () => {
    const moveOnly = { ...ACTIVITY_PAYLOAD, daily_activity: { move_calories: 782.1669999999962 }, derived_metrics: {} };
    const report = createProviderActivityEvidenceReport({
      canonicalEvidenceObjects: [{ canonicalId: "activity-move", payload: moveOnly }],
    });
    expect(report.latestActivityDay.value).toBe("782 active cal");
    expect(report.latestActivityDay.detail).toBe("Daily activity summary");

    const [item] = createEvidenceTimelineItems({
      canonicalEvidenceObjects: [{ canonicalId: "activity-move", payload: moveOnly }],
    });
    expect(item.title).toBe("782 active calories");
    expect(item.detail).toBe("Activity history updated");
  });
});
