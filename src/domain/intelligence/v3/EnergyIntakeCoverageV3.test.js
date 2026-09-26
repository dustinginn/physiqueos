import { describe, expect, it } from "vitest";
import { applyEnergyAmbiguityToRecommendation, deriveEnergyExecutionV3, EnergyAmbiguityTypeV3, mealDerivedCoverageV3 } from "./EnergyAmbiguityV3.js";
import { composeEnergyStatementV3 } from "../../services/BriefingV3Projection.js";
import { describeUncertaintyV3, ENERGY_AMBIGUITY_CLAUSES_V3 } from "./AmbiguityVocabularyV3.js";
import { adaptEnergyObservationsV3 } from "../CadenceEnergyObservationsV3.js";
import { createEnergyPIObservations } from "../../services/EnergyPIObservationService.js";

// Intake completeness is coverage-aware, not meal-log-aware: a window whose
// days are mostly authoritative full-day totals (e.g. HealthKit-graduated
// Nutrition, which never carries meal objects) must not read as if every
// day's calories came from logged meals. Days that genuinely are meal-derived
// are still named, with their share of the window.

const goalContract = { goalId: "goal_1", phase: { phaseId: "phase_1" }, strategy: {
  strategyRevisionId: "strategy_1",
  energyStrategy: { intakeTarget: { value: 2500, unit: "kcal/day" }, activityTarget: { value: 800, unit: "kcal/day" },
    adjustmentAuthorization: "user_required", automaticAdjustmentAllowed: false },
} };
const activitySource = { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" };
const healthKitDay = (date, kcal = 2450) => ({ date, calorieIntake: kcal, activeCalories: 800, rmr: 1700, rmrScanId: "dexa_1",
  rmrScanDate: "2026-09-12", estimatedExpenditure: 2500, energyBalance: kcal - 2500, pairedCompleteness: "complete",
  nutritionAuthority: { tier: "full_day_asserted", reliability: "high", energyUsable: true, ambiguity: [] }, activitySource });
const mealLogDay = (date, kcal = 2400) => ({ ...healthKitDay(date, kcal),
  nutritionAuthority: { tier: "meal_derived_unverified", reliability: "moderate", energyUsable: true,
    ambiguity: ["intake_meal_derived_unverified", "intake_meal_capture_flagged_partial"] } });
const dates = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];

function executionFor(rows) {
  const piObservations = createEnergyPIObservations({ days: rows,
    observationWindow: { startDate: dates[0], endDate: dates.at(-1) }, semanticHorizon: "rolling_7_days" });
  const observations = adaptEnergyObservationsV3({ observations: piObservations, goalContract, artifactId: "weekly-test",
    evidenceCutoff: "2026-09-27T06:59:59.999Z" });
  return deriveEnergyExecutionV3({ goalContract, observations });
}

function intakeAmbiguityFor(rows) {
  const piObservations = createEnergyPIObservations({ days: rows,
    observationWindow: { startDate: dates[0], endDate: dates.at(-1) }, semanticHorizon: "rolling_7_days" });
  const observations = adaptEnergyObservationsV3({ observations: piObservations, goalContract, artifactId: "weekly-test",
    evidenceCutoff: "2026-09-27T06:59:59.999Z" });
  const execution = deriveEnergyExecutionV3({ goalContract, observations });
  return execution.ambiguity.find((item) => item.type === EnergyAmbiguityTypeV3.INTAKE) ?? null;
}

describe("Energy intake completeness is coverage-aware (V3)", () => {
  it("raises no intake completeness ambiguity when every day is an authoritative full-day total", () => {
    expect(intakeAmbiguityFor(dates.map((date) => healthKitDay(date)))).toBeNull();
  });

  it("does not temper or surface meal-log language when meal-derived days are a minority of the window", () => {
    // The HealthKit transition week: two pre-graduation meal-log days, five device full-day totals.
    const item = intakeAmbiguityFor([mealLogDay(dates[0]), mealLogDay(dates[1]), ...dates.slice(2).map((date) => healthKitDay(date))]);
    expect(item.reasons).toContain("intake_meal_derived_days_2_of_7");
    expect(item).toMatchObject({ materiality: "low", recommendationEffect: "none" });
    expect(describeUncertaintyV3(item)).toBe("On 2 of the 7 days with calorie totals, the total comes from logged meals rather than a confirmed full-day total.");
    expect(describeUncertaintyV3(item)).not.toBe("Calorie totals come from logged meals rather than a confirmed full-day total.");
  });

  it("keeps the transition week firm: an immaterial intake limitation never re-enters through the wearable estimate", () => {
    const transition = executionFor([mealLogDay(dates[0]), mealLogDay(dates[1]), ...dates.slice(2).map((date) => healthKitDay(date))]);
    const allHealthKit = executionFor(dates.map((date) => healthKitDay(date)));
    const effect = (execution, type) => execution.ambiguity.find((item) => item.type === type)?.recommendationEffect ?? "none";
    expect(effect(transition, EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE)).toBe(effect(allHealthKit, EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE));
    expect(transition.ambiguity.filter((item) => item.recommendationEffect === "temper")).toEqual([]);
    const recommendation = applyEnergyAmbiguityToRecommendation({ action: "continue_current_strategy" }, transition);
    expect(recommendation.strength ?? "firm").toBe("firm");
    expect(composeEnergyStatementV3({ execution: transition, ambiguityText: null }) ?? "").not.toMatch(/directional|logged meals|wearable estimate/);
  });

  it("names the share of meal-derived days when they are the majority but not all", () => {
    const item = intakeAmbiguityFor([...dates.slice(0, 4).map((date) => mealLogDay(date)), ...dates.slice(4).map((date) => healthKitDay(date))]);
    expect(item).toMatchObject({ materiality: "moderate", recommendationEffect: "temper" });
    expect(ENERGY_AMBIGUITY_CLAUSES_V3.energy_intake_uncertainty(item))
      .toBe("on 4 of the 7 days with calorie totals, the total comes from logged meals rather than a confirmed full-day total");
  });

  it("keeps the established all-days wording and materiality when every day is meal-derived (historical parity)", () => {
    const item = intakeAmbiguityFor(dates.map((date) => mealLogDay(date)));
    expect(item.reasons).toContain("intake_meal_derived_days_7_of_7");
    expect(item).toMatchObject({ materiality: "moderate", recommendationEffect: "temper" });
    expect(describeUncertaintyV3(item)).toBe("Calorie totals come from logged meals rather than a confirmed full-day total.");
  });

  it("reads stored reasons without a day count exactly as before", () => {
    const stored = { type: EnergyAmbiguityTypeV3.INTAKE, reasons: ["intake_meal_capture_flagged_partial", "intake_meal_derived_unverified"] };
    expect(describeUncertaintyV3(stored)).toBe("Calorie totals come from logged meals rather than a confirmed full-day total.");
  });

  it("lets a missing, partial or conflicting total stay high regardless of meal-derived coverage", () => {
    const observations = [{ observationId: "o|intake", quality: { status: "adequate" },
      limitations: ["intake_meal_derived_unverified", "intake_meal_derived_days_1_of_7", "intake_totals_missing"],
      capabilities: [{ capabilityId: "execution.energy_intake", value: 2400, metadata: {} }] }];
    const item = deriveEnergyExecutionV3({ goalContract, observations }).ambiguity.find((entry) => entry.type === EnergyAmbiguityTypeV3.INTAKE);
    expect(item).toMatchObject({ materiality: "high", recommendationEffect: "temper" });
    expect(describeUncertaintyV3(item)).toBe("Some days do not have a reliable full-day calorie total.");
  });

  it("parses the coverage code strictly", () => {
    expect(mealDerivedCoverageV3(["intake_meal_derived_days_2_of_7"])).toEqual({ days: 2, of: 7 });
    expect(mealDerivedCoverageV3(["intake_meal_derived_unverified"])).toBeNull();
  });
});
