// Golden fixtures for Goal Adaptation Phase A, sanitized from the Founder's
// persisted V3 assessments (production read-only extraction 2026-10-10,
// Server 85a98025). Only trajectory numbers, guardrail aggregate states and
// weekly evidence counts are kept; no raw evidence values.

export const FOUNDER_GOAL = Object.freeze({
  id: "goal_build_lean_mass_founder_fixture",
  type: "build_lean_mass",
  timeline: Object.freeze({ startDate: "2026-07-19", targetDate: "2026-10-31", mode: "target_date", flexibility: null }),
  target: Object.freeze({ metric: "lean_mass", amount: 10, unit: "lb", direction: "increase" }),
});

export const LEAN_MASS_BUILD_PHASE_START = "2026-08-15";

// The V3 guardrail the production adapter derives from "Maintain approximately 8–9% body fat."
export const FOUNDER_BODY_FAT_V3_GUARDRAIL = Object.freeze({
  guardrailId: "guardrail_body_fat_fixture",
  metricCapability: "body_composition.body_fat_percentage",
  evaluation: { mode: "allowed_range", allowedRange: { min: 8, max: 9, approximate: true } },
  severityBands: [
    { status: "breached", minimumDeviation: 1.5 },
    { status: "pressured", minimumDeviation: 0.5 },
    { status: "watch", minimumDeviation: 0 },
  ],
});

const DEADLINE = "2026-10-31";
const SEPT_OUTLOOK = "2026-09-12";
const t = (forecastRemainingRequirement, discountedRate, rateRatio) => ({
  supported: true, kind: "scalar_target", fractionAchieved: 0.58, remainingRequirement: 4.2, forecastRemainingRequirement,
  discountedRate, rateRatio, timeRemainingDays: 49, deadlineAt: DEADLINE, scheduleState: "ahead_with_reserve",
});

// asOf is the Founder-local publication date of each artifact.
export const FOUNDER_V3_ASSESSMENTS = Object.freeze([
  { artifact: "weekly_briefing_2026-09-13_2026-09-19", family: "weekly_briefing", asOf: "2026-09-20", outlookAsOf: SEPT_OUTLOOK, trajectory: t(4.07, 0.101, 1.2156), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "photo_session_2026-09-19", family: "photo_event_briefing", asOf: "2026-09-20", outlookAsOf: SEPT_OUTLOOK, trajectory: t(4.07, 0.101, 1.2156), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "midweek_briefing_20260920_20260922", family: "midweek_briefing", asOf: "2026-09-23", outlookAsOf: SEPT_OUTLOOK, trajectory: t(4.012, 0.1022, 1.2475), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "weekly_briefing_2026-09-20_2026-09-26", family: "weekly_briefing", asOf: "2026-09-27", outlookAsOf: SEPT_OUTLOOK, trajectory: t(3.933, 0.1037, 1.2922), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "midweek_briefing_20260927_20260929", family: "midweek_briefing", asOf: "2026-09-30", outlookAsOf: SEPT_OUTLOOK, trajectory: t(3.872, 0.1049, 1.3275), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "monthly_briefing_202609", family: "monthly_briefing", asOf: "2026-10-01", outlookAsOf: SEPT_OUTLOOK, trajectory: t(3.872, 0.1049, 1.3275), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "weekly_briefing_2026-09-27_2026-10-03", family: "weekly_briefing", asOf: "2026-10-04", outlookAsOf: SEPT_OUTLOOK, trajectory: t(3.789, 0.1065, 1.377), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  { artifact: "midweek_briefing_20261004_20261006", family: "midweek_briefing", asOf: "2026-10-07", outlookAsOf: SEPT_OUTLOOK, trajectory: t(3.725, 0.1077, 1.4162), guardrailPosition: "within", baseAction: "continue_current_strategy" },
  {
    artifact: "dexa_event_2026_10_09", family: "dexa_event_briefing", asOf: "2026-10-09", outlookAsOf: "2026-10-09",
    trajectory: { supported: true, kind: "scalar_target", fractionAchieved: 0.71, remainingRequirement: 2.9, forecastRemainingRequirement: 2.9, discountedRate: 0.0337, rateRatio: 0.2557, timeRemainingDays: 22, deadlineAt: DEADLINE, scheduleState: "at_risk" },
    // Aggregate state "pressured", above the range (published briefing: above the 8–9% range).
    guardrailPosition: "above", guardrailDeviation: 0.5, baseAction: "continue_with_guardrail_monitoring",
  },
]);

// Weekly evidence coverage (distinct days per Sunday-start week), production read-only.
export const FOUNDER_WEEKLY_COVERAGE = Object.freeze({
  "2026-09-13": { body_weight: 7, training_performance: 1, daily_evidence: 7 },
  "2026-09-20": { body_weight: 5, training_performance: 3, nutrition_intake: 6, activity_energy: 6, daily_evidence: 5 },
  "2026-09-27": { body_weight: 7, training_performance: 3, nutrition_intake: 7, activity_energy: 7, daily_evidence: 7 },
  "2026-10-04": { body_weight: 6, training_performance: 3, nutrition_intake: 6, activity_energy: 6, daily_evidence: 6 },
  "2026-09-06": { body_weight: 6, training_performance: 3, daily_evidence: 7 },
  "2026-08-30": { body_weight: 7, training_performance: 6, daily_evidence: 7 },
  "2026-08-23": { body_weight: 7, training_performance: 2, daily_evidence: 7 },
  "2026-08-16": { body_weight: 7, training_performance: 1, daily_evidence: 7 },
});

// HealthKit intake vs the 2,500 kcal Phase 2 target (±10%), from Sep 20 (HealthKit nutrition graduation).
export const FOUNDER_INTAKE_ADHERENCE_WEEKS = Object.freeze([
  { weekStart: "2026-09-20", measuredDays: 6, withinDays: 4, overDays: 1, underDays: 1 },
  { weekStart: "2026-09-27", measuredDays: 7, withinDays: 7, overDays: 0, underDays: 0 },
  { weekStart: "2026-10-04", measuredDays: 6, withinDays: 5, overDays: 0, underDays: 1 },
]);

// Only complete Sunday–Saturday weeks that ended before `asOf` are visible.
const weekEnded = (weekStart, asOf) => {
  const end = new Date(`${weekStart}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 7);
  return end.toISOString().slice(0, 10) <= asOf;
};

export function coverageSignalsAsOf(asOf, coverage = FOUNDER_WEEKLY_COVERAGE, windowWeeks = 4) {
  const weeks = Object.keys(coverage).filter((week) => weekEnded(week, asOf)).sort().slice(-windowWeeks);
  const domains = new Set(weeks.flatMap((week) => Object.keys(coverage[week])));
  const signals = {};
  for (const domain of domains) {
    signals[domain] = {
      daysPerWeek: weeks.map((week) => coverage[week][domain]).filter((value) => value != null),
      source: ["nutrition_intake", "activity_energy"].includes(domain) ? "healthkit" : "manual",
    };
  }
  return signals;
}

export function adherenceWeeksAsOf(asOf, weeks = FOUNDER_INTAKE_ADHERENCE_WEEKS) {
  return weeks.filter((week) => weekEnded(week.weekStart, asOf));
}
