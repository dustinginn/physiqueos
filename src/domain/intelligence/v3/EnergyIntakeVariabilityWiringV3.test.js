import { describe, expect, it } from "vitest";
import { deriveEnergyExecutionV3 } from "./EnergyAmbiguityV3.js";
import { isSemanticallyEquivalent } from "./V3Runtime.js";
import { composeEnergyStatementV3 } from "../../services/BriefingV3Projection.js";
import { adaptEnergyObservationsV3 } from "../CadenceEnergyObservationsV3.js";
import { createEnergyPIObservations } from "../../services/EnergyPIObservationService.js";

// Wiring tests for Part A: EnergyVariabilityV3 (the reusable pattern module,
// unit-tested on its own in EnergyVariabilityV3.test.js) plumbed through the
// live V3 Energy path — CadenceEnergyAssessmentService's per-day rows ->
// EnergyPIObservationService's window-average PI observation (now carrying
// an additive per-day series) -> CadenceEnergyObservationsV3's V3 capability
// -> EnergyAmbiguityV3.deriveEnergyExecutionV3 -> BriefingV3Projection's
// Energy statement. These tests prove the WIRING, not the module's own
// pattern math (already covered independently).

const TARGET = { value: 2500, unit: "kcal/day" };
const goalContract = { strategy: { energyStrategy: {
  intakeTarget: TARGET, activityTarget: { value: 800, unit: "kcal/day" },
  adjustmentAuthorization: "user_required", automaticAdjustmentAllowed: false,
} } };

function day(date, value) {
  return { date, value };
}

function intakeObservation({ dailySeries = [], comparisonDailySeries = [] } = {}) {
  return {
    observationId: "o|intake",
    limitations: [],
    quality: { status: "adequate" },
    capabilities: [{
      capabilityId: "execution.energy_intake",
      value: 2500,
      metadata: {
        plan: {
          state: "on_plan", targetValue: 2500, observedValue: 2500, deviation: 0, deviationRatio: 0,
          unit: "kcal/day", toleranceRatio: 0.1, targetSource: "energy_protocol_current_revision",
          authorization: "user_required",
        },
        measurementType: "RECORDED_INPUT",
        dailySeries,
        comparisonDailySeries,
      },
    }],
  };
}

// 14 on-plan historical days is a sufficient, quiet baseline unless a test
// overrides specific days.
function quietHistory(count = 14, startIndex = 1) {
  return Array.from({ length: count }, (_, index) =>
    day(`2026-08-${String(startIndex + index).padStart(2, "0")}`, 2500));
}

describe("EnergyVariabilityV3 wiring — deriveEnergyExecutionV3", () => {
  it("treats 1500, 2500, and 4000 kcal days as equally paired/observed evidence — target distance never marks a day incomplete", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 1500), day("2026-09-02", 2500), day("2026-09-03", 4000)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    // All three days count toward pairedDayCount regardless of how far from
    // target they sit — completeness and target-distance are independent.
    expect(execution.variability.pairedDayCount).toBe(3);
  });

  it("a single day far above plan does not by itself warrant a nudge", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 4000), day("2026-09-02", 2500), day("2026-09-03", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("isolated_or_mixed_deviation_not_a_pattern");
  });

  it("a single day far below plan does not by itself warrant a nudge", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 1500), day("2026-09-02", 2500), day("2026-09-03", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("isolated_or_mixed_deviation_not_a_pattern");
  });

  it("repeated above-plan days that are unusual for this person's own history produce an upward nudge", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000), day("2026-09-04", 2500), day("2026-09-05", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(execution.variability.dominantDirection).toBe("upward");
    expect(execution.variability.reasonCode).toBe("repeated_pattern_reduces_predictability");
  });

  it("repeated below-plan days that are unusual for this person's own history produce a downward nudge", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 2000), day("2026-09-02", 2000), day("2026-09-03", 2000), day("2026-09-04", 2500), day("2026-09-05", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(execution.variability.dominantDirection).toBe("downward");
  });

  it("does not nudge when the current off-plan rate matches this person's own normal historical rate", () => {
    // 8 of 14 historical days off-plan-upward is this person's own normal
    // range; 3 of 5 current days off-plan-upward is not meaningfully higher.
    const busyHistory = [
      ...Array.from({ length: 8 }, (_, index) => day(`2026-08-${String(index + 1).padStart(2, "0")}`, 3000)),
      ...Array.from({ length: 6 }, (_, index) => day(`2026-08-${String(index + 9).padStart(2, "0")}`, 2500)),
    ];
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000), day("2026-09-04", 2500), day("2026-09-05", 2500)],
        comparisonDailySeries: busyHistory,
      })],
    });
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("within_this_persons_own_normal_range");
  });

  it("stays conservative (no nudge) when historical evidence is insufficient, even with a clear current-period pattern", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000)],
        comparisonDailySeries: quietHistory(5), // below the 14-day minimum
      })],
    });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("insufficient_history_for_user_relative_baseline");
  });

  it("a protocol change separates the comparable baseline: historical days before the new target's effective date are excluded", () => {
    const withoutCutoff = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000)],
        // 20 days of history under whatever target was in force at the time.
        comparisonDailySeries: quietHistory(20),
      })],
    });
    expect(withoutCutoff.variability.hasSufficientHistoricalBaseline).toBe(true);

    const contractWithEffectiveDate = { strategy: { energyStrategy: {
      ...goalContract.strategy.energyStrategy,
      // Only the last 10 of the 20 historical days fall on/after this date.
      effectiveAt: "2026-08-11",
    } } };
    const withCutoff = deriveEnergyExecutionV3({
      goalContract: contractWithEffectiveDate,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000)],
        comparisonDailySeries: quietHistory(20),
      })],
    });
    // 10 remaining days is below the 14-day minimum: the pre-cutoff days,
    // measured against a target that no longer applies, are correctly
    // excluded rather than padding out a false "sufficient" baseline.
    expect(withCutoff.variability.hasSufficientHistoricalBaseline).toBe(false);
  });

  it("returns no variability claim at all when there is no intake target to measure deviation against", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract: { strategy: { energyStrategy: null } },
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    expect(execution.variability).toBeNull();
  });
});

describe("EnergyVariabilityV3 wiring — bounded historical baseline series", () => {
  const withBaseline = (baselineDailySeries, effectiveAt) => deriveEnergyExecutionV3({
    goalContract: effectiveAt === undefined ? goalContract : { strategy: { energyStrategy: {
      ...goalContract.strategy.energyStrategy, effectiveAt } } },
    observations: [(() => {
      const observation = intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000)],
        comparisonDailySeries: quietHistory(3, 25), // equal-length comparison only: far below 14
      });
      observation.capabilities[0].metadata.baselineDailySeries = baselineDailySeries;
      return observation;
    })()],
  });
  const longBaseline = () => quietHistory(28, 1);

  it("a sufficient baselineDailySeries lets the signal fire when the regime start is known", () => {
    const execution = withBaseline(longBaseline(), "2026-07-01");
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(true);
  });

  it("is not trusted without a known regime start (conservative, comparison window only)", () => {
    const execution = withBaseline(longBaseline());
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("excludes baseline days before the protocol's effective date and any not-complete-source day", () => {
    const partial = quietHistory(28, 1).map((item, index) => (index % 2 ? { ...item, nutritionCompleteness: "partial", value: 900 } : item));
    const execution = withBaseline(partial, "2026-07-01");
    // 14 complete + 14 partial: exactly the 14-day minimum is still met, and the partial (900 kcal) days never count as below plan.
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.historicalOffPlanRatio).toBe(0);
    const tooFew = withBaseline(quietHistory(28, 1).map((item, index) => (index % 2 === 0 ? { ...item, nutritionCompleteness: "unknown" } : item)).slice(0, 27), "2026-07-01");
    expect(tooFew.variability.hasSufficientHistoricalBaseline).toBe(false);
  });
});

describe("EnergyVariabilityV3 wiring — composeEnergyStatementV3 dedup", () => {
  it("surfaces a genuine variability nudge alongside an unrelated evidence-quality caveat without duplicating either meaning", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000), day("2026-09-04", 2500), day("2026-09-05", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    const ambiguityText = "Some days do not have a reliable full-day calorie total.";
    const statement = composeEnergyStatementV3({ execution, ambiguityText });
    expect(statement).toContain(ambiguityText);
    expect(statement).toMatch(/running above plan more often than usual/);
    expect(isSemanticallyEquivalent(ambiguityText,
      "Energy has been running above plan more often than usual for you recently, enough that the period's overall balance is less predictable than it has been.")).toBe(false);
  });

  it("does not repeat the nudge when the ambiguity sentence already carries the same meaning", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 3000), day("2026-09-02", 3000), day("2026-09-03", 3000), day("2026-09-04", 2500), day("2026-09-05", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    const nudge = "Energy has been running above plan more often than usual for you recently, enough that the period's overall balance is less predictable than it has been.";
    const statement = composeEnergyStatementV3({ execution, ambiguityText: nudge });
    expect(statement).toBe(nudge);
    expect(statement.match(/more often than usual/gu)).toHaveLength(1);
  });

  it("surfaces nothing extra when no nudge is warranted, keeping the Energy card data-first", () => {
    const execution = deriveEnergyExecutionV3({
      goalContract,
      observations: [intakeObservation({
        dailySeries: [day("2026-09-01", 2500), day("2026-09-02", 2500)],
        comparisonDailySeries: quietHistory(),
      })],
    });
    expect(composeEnergyStatementV3({ execution, ambiguityText: null })).toBeNull();
  });
});

describe("EnergyVariabilityV3 wiring — end to end from real per-day evidence rows", () => {
  it("a repeated above-plan pattern in real CadenceEnergyAssessmentService-shaped daily rows reaches the Energy statement", () => {
    const comparisonRows = Array.from({ length: 14 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`, calorieIntake: 2500, activeCalories: 500,
      rmr: 1700, rmrScanId: "dexa_1", rmrScanDate: "2026-07-01", estimatedExpenditure: 2200, energyBalance: 300,
      pairedCompleteness: "complete", nutritionAuthority: { tier: "full_day_asserted", ambiguity: [] },
      activitySource: { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" },
    }));
    const currentRows = [
      { date: "2026-09-01", calorieIntake: 3000, activeCalories: 500, rmr: 1700, rmrScanId: "dexa_1", rmrScanDate: "2026-07-01", estimatedExpenditure: 2200, energyBalance: 800, pairedCompleteness: "complete", nutritionAuthority: { tier: "full_day_asserted", ambiguity: [] }, activitySource: { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" } },
      { date: "2026-09-02", calorieIntake: 3000, activeCalories: 500, rmr: 1700, rmrScanId: "dexa_1", rmrScanDate: "2026-07-01", estimatedExpenditure: 2200, energyBalance: 800, pairedCompleteness: "complete", nutritionAuthority: { tier: "full_day_asserted", ambiguity: [] }, activitySource: { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" } },
      { date: "2026-09-03", calorieIntake: 3000, activeCalories: 500, rmr: 1700, rmrScanId: "dexa_1", rmrScanDate: "2026-07-01", estimatedExpenditure: 2200, energyBalance: 800, pairedCompleteness: "complete", nutritionAuthority: { tier: "full_day_asserted", ambiguity: [] }, activitySource: { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" } },
    ];
    const observationWindow = { startDate: "2026-09-01", endDate: "2026-09-03" };
    const comparisonWindow = { startDate: "2026-08-01", endDate: "2026-08-14" };
    const piObservations = createEnergyPIObservations({
      days: [...comparisonRows, ...currentRows], observationWindow, comparisonWindow, semanticHorizon: "midweek",
    });
    const v3Observations = adaptEnergyObservationsV3({
      observations: piObservations,
      goalContract: { ...goalContract, goalId: "goal_1", phase: { phaseId: "phase_1" },
        strategy: { ...goalContract.strategy, strategyRevisionId: "strategy_1" } },
      artifactId: "test", evidenceCutoff: "2026-09-03",
    });
    const execution = deriveEnergyExecutionV3({ goalContract, observations: v3Observations });
    expect(execution.variability).not.toBeNull();
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(execution.variability.dominantDirection).toBe("upward");
    const statement = composeEnergyStatementV3({ execution, ambiguityText: null });
    expect(statement).toMatch(/running above plan more often than usual/);
  });
});
