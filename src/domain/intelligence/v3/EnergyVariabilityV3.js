// Period-level Energy variability/predictability, deterministic and reusable
// across every recurring cadence. This is a genuinely separate concept from
// evidence completeness (whether a day's data exists and how trustworthy its
// source is — see nutritionDayAuthority.js/EnergyEvidenceCompletenessService.js)
// and from protocol-relative interpretation of a single day (whether one
// day's intake sits above/below the current target — see
// EnergyAmbiguityV3.js's per-dimension `findings`). Neither of those is a
// completeness signal on its own, and this module must never become one
// either: a nutrition observation is equally "complete" whether intake was
// 1,500, 2,500, or 4,000 kcal — distance from the protocol target never
// marks a day incomplete, and this module only ever reads deviation ratios
// that are already computed relative to the current protocol.
//
// What this module answers instead: does the PATTERN of protocol-relative
// deviation across the period — not any single day — materially reduce how
// predictable the period's overall energy balance is, or risk strategic
// drift? Variability can run in either direction (consistently high or
// consistently low); this module never assumes one direction is universally
// more concerning than the other. An isolated single high or low day never
// triggers a nudge by itself: only a repeated, direction-consistent pattern
// across enough of the period does, and only when — given this person's own
// recent history — that rate is genuinely unusual for them, not against a
// fixed universal rate. With insufficient history for a user-relative
// baseline, this module is conservative: no nudge, low confidence, rather
// than falling back to a universal behavioral assumption.
//
// This module infers nothing about intent (it never says a day was
// "forgotten" or characterizes a single day as good/bad from target
// distance alone) — it only describes the pattern and its consequence for
// predictability.

export const EnergyVariabilityDirection = Object.freeze({
  UPWARD: "upward",
  DOWNWARD: "downward",
});

const DEFAULT_MINIMUM_HISTORICAL_DAY_COUNT = 14;
// A day counts as "off-plan" for pattern purposes once its deviation clears
// the protocol's own tolerance band (deviationRatio expressed in tolerance-
// ratio units, matching the existing protocol-relative tolerance concept
// already used for a single day's finding.state — not an invented number).
const DEFAULT_PATTERN_DAY_TOLERANCE_RATIO = 1;
// A period needs at least this many off-plan days, in the SAME direction,
// before it is treated as a repeated pattern rather than isolated noise —
// and it must be at least half of the period's paired days, so a pattern
// claim is never based on a minority of the days actually observed.
const DEFAULT_MINIMUM_PATTERN_DAY_COUNT = 3;
// With a sufficient historical baseline, "unusual for this person" requires
// both a meaningful relative increase and a meaningful absolute increase in
// the off-plan rate — avoiding a nudge triggered by a trivial relative jump
// (e.g. 1 of 7 days historically vs. 2 of 7 now).
const UNUSUAL_RELATIVE_MULTIPLIER = 1.5;
const UNUSUAL_ABSOLUTE_RATIO_DELTA = 0.15;

function pairedDeviationDays(dailyDeviations) {
  return (dailyDeviations ?? []).filter((day) =>
    day?.hasPairedEvidence && Number.isFinite(day.deviationRatio));
}

function offPlanDays(dailyDeviations, toleranceRatio) {
  return pairedDeviationDays(dailyDeviations)
    .filter((day) => Math.abs(day.deviationRatio) > toleranceRatio);
}

// `periodDailyDeviations`/`historicalDailyDeviations`: arrays of
// `{ date, deviationRatio, hasPairedEvidence }`, one entry per calendar day
// in the period/history window. `deviationRatio` is the day's own energy-
// balance deviation from the current protocol target, already expressed in
// tolerance-ratio units (positive = above plan, negative = below plan) —
// the same protocol-relative quantity `EnergyAmbiguityV3.js` computes per
// dimension, just carried per-day instead of aggregated for the window.
export function assessEnergyVariabilityV3({
  periodDailyDeviations,
  historicalDailyDeviations = null,
  minimumHistoricalDayCount = DEFAULT_MINIMUM_HISTORICAL_DAY_COUNT,
  patternDayToleranceRatio = DEFAULT_PATTERN_DAY_TOLERANCE_RATIO,
  minimumPatternDayCount = DEFAULT_MINIMUM_PATTERN_DAY_COUNT,
} = {}) {
  const paired = pairedDeviationDays(periodDailyDeviations);
  const offPlan = offPlanDays(periodDailyDeviations, patternDayToleranceRatio);
  const upward = offPlan.filter((day) => day.deviationRatio > 0);
  const downward = offPlan.filter((day) => day.deviationRatio < 0);
  const dominantDirection = upward.length > downward.length
    ? EnergyVariabilityDirection.UPWARD
    : downward.length > upward.length ? EnergyVariabilityDirection.DOWNWARD : null;
  const dominantDayCount = dominantDirection === EnergyVariabilityDirection.UPWARD
    ? upward.length : dominantDirection === EnergyVariabilityDirection.DOWNWARD
      ? downward.length : 0;
  const meetsPatternThreshold = Boolean(dominantDirection) &&
    dominantDayCount >= minimumPatternDayCount &&
    dominantDayCount >= Math.ceil(paired.length / 2);

  const historicalPaired = pairedDeviationDays(historicalDailyDeviations);
  const hasSufficientHistoricalBaseline =
    historicalPaired.length >= minimumHistoricalDayCount;
  const historicalOffPlanRatio = hasSufficientHistoricalBaseline
    ? offPlanDays(historicalDailyDeviations, patternDayToleranceRatio).length /
      historicalPaired.length
    : null;
  const currentOffPlanRatio = paired.length ? offPlan.length / paired.length : 0;
  const isUnusualRelativeToHistory = hasSufficientHistoricalBaseline
    ? currentOffPlanRatio > historicalOffPlanRatio * UNUSUAL_RELATIVE_MULTIPLIER &&
      currentOffPlanRatio - historicalOffPlanRatio >= UNUSUAL_ABSOLUTE_RATIO_DELTA
    : null;

  // Conservative by construction: without a sufficient user-relative
  // baseline, never nudge — regardless of how the pattern looks against any
  // fixed/universal rate.
  const nudgeWarranted = hasSufficientHistoricalBaseline
    ? meetsPatternThreshold && isUnusualRelativeToHistory
    : false;

  const reasonCode = !paired.length ? "no_paired_evidence"
    : !meetsPatternThreshold ? "isolated_or_mixed_deviation_not_a_pattern"
      : !hasSufficientHistoricalBaseline ? "insufficient_history_for_user_relative_baseline"
        : isUnusualRelativeToHistory ? "repeated_pattern_reduces_predictability"
          : "within_this_persons_own_normal_range";

  return Object.freeze({
    schemaVersion: "energy_variability_v3",
    pairedDayCount: paired.length,
    offPlanDayCount: offPlan.length,
    dominantDirection,
    dominantDayCount,
    meetsPatternThreshold,
    hasSufficientHistoricalBaseline,
    historicalOffPlanRatio,
    currentOffPlanRatio: paired.length ? currentOffPlanRatio : null,
    isUnusualRelativeToHistory,
    nudgeWarranted,
    confidence: hasSufficientHistoricalBaseline ? "user_relative" : "low_insufficient_history",
    reasonCode,
  });
}

// A deterministic, direction-aware, decision-relevant coaching clause — a
// factual pattern statement and its consequence for predictability, never an
// inference about intent or a single day's value judgment. Returns null when
// no nudge is warranted (including the low-confidence/insufficient-history
// case), matching the engine-wide rule that an unwarranted claim renders
// nothing rather than a stand-in sentence.
export function describeEnergyVariabilityNudgeV3(assessment) {
  if (!assessment?.nudgeWarranted) return null;
  const directionPhrase = assessment.dominantDirection === EnergyVariabilityDirection.UPWARD
    ? "running above plan" : "running below plan";
  return `Energy has been ${directionPhrase} more often than usual for you recently, enough that the period's overall balance is less predictable than it has been.`;
}
