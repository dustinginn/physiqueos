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

  it("describes every Energy ambiguity in plain language, and keeps the findings/estimate as structured data rather than prose", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: fullObservations() });
    for (const item of execution.ambiguity) {
      const text = describeUncertaintyV3(item);
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(/energy_|uncertainty\|/);
    }
    // Data-first: the per-dimension deviations and the paired-day estimate
    // are available as structured data for every surface to render as
    // rows/metric tiles — never restated as prose here.
    const intake = execution.findings.find((item) => item.dimension === "intake");
    expect(intake).toMatchObject({ observedValue: 2457, targetValue: 2500, state: "on_plan" });
    const activity = execution.findings.find((item) => item.dimension === "activity");
    expect(activity).toMatchObject({ observedValue: 900, targetValue: 800, state: "above_plan" });
    expect(execution.estimate).toMatchObject({ pairing: { pairedDayCount: 6, eligibleDayCount: 7 } });
    // Without an ambiguity clause, the module's own prose statement is empty
    // — the structured data above already says everything, so no sentence
    // restates it.
    expect(composeEnergyStatementV3({ execution })).toBeNull();
    // With an ambiguity/uncertainty clause, that IS the (at most one)
    // concise incremental sentence — verbatim passthrough, nothing appended.
    expect(composeEnergyStatementV3({ execution, ambiguityText: "Treat the estimate as directional." }))
      .toBe("Treat the estimate as directional.");
  });

  it("words a guardrail that could not be assessed without doubled punctuation", () => {
    const text = describeUncertaintyV3(
      { type: "guardrail", reasons: ["unassessed:g1"] },
      { vocabulary: { guardrails: { g1: { displayName: "Recovery." } } } },
    );
    expect(text).toBe("Recovery could not be assessed this period.");
  });

  it("treats a wearable estimate alone as low-materiality context, not a reason to temper", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: [
      observation("o|activity", "execution.energy_activity", { plan: plan(800, 900), measurementType: "WEARABLE_ESTIMATE" },
        ["active_expenditure_is_wearable_estimated"], 900),
      observation("o|pairing", "execution.energy_pairing", {
        pairing: { eligibleDayCount: 7, pairedDayCount: 7, pairedCoverageRatio: 1 },
      }, [], 1),
    ] });
    const wearable = execution.ambiguity.find((item) => item.type === EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE);
    expect(wearable.materiality).toBe("low");
    expect(applyEnergyAmbiguityToRecommendation({ action: "x" }, execution).strength).toBe("firm");
  });

  it("raises the wearable estimate to moderate when intake or pairing is weak, and high with outcome tension", () => {
    const weakIntake = deriveEnergyExecutionV3({ goalContract, observations: [
      observation("o|activity", "execution.energy_activity", { measurementType: "WEARABLE_ESTIMATE" },
        ["active_expenditure_is_wearable_estimated"], 900),
      observation("o|intake", "execution.energy_intake", {}, ["intake_meal_derived_unverified"], 2400),
    ] });
    expect(weakIntake.ambiguity.find((item) => item.type === EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE).materiality).toBe("moderate");
    const tension = deriveEnergyExecutionV3({ goalContract, observations: fullObservations() });
    expect(tension.ambiguity.find((item) => item.type === EnergyAmbiguityTypeV3.WEARABLE_ESTIMATE).materiality).toBe("high");
  });

  it("names which side of a day pair is missing without swapping nutrition and activity", () => {
    const execution = deriveEnergyExecutionV3({ goalContract, observations: [
      observation("o|pairing", "execution.energy_pairing", {
        pairing: { eligibleDayCount: 7, pairedDayCount: 6, pairedCoverageRatio: 6 / 7, unpairedNutritionDayCount: 1 },
      }, [], 6 / 7),
    ] });
    expect(execution.ambiguity[0].reasons).toContain("activity_missing_for_some_days");
    expect(execution.ambiguity[0].reasons).not.toContain("nutrition_missing_for_some_days");
  });
});
