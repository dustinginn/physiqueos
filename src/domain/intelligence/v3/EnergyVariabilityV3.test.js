import { describe, expect, it } from "vitest";
import {
  assessEnergyVariabilityV3,
  describeEnergyVariabilityNudgeV3,
  EnergyVariabilityDirection,
} from "./EnergyVariabilityV3.js";

function day(date, deviationRatio, hasPairedEvidence = true) {
  return { date, deviationRatio, hasPairedEvidence };
}

// 14 historical days, 2 of them off-plan upward (baseline rate ~14%).
function baselineHistory() {
  return [
    day("2026-08-20", 0.1), day("2026-08-21", -0.1), day("2026-08-22", 1.3),
    day("2026-08-23", 0.2), day("2026-08-24", -0.2), day("2026-08-25", 0.0),
    day("2026-08-26", 0.1), day("2026-08-27", 1.2), day("2026-08-28", -0.1),
    day("2026-08-29", 0.2), day("2026-08-30", 0.0), day("2026-08-31", 0.1),
    day("2026-09-01", -0.2), day("2026-09-02", 0.1),
  ];
}

describe("Energy variability/predictability (V3)", () => {
  it("is bidirectional: an upward pattern is detected the same way a downward pattern is", () => {
    const upward = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", 1.3), day("d3", 1.5), day("d4", 0.1)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(upward.dominantDirection).toBe(EnergyVariabilityDirection.UPWARD);
    expect(upward.nudgeWarranted).toBe(true);

    const downward = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", -1.4), day("d2", -1.3), day("d3", -1.5), day("d4", 0.1)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(downward.dominantDirection).toBe(EnergyVariabilityDirection.DOWNWARD);
    expect(downward.nudgeWarranted).toBe(true);
  });

  it("does not automatically nudge from a single isolated high or low day", () => {
    const oneHighDay = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", 0.1), day("d3", -0.1), day("d4", 0.0)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(oneHighDay.meetsPatternThreshold).toBe(false);
    expect(oneHighDay.nudgeWarranted).toBe(false);
    expect(oneHighDay.reasonCode).toBe("isolated_or_mixed_deviation_not_a_pattern");

    const oneLowDay = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", -1.4), day("d2", 0.1), day("d3", -0.1), day("d4", 0.0)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(oneLowDay.nudgeWarranted).toBe(false);
  });

  it("does not nudge when off-plan days clear the minimum count but are still a minority of the period", () => {
    // 3 off-plan days (>= minimumPatternDayCount) out of 10 paired days is
    // still well under half the period — a real but non-dominant minority,
    // not yet a period-level pattern.
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [
        day("d1", 1.4), day("d2", 1.3), day("d3", 1.5),
        day("d4", 0.1), day("d5", 0.0), day("d6", -0.1), day("d7", 0.1),
        day("d8", 0.0), day("d9", 0.1), day("d10", -0.1),
      ],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(assessment.offPlanDayCount).toBe(3);
    expect(assessment.pairedDayCount).toBe(10);
    expect(assessment.meetsPatternThreshold).toBe(false);
    expect(assessment.nudgeWarranted).toBe(false);
  });

  it("does not nudge from mixed-direction deviation even if several days are off-plan", () => {
    const mixed = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", -1.4), day("d3", 1.3), day("d4", -1.3)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(mixed.dominantDirection).toBeNull();
    expect(mixed.nudgeWarranted).toBe(false);
  });

  it("nudges on a repeated upward pattern that reduces predictability relative to this person's own history", () => {
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", 1.3), day("d3", 1.5), day("d4", 1.2), day("d5", 0.1)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(assessment.nudgeWarranted).toBe(true);
    expect(assessment.reasonCode).toBe("repeated_pattern_reduces_predictability");
    expect(assessment.confidence).toBe("user_relative");
    expect(describeEnergyVariabilityNudgeV3(assessment)).toMatch(/above plan/i);
    expect(describeEnergyVariabilityNudgeV3(assessment)).not.toMatch(/forgot|forgotten|intent/iu);
  });

  it("nudges on a repeated downward pattern the same way", () => {
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", -1.4), day("d2", -1.3), day("d3", -1.5), day("d4", -1.2), day("d5", 0.1)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(assessment.nudgeWarranted).toBe(true);
    expect(describeEnergyVariabilityNudgeV3(assessment)).toMatch(/below plan/i);
  });

  it("treats a pattern matching this person's own normal rate as not unusual, even with a real pattern present", () => {
    // 14 days, 6 upward off-plan — a genuine pattern, but this person's own
    // baseline already runs close to that rate.
    const consistentlyVariableHistory = Array.from({ length: 14 }, (_, index) =>
      day(`hist-${index}`, index % 2 === 0 ? 1.2 : 0.1));
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.3), day("d2", 1.4), day("d3", 1.2), day("d4", 1.25), day("d5", 0.0), day("d6", -0.1), day("d7", 0.1)],
      historicalDailyDeviations: consistentlyVariableHistory,
    });
    expect(assessment.meetsPatternThreshold).toBe(true);
    expect(assessment.isUnusualRelativeToHistory).toBe(false);
    expect(assessment.nudgeWarranted).toBe(false);
    expect(assessment.reasonCode).toBe("within_this_persons_own_normal_range");
  });

  it("is conservative — no nudge, low confidence — with insufficient history for a user-relative baseline", () => {
    const shortHistory = [day("h1", 1.4), day("h2", 1.3)];
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", 1.3), day("d3", 1.5), day("d4", 1.2)],
      historicalDailyDeviations: shortHistory,
    });
    expect(assessment.meetsPatternThreshold).toBe(true);
    expect(assessment.hasSufficientHistoricalBaseline).toBe(false);
    expect(assessment.isUnusualRelativeToHistory).toBeNull();
    expect(assessment.nudgeWarranted).toBe(false);
    expect(assessment.confidence).toBe("low_insufficient_history");
    expect(assessment.reasonCode).toBe("insufficient_history_for_user_relative_baseline");
    expect(describeEnergyVariabilityNudgeV3(assessment)).toBeNull();
  });

  it("is conservative with no historical data at all (null), not just short history", () => {
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", 1.3), day("d3", 1.5)],
      historicalDailyDeviations: null,
    });
    expect(assessment.hasSufficientHistoricalBaseline).toBe(false);
    expect(assessment.nudgeWarranted).toBe(false);
  });

  it("never treats distance from the protocol target as a completeness signal — 1,500/2,500/4,000 kcal intake all evaluate purely as a deviation ratio, not a validity flag", () => {
    // The exact deviation ratios below correspond to the same protocol-
    // relative distance regardless of the absolute kcal value — this module
    // never sees or reasons about the raw kcal number, only the ratio
    // already computed relative to the current protocol, and every one of
    // these paired days is treated as equally "complete" evidence.
    const lowIntakeDay = day("d1", -1.4);   // e.g. 1,500 kcal vs a higher target
    const midIntakeDay = day("d2", 0.05);   // e.g. 2,500 kcal at target
    const highIntakeDay = day("d3", 1.6);   // e.g. 4,000 kcal vs a lower target
    for (const single of [lowIntakeDay, midIntakeDay, highIntakeDay]) {
      const assessment = assessEnergyVariabilityV3({
        periodDailyDeviations: [single, day("d4", 0.0), day("d5", 0.05)],
        historicalDailyDeviations: baselineHistory(),
      });
      // Each is read as paired, valid evidence — never marked incomplete or
      // excluded for being far from target.
      expect(assessment.pairedDayCount).toBe(3);
    }
  });

  it("infers no intent or forgotten-meal language in its output text, even for a strong pattern", () => {
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.9), day("d2", 1.8), day("d3", 1.85), day("d4", 1.7)],
      historicalDailyDeviations: baselineHistory(),
    });
    const text = describeEnergyVariabilityNudgeV3(assessment) ?? "";
    expect(text).not.toMatch(/forgot|forgotten|intent|intentional|lazy|cheat/iu);
  });

  it("does not classify a single high or low day as good or bad purely from target distance", () => {
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [day("d1", 1.4), day("d2", 0.0), day("d3", 0.0)],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(assessment.nudgeWarranted).toBe(false);
    expect(describeEnergyVariabilityNudgeV3(assessment)).toBeNull();
  });

  it("excludes unpaired days from both the period and historical denominators", () => {
    const assessment = assessEnergyVariabilityV3({
      periodDailyDeviations: [
        day("d1", 1.4), day("d2", 1.3), day("d3", 1.5),
        day("d4", null, false), day("d5", null, false),
      ],
      historicalDailyDeviations: baselineHistory(),
    });
    expect(assessment.pairedDayCount).toBe(3);
  });
});
