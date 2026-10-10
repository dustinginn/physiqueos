// Phase B (dormant): evidence-calibrated energy balance.
//
// Estimates the user's maintenance intake in the calories they actually log,
// from periods bounded by two body-composition (or weight) measurements:
//   maintenance = mean logged intake − energy stored in the period / days
// Stored energy uses fat and lean energy densities when a scan exists, and a
// mixed weight-change density otherwise (wider uncertainty). Because the
// estimate is expressed in logged calories, a consistent logging bias cancels.
// Periods with sparse intake logging are excluded, never imputed.

import { GOAL_ADAPTATION_POLICY_V1 } from "./GoalAdaptationPolicyV1.js";
import { daysBetween } from "./ScheduleCorrectionV1.js";

export const CalibrationStatus = Object.freeze({ CALIBRATED: "calibrated", INSUFFICIENT_HISTORY: "insufficient_history" });

export function calibrateEnergy({ periods = [], plannedActivityKcal = null, asOf, policy = GOAL_ADAPTATION_POLICY_V1 } = {}) {
  const rules = policy.phaseB;
  const density = rules.energyDensityKcalPerLb;
  const error = rules.measurementError;
  const assessed = [...periods].sort((a, b) => a.end.localeCompare(b.end)).map((period) => {
    const days = Number(period.days ?? daysBetween(period.start, period.end));
    const coverage = days > 0 ? Number(period.intakeDays ?? 0) / days : 0;
    const base = { start: period.start, end: period.end, days, intakeCoverage: round(coverage, 2), intakeMean: number(period.intakeMean), activityMean: number(period.activityMean) };
    if (days < rules.calibration.minimumPeriodDays) return { ...base, used: false, reason: "period_too_short" };
    if (coverage < rules.calibration.minimumIntakeCoverage || !(base.intakeMean > 0)) return { ...base, used: false, reason: "intake_logging_too_sparse" };
    const composition = number(period.dFat) != null && number(period.dLean) != null;
    const storedPerDay = composition
      ? (period.dFat * density.fat + period.dLean * density.lean) / days
      : number(period.dTotal) != null ? (period.dTotal * (period.dTotal >= 0 ? density.mixedWeightGain : density.mixedWeightLoss)) / days : null;
    if (storedPerDay == null) return { ...base, used: false, reason: "no_outcome_measurement" };
    const measurementErrorPerDay = composition
      ? Math.hypot(error.scanFatLb * density.fat, error.scanLeanLb * density.lean) / days
      : (1.5 * density.mixedWeightGain) / days;
    const intakeError = (base.intakeMean * error.intakeLoggingFraction) / Math.sqrt(Math.max(1, period.intakeDays));
    const maintenance = base.intakeMean - storedPerDay;
    const ageDays = Math.max(0, daysBetween(period.end, asOf));
    return {
      ...base,
      used: true,
      method: composition ? "body_composition" : "weight_trend",
      storedKcalPerDay: round(storedPerDay, 0),
      maintenanceKcal: round(maintenance, 0),
      restingPlusTefKcal: base.activityMean != null ? round(maintenance - base.activityMean, 0) : null,
      uncertaintyKcal: round(measurementErrorPerDay + intakeError, 0),
      weight: coverage * 0.5 ** (ageDays / rules.calibration.recencyHalfLifeDays),
    };
  });
  const used = assessed.filter((item) => item.used).slice(-rules.calibration.maximumPeriods);
  if (!used.length) {
    return Object.freeze({ status: CalibrationStatus.INSUFFICIENT_HISTORY, maintenanceKcal: null, confidence: "none", periods: assessed, note: "not_enough_logged_intake_between_measurements" });
  }
  const normalize = plannedActivityKcal != null && used.every((item) => item.restingPlusTefKcal != null);
  const values = used.map((item) => normalize ? item.restingPlusTefKcal + plannedActivityKcal : item.maintenanceKcal);
  const totalWeight = used.reduce((sum, item) => sum + item.weight, 0);
  const estimate = used.reduce((sum, item, index) => sum + values[index] * item.weight, 0) / totalWeight;
  const meanUncertainty = used.reduce((sum, item) => sum + item.uncertaintyKcal, 0) / used.length;
  const spread = Math.max(...values) - Math.min(...values);
  const halfWidth = Math.max(spread / 2, meanUncertainty / 2);
  const c = rules.calibration.confidence;
  const confidence = used.length >= c.minimumPeriodsForModerate && spread <= c.highMaxSpreadKcal ? "high"
    : used.length >= c.minimumPeriodsForModerate && spread <= c.moderateMaxSpreadKcal ? "moderate" : "low";
  return Object.freeze({
    status: CalibrationStatus.CALIBRATED,
    unit: "logged_kcal_per_day",
    maintenanceKcal: { estimate: round(estimate, 0), low: round(estimate - halfWidth, 0), high: round(estimate + halfWidth, 0) },
    atActivityKcal: normalize ? plannedActivityKcal : null,
    confidence,
    spreadKcal: round(spread, 0),
    periodsUsed: used.length,
    methods: [...new Set(used.map((item) => item.method))],
    periods: assessed.map(({ weight, ...rest }) => ({ ...rest, weight: weight == null ? undefined : round(weight, 3) })),
    note: normalize ? "activity_normalized_to_planned_activity" : "not_activity_normalized",
  });
}

function number(value) { return value == null || !Number.isFinite(Number(value)) ? null : Number(value); }
function round(value, digits = 2) { const f = 10 ** digits; return Math.round(value * f) / f; }
