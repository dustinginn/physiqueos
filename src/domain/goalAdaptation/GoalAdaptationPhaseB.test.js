import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { calibrateEnergy } from "./EnergyCalibrationV1.js";
import { buildAdaptationOptions, revalidateRecommendation } from "./AdaptationOptionsV1.js";
import { evaluateGoalAdaptationPhaseB } from "./GoalAdaptationPhaseBEvaluator.js";
import { GOAL_ADAPTATION_POLICY_V1 } from "./GoalAdaptationPolicyV1.js";
import { runGoalAdaptationScenarios } from "./scenarios/runGoalAdaptationScenarios.js";
import { GOAL_ADAPTATION_SCENARIOS_V1 } from "./scenarios/GoalAdaptationScenariosV1.js";
import { FOUNDER_BODY_OCT9, FOUNDER_CALIBRATION_PERIODS, FOUNDER_PLAN } from "./fixtures/founderLeanMassGolden.js";

const F1 = GOAL_ADAPTATION_SCENARIOS_V1.find((item) => item.id === "F1");
const founderPhaseB = (extra = {}) => evaluateGoalAdaptationPhaseB({ ...F1.inputs, body: FOUNDER_BODY_OCT9, calibrationPeriods: FOUNDER_CALIBRATION_PERIODS, plan: FOUNDER_PLAN, ...extra });

describe("Phase B policy stays provisional", () => {
  it("marks every Phase B number provisional and the policy inactive", () => {
    expect(GOAL_ADAPTATION_POLICY_V1.activation).toBe("off");
    expect(GOAL_ADAPTATION_POLICY_V1.phaseB.status).toBe("provisional_requires_founder_review");
  });
});

describe("Energy calibration from the user's own history", () => {
  it("calibrates the Founder in logged calories, excluding the sparse cut-era period", () => {
    const calibration = calibrateEnergy({ periods: FOUNDER_CALIBRATION_PERIODS, plannedActivityKcal: 800, asOf: "2026-10-09" });
    expect(calibration).toMatchObject({ status: "calibrated", unit: "logged_kcal_per_day", confidence: "moderate", periodsUsed: 3, methods: ["body_composition"] });
    expect(calibration.maintenanceKcal).toEqual({ estimate: 2117, low: 1977, high: 2258 });
    expect(calibration.periods[0]).toMatchObject({ used: false, reason: "intake_logging_too_sparse" });
  });

  it("reports insufficient history instead of imputing", () => {
    const sparse = FOUNDER_CALIBRATION_PERIODS.map((item) => ({ ...item, intakeDays: 9 }));
    expect(calibrateEnergy({ periods: sparse, asOf: "2026-10-09" })).toMatchObject({ status: "insufficient_history", maintenanceKcal: null });
    expect(calibrateEnergy({ periods: [{ start: "2026-10-01", end: "2026-10-09", days: 8, dTotal: 1, intakeDays: 8, intakeMean: 2500 }], asOf: "2026-10-09" }).periods[0].reason).toBe("period_too_short");
  });

  it("falls back to weight trend without a scan, with wider uncertainty", () => {
    const periods = [
      { start: "2026-01-04", end: "2026-02-01", days: 28, dTotal: 0.4, intakeDays: 26, intakeMean: 2400 },
      { start: "2026-02-01", end: "2026-03-01", days: 28, dTotal: 0.6, intakeDays: 27, intakeMean: 2450 },
    ];
    const calibration = calibrateEnergy({ periods, asOf: "2026-03-01" });
    expect(calibration.methods).toEqual(["weight_trend"]);
    expect(calibration.periods[1].uncertaintyKcal).toBeGreaterThan(130);
  });
});

describe("Ranked options (Founder Oct 9)", () => {
  const result = founderPhaseB();
  const options = result.options.options;

  it("ranks lean-out-first first and recommends it because it fits the limits and evidence supports it", () => {
    expect(options.map((item) => item.kind)).toEqual(["lean_out_first", "keep_building_revised_limits", "keep_current_plan", "custom"]);
    expect(options.filter((item) => item.recommended).map((item) => item.kind)).toEqual(["lean_out_first"]);
    expect(result.options.automaticApplicationAllowed).toBe(false);
  });

  it("keeps intake inside the safety floor and states the basis", () => {
    const top = options[0];
    expect(top.energy).toMatchObject({ status: "calibrated", intakeKcal: { low: 1600, high: 1775 }, activityKcal: 800, clamped: "limited_to_safe_bounds" });
    expect(top.energy.intakeKcal.low).toBeGreaterThanOrEqual(Math.round(2117 * 0.75));
    expect(top.timeline.phaseWeeks).toEqual({ low: 2, high: 7 });
    expect(top.validation.warnings).toContain("goal_date_not_reachable_with_this_option");
  });

  it("shows what keeping the build would cost and that the current plan breaks the limits", () => {
    const keepBuilding = options[1];
    expect(keepBuilding).toMatchObject({ fitsLimits: false, requires: { upperLimitAtLeast: 11.5, newGoalDate: true } });
    expect(keepBuilding.projected.bodyFatPercentAtCompletion).toEqual({ low: 10.4, high: 11.3 });
    expect(options[2]).toMatchObject({ kind: "keep_current_plan", fitsLimits: false });
    expect(options[2].timeline.goalCompletion).toEqual({ earliest: "2026-11-26", latest: "2026-12-28" });
  });

  it("shows options without recommending when energy cannot be calibrated", () => {
    const sparse = founderPhaseB({ calibrationPeriods: FOUNDER_CALIBRATION_PERIODS.map((item) => ({ ...item, intakeDays: 9 })) });
    expect(sparse.options.recommendedKind).toBeNull();
    expect(sparse.options.options[0].energy.status).toBe("requires_calibration");
  });

  it("never builds options when Phase A did not reach a proposal rung", () => {
    const midweek = GOAL_ADAPTATION_SCENARIOS_V1.find((item) => item.id === "F2");
    expect(evaluateGoalAdaptationPhaseB({ ...midweek.inputs, calibrationPeriods: FOUNDER_CALIBRATION_PERIODS, plan: FOUNDER_PLAN }).options).toBeNull();
    expect(buildAdaptationOptions({ rung: "none", archetype: "lean_mass_gain" }).options).toEqual([]);
  });
});

describe("Recommendation revalidation", () => {
  const shown = founderPhaseB().recommendationSnapshot;
  it("stays current with no material change", () => {
    expect(founderPhaseB({ asOf: "2026-10-12", shownRecommendation: shown }).revalidation).toMatchObject({ status: "current", approvalAllowed: true });
  });
  it("supersedes on new evidence or a calibration shift and blocks approval", () => {
    const moved = founderPhaseB({ guardrailMeasurement: { position: "above", deviation: 1.6 }, shownRecommendation: shown });
    expect(moved.revalidation).toMatchObject({ status: "superseded", approvalAllowed: false });
    expect(revalidateRecommendation({ recommendation: shown, current: { evidenceFingerprint: shown.evidenceFingerprint, calibration: { maintenanceKcal: { estimate: 2300 } }, options: { recommendedKind: "lean_out_first" } }, asOf: "2026-10-10" }).reasons).toEqual(["energy_calibration_shifted"]);
  });
  it("expires after the age limit", () => {
    expect(founderPhaseB({ asOf: "2026-10-30", shownRecommendation: shown }).revalidation).toMatchObject({ status: "expired_needs_refresh", approvalAllowed: false });
  });
});

describe("Accepted Phase 0/A scenario decisions are preserved", () => {
  it("matches the Founder-accepted results for all 26 scenarios", () => {
    const accepted = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "scenarios/accepted/phaseAAcceptedDecisionsV1.json"), "utf8"));
    const run = runGoalAdaptationScenarios();
    expect(Object.keys(accepted.decisions)).toHaveLength(26);
    for (const [id, decision] of Object.entries(accepted.decisions)) {
      const result = run.results.find((item) => item.id === id);
      for (const [key, value] of Object.entries(decision)) expect([id, key, result.actual[key]]).toEqual([id, key, value]);
    }
  });
});
