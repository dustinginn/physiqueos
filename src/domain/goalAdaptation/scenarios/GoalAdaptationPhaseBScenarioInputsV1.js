// Phase B inputs and expectations for the accepted scenario set, plus
// Phase B-specific scenarios. Founder rows reuse sanitized production
// aggregates; all other inputs are synthetic.

import { FOUNDER_BODY_OCT9, FOUNDER_CALIBRATION_PERIODS, FOUNDER_PLAN } from "../fixtures/founderLeanMassGolden.js";

const leanGainPeriods = [
  { start: "2026-01-04", end: "2026-02-01", days: 28, dLean: 1.0, dFat: 0.8, intakeDays: 26, intakeMean: 2800, activityDays: 28, activityMean: 600 },
  { start: "2026-02-01", end: "2026-03-01", days: 28, dLean: 0.9, dFat: 1.0, intakeDays: 27, intakeMean: 2850, activityDays: 28, activityMean: 600 },
];
const cutPeriods = [
  { start: "2026-01-04", end: "2026-02-01", days: 28, dLean: -0.3, dFat: -3.0, intakeDays: 27, intakeMean: 2100, activityDays: 28, activityMean: 700 },
  { start: "2026-02-01", end: "2026-03-01", days: 28, dLean: -0.2, dFat: -3.2, intakeDays: 26, intakeMean: 2050, activityDays: 28, activityMean: 700 },
];
const weightOnlyPeriods = (intakeA, intakeB, dA, dB, activity) => [
  { start: "2026-01-04", end: "2026-02-01", days: 28, dTotal: dA, intakeDays: 26, intakeMean: intakeA, activityDays: 28, activityMean: activity },
  { start: "2026-02-01", end: "2026-03-01", days: 28, dTotal: dB, intakeDays: 27, intakeMean: intakeB, activityDays: 28, activityMean: activity },
];
const founder = { body: FOUNDER_BODY_OCT9, calibrationPeriods: FOUNDER_CALIBRATION_PERIODS, plan: FOUNDER_PLAN };
const leanUser = (body) => ({ body, calibrationPeriods: leanGainPeriods, plan: { intakeKcal: 2800, activityKcal: 600 } });

export const PHASE_B_SCENARIO_INPUTS = Object.freeze({
  F1: { inputs: founder, expected: { topOption: "lean_out_first", recommendedKind: "lean_out_first", calibration: "calibrated", calibrationConfidence: "moderate", topIntake: { low: 1600, high: 1775 }, topClamped: "limited_to_safe_bounds", revisedUpperAtLeast: 11.5, currentPlanFits: false } },
  F2: { inputs: founder, expected: { options: null } },
  F3: { inputs: founder, expected: { options: null } },
  F4: { inputs: founder, expected: { options: null } },
  M1: { inputs: leanUser({ weightLb: 182, leanLb: 156, fatLb: 22.6, bodyFatPct: 12.4 }), expected: { options: null } },
  M2: { inputs: leanUser({ weightLb: 178, leanLb: 157, fatLb: 19.0, bodyFatPct: 10.7 }), expected: { options: null } },
  M3: { inputs: leanUser({ weightLb: 178, leanLb: 157.4, fatLb: 18.6, bodyFatPct: 10.4 }), expected: { topOption: "adjust_energy", recommendedKind: "adjust_energy", calibration: "calibrated", topIntake: { low: 2900, high: 3000 } } },
  M4: { inputs: { calibrationPeriods: weightOnlyPeriods(2700, 2720, 0.4, 0.3, 600), plan: { intakeKcal: 2750, activityKcal: 600 } }, expected: { options: null } },
  M5: { inputs: { calibrationPeriods: weightOnlyPeriods(2700, 2720, 0.2, 0.1, 600), plan: { intakeKcal: 2700, activityKcal: 600 } }, expected: { topOption: "adjust_energy", recommendedKind: "adjust_energy", calibrationMethod: "weight_trend", topIntake: { low: 2800, high: 2900 } } },
  L1: { inputs: { calibrationPeriods: cutPeriods, plan: { intakeKcal: 2050, activityKcal: 700 } }, expected: { options: null } },
  L2: { inputs: { calibrationPeriods: cutPeriods, plan: { intakeKcal: 2050, activityKcal: 700 } }, expected: { topOption: "extend_date", recommendedKind: "extend_date" } },
  L3: { inputs: { body: { weightLb: 190, leanLb: 148.4, fatLb: 41.6, bodyFatPct: 21.9 }, calibrationPeriods: cutPeriods, plan: { intakeKcal: 1900, activityKcal: 700 } }, expected: { topOption: "slow_the_cut", recommendedKind: "slow_the_cut", topIntake: { low: 2050, high: 2150 } } },
  S1: { inputs: {}, expected: { topOption: "deload_then_progress", recommendedKind: "deload_then_progress", topEnergy: "not_applicable" } },
  S2: { inputs: {}, expected: { options: null } },
  MT1: { inputs: { calibrationPeriods: weightOnlyPeriods(2400, 2450, 0.4, 1.2, 500), plan: { intakeKcal: 2400, activityKcal: 500 } }, expected: { topOption: "tighten_briefly", recommendedKind: "tighten_briefly", calibrationMethod: "weight_trend" } },
  MT2: { inputs: { calibrationPeriods: weightOnlyPeriods(2400, 2450, 0.0, 0.2, 500), plan: { intakeKcal: 2400, activityKcal: 500 } }, expected: { options: null } },
  C1: { inputs: leanUser({ weightLb: 184, leanLb: 157.7, fatLb: 26.3, bodyFatPct: 14.3 }), expected: { options: null } },
  E1: { inputs: leanUser({ weightLb: 184, leanLb: 156.6, fatLb: 27.4, bodyFatPct: 14.9 }), expected: { options: null } },
  A1: { inputs: leanUser({ weightLb: 182, leanLb: 158.2, fatLb: 23.8, bodyFatPct: 13.1 }), expected: { options: null } },
  A2: { inputs: { ...leanUser({ weightLb: 186, leanLb: 156.6, fatLb: 29.4, bodyFatPct: 15.8 }), observedIntakeKcal: 3150 }, expected: { topOption: "realistic_targets", recommendedKind: "realistic_targets" } },
  G1: { inputs: founder, expected: { topOption: "lean_out_first", recommendedKind: "lean_out_first" } },
  T1: { inputs: leanUser({ weightLb: 183, leanLb: 156.6, fatLb: 26.4, bodyFatPct: 14.4 }), expected: { topOption: "extend_leaning", recommendedKind: "extend_leaning" } },
  GA1: { inputs: leanUser({ weightLb: 186, leanLb: 161.4, fatLb: 24.6, bodyFatPct: 13.2 }), expected: { topOption: "maintain", recommendedKind: "maintain", topEnergy: "calibrated" } },
  D1: { inputs: founder, expected: { topOption: "lean_out_first", recommendedKind: "lean_out_first" } },
  D2: { inputs: { ...founder, body: { weightLb: 181.6, leanLb: 155.2, fatLb: 20.4, bodyFatPct: 11.2 } }, expected: { topOption: "lean_out_first", recommendedKind: "lean_out_first" } },
  P1: { inputs: founder, expected: { topOption: "lean_out_first", recommendedKind: "lean_out_first" } },
});

// Phase B-specific scenarios built on the Founder Oct 9 case.
export const PHASE_B_EXTRA_SCENARIOS = Object.freeze([
  {
    id: "B1", baseScenario: "F1", category: "mass_building", source: "synthetic",
    title: "Same Oct 9 situation, but intake logging too sparse to calibrate",
    situation: "Only 8–12 logged days per 4-week period. The engine still shows the options but cannot give calorie targets, so it recommends none.",
    phaseB: { inputs: { ...founder, calibrationPeriods: FOUNDER_CALIBRATION_PERIODS.map((p) => ({ ...p, intakeDays: 9 })) } },
    expected: { calibration: "insufficient_history", topOption: "lean_out_first", recommendedKind: null, topEnergy: "requires_calibration" },
  },
  {
    id: "B2", baseScenario: "F1", category: "mass_building", source: "founder_production_sanitized",
    title: "Revalidation on entry three days later, nothing new",
    situation: "The Oct 9 recommendation is opened again on Oct 12 with no new scan or guardrail change.",
    phaseB: { inputs: founder, asOf: "2026-10-12", shownFrom: { asOf: "2026-10-09" } },
    expected: { revalidation: "current", approvalAllowed: true },
  },
  {
    id: "B3", baseScenario: "D2", category: "mass_building", source: "synthetic",
    title: "Approval attempted after a new scan changed the evidence",
    situation: "The user opens Approve after a Nov 6 scan that moved body fat further above range. The shown recommendation is superseded and must be refreshed.",
    phaseB: { inputs: { ...founder, body: { weightLb: 181.6, leanLb: 155.2, fatLb: 20.4, bodyFatPct: 11.2 } }, shownFrom: { scenario: "F1", asOf: "2026-10-09" } },
    expected: { revalidation: "superseded", approvalAllowed: false },
  },
  {
    id: "B4", baseScenario: "F1", category: "mass_building", source: "founder_production_sanitized",
    title: "Recommendation left open for three weeks",
    situation: "The Oct 9 recommendation is opened on Oct 30 with no new evidence. It is older than the 14-day limit and needs a refresh before approval.",
    phaseB: { inputs: founder, asOf: "2026-10-30", shownFrom: { asOf: "2026-10-09" } },
    expected: { revalidation: "expired_needs_refresh", approvalAllowed: false },
  },
]);
