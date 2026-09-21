import { describe, expect, it } from "vitest";
import {
  applyEnergyAmbiguityToRecommendation, deriveEnergyExecutionV3, EnergyAmbiguityTypeV3,
} from "./EnergyAmbiguityV3.js";
import { describeUncertaintyV3 } from "./AmbiguityVocabularyV3.js";
import { composeEnergyStatementV3 } from "../../services/BriefingV3Projection.js";

const goalContract = { strategy: { energyStrategy: {
  intakeTarget: { value: 2500, unit: "kcal/day" }, activityTarget: { value: 800, unit: "kcal/day" },
  adjustmentAuthorization: "user_required", automaticAdjustmentAllowed: false,
} } };

const observation = (id, capabilityId, metadata = {}, limitations = [], value = 0) => ({
  observationId: id, limitations, quality: { status: "adequate" },
  capabilities: [{ capabilityId, value, metadata }],
});
const plan = (targetValue, observedValue) => ({
  state: observedValue < targetValue * 0.9 ? "below_plan" : observedValue > targetValue * 1.1 ? "above_plan" : "on_plan",
  targetValue, observedValue, deviation: observedValue - targetValue, deviationRatio: observedValue / targetValue - 1,
  unit: "kcal/day", toleranceRatio: 0.1, targetSource: "energy_protocol_current_revision", authorization: "user_required",
});

function fullObservations() {
  return [
    observation("o|estimate", "strategy.energy_balance_estimate", {
      trendDirection: "falling", measurementType: "DERIVED_ESTIMATE",
      pairing: { eligibleDayCount: 7, pairedDayCount: 6, pairedCoverageRatio: 6 / 7 },
    }, [], -289),
    observation("o|intake", "execution.energy_intake", { plan: plan(2500, 2457), measurementType: "REPORTED_INTAKE" },
      ["intake_meal_derived_unverified"], 2457),
    observation("o|activity", "execution.energy_activity", { plan: plan(800, 900), measurementType: "WEARABLE_ESTIMATE" },
      ["active_expenditure_is_wearable_estimated"], 900),
    observation("o|pairing", "execution.energy_pairing", {
      pairing: { eligibleDayCount: 7, pairedDayCount: 6, pairedCoverageRatio: 6 / 7, unpairedNutritionDayCount: 1 },
    }, [], 6 / 7),
    observation("o|tension", "strategy.energy_outcome_tension", { tension: { materiality: "high", lagPlausible: true } }),
  ];
}

describe("Energy execution and ambiguity (V3)", () => {
  it("derives strategy-relative findings, the estimate and each ambiguity type", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: fullObservations() });
    expect(execution.findings.map((item) => [item.dimension, item.state])).toEqual([["intake", "on_plan"], ["activity", "above_plan"]]);
    expect(execution.estimate).toMatchObject({ averageKcalPerDay: -289, trendDirection: "falling" });
    expect(execution.ambiguity.map((item) => item.type)).toEqual(expect.arrayContaining([
      EnergyAmbiguityTypeV3.INTAKE, EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE,
      EnergyAmbiguityTypeV3.PAIRING, EnergyAmbiguityTypeV3.TENSION,
    ]));
    expect(execution.ambiguity.every((item) => item.uncertaintyId.startsWith("uncertainty|energy_"))).toBe(true);
  });

  it("has no ambiguity and no findings when no Energy evidence was observed", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: [] });
    expect(execution.ambiguity).toEqual([]);
    expect(execution.findings).toEqual([]);
    expect(execution.estimate).toBeNull();
  });

  it("tempers the recommendation for moderate or high ambiguity without changing its action", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: fullObservations() });
    const base = { action: "continue_current_strategy", reason: "strategy_supported", urgency: "routine" };
    const result = applyEnergyAmbiguityToRecommendation(base, execution);
    expect(result).toMatchObject({ ...base, strength: "tempered" });
    expect(result.nonAction).toEqual(expect.arrayContaining([
      "no_automatic_energy_target_change", "no_energy_target_change_on_the_estimate_alone",
    ]));
    expect(result.ambiguityDrivers.length).toBeGreaterThan(0);
  });

  it("leaves the recommendation untouched when there is no Energy evidence (a DEXA Event)", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: [] });
    const base = { action: "continue_current_strategy" };
    expect(applyEnergyAmbiguityToRecommendation(base, execution)).toBe(base);
  });

  it("keeps a recommendation firm when the only ambiguity is low", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: [
      observation("o|pairing", "execution.energy_pairing", {
        pairing: { eligibleDayCount: 7, pairedDayCount: 6, pairedCoverageRatio: 0.9 },
      }),
    ] });
    expect(execution.ambiguity[0].materiality).toBe("low");
    expect(applyEnergyAmbiguityToRecommendation({ action: "x" }, execution).strength).toBe("firm");
  });

  it("describes every Energy ambiguity in plain language and composes a factual Energy statement", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: fullObservations() });
    for (const item of execution.ambiguity) {
      const text = describeUncertaintyV3(item);
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(/energy_|uncertainty\|/);
    }
    const statement = composeEnergyStatementV3({ execution });
    expect(statement).toMatch(/Calorie intake averaged 2,457 kcal\/day, in line with the 2,500 kcal\/day target/);
    expect(statement).toMatch(/Active calories averaged 900 kcal\/day, 100 kcal\/day above the 800 kcal\/day target/);
    expect(statement).toMatch(/-289 kcal\/day across 6 of 7 paired days/);
  });
});
