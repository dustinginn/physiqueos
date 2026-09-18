// Confidence V3 — Stage A/Task 2. Deadline-aware, evidence-type-agnostic pace.
//
// Distinct from `GoalAttainabilityService.pace()`, which asks "are we inside
// the range an ACCEPTED TRAJECTORY expected for today" and degrades to
// `unassessable` whenever no accepted trajectory is on file. This module
// asks a narrower, always-computable question: "if the rate of change we
// just measured continued, would we reach the target before, on, or after
// the deadline?" It needs only two comparable measurements and a deadline —
// never a trajectory, and never a specific evidence type. A future strength
// Goal's 1RM history or a lab-panel Goal's biomarker history can use the
// exact same function.
//
// This is a FORECAST signal, not a promise: nothing here claims linear
// biological progress is guaranteed, and every output that would imply that
// is deliberately gated to `null`/`unassessable` rather than a fabricated
// number when the inputs cannot support the claim.

export const OBSERVED_OUTCOME_PACE_VERSION = "observed_outcome_pace_v1";

export const PaceState = Object.freeze({
  AHEAD: "ahead",
  ON_PACE: "on_pace",
  BEHIND: "behind",
  STALLED: "stalled",
  REGRESSING: "regressing",
  UNASSESSABLE: "unassessable",
});

// Below this interval length, a single-day hydration/glycogen/measurement
// swing could dominate the computed rate — the reading is excluded from pace
// math entirely rather than discounted, because a rate computed over too
// short a window is not merely uncertain, it is not a rate at all.
// CALIBRATION STATUS: illustrative (chosen as "long enough that routine
// day-to-day noise averages out for a moderate-uncertainty direct
// measurement"), not empirically fit.
export const DEFAULT_MINIMUM_COMPARABLE_INTERVAL_DAYS = 14;

// paceRatio = observedOutcomePace / requiredRemainingPace. Named, monotonic
// thresholds — not tuned to any specific fixture. CALIBRATION STATUS:
// illustrative.
export const PACE_RATIO_THRESHOLDS = Object.freeze({
  ahead: 1.5,
  onPaceMin: 0.85,
  behindMin: 0.4,
});

/**
 * @param observedInterval  { priorValue, priorObservedOn, currentValue,
 *                            currentObservedOn } — an already-resolved,
 *                            evidence-type-agnostic comparable interval.
 *                            Resolving WHICH prior reading is "the latest
 *                            comparable one" for a given evidence type is a
 *                            per-domain adapter's job, deliberately outside
 *                            this module — this function only ever sees the
 *                            two bounded numbers/dates once resolved.
 * @param direction          "increase" | "decrease" — which way progress
 *                            counts as forward, mirroring
 *                            `GoalProgressContextService`'s existing
 *                            `directionalChange` convention.
 * @param remainingGoalGap   remaining distance to target, in the Goal's own
 *                            unit; may be <= 0 if the Goal is already met.
 * @param remainingDays      days until deadline; null when the Goal has no
 *                            deadline (deadline-optional capability).
 */
export function evaluateObservedOutcomePace({
  observedInterval = null,
  direction = "increase",
  remainingGoalGap = null,
  remainingDays = null,
  minimumComparableIntervalDays = DEFAULT_MINIMUM_COMPARABLE_INTERVAL_DAYS,
} = {}) {
  const base = {
    schemaVersion: OBSERVED_OUTCOME_PACE_VERSION,
    observedOutcomePace: null,
    requiredRemainingPace: null,
    paceRatio: null,
    projectedCompletionOffsetDays: null,
    paceState: PaceState.UNASSESSABLE,
  };

  if (!observedInterval) return Object.freeze(base);
  const intervalDays = daysBetween(observedInterval.priorObservedOn, observedInterval.currentObservedOn);
  if (!Number.isFinite(intervalDays) || intervalDays < minimumComparableIntervalDays) {
    return Object.freeze(base);
  }
  const delta = directionalChange(observedInterval.priorValue, observedInterval.currentValue, direction);
  if (delta == null) return Object.freeze(base);

  const observedOutcomePace = { value: round(delta / intervalDays), unit: "per_day", intervalDays };

  // Goal already met by the current reading — trivially "ahead," regardless
  // of the numeric pace, and no division against a non-positive gap is
  // attempted.
  if (Number.isFinite(remainingGoalGap) && remainingGoalGap <= 0) {
    return Object.freeze({
      ...base,
      observedOutcomePace,
      paceState: PaceState.AHEAD,
      projectedCompletionOffsetDays: Number.isFinite(remainingDays) ? remainingDays : null,
    });
  }

  if (delta < 0) return Object.freeze({ ...base, observedOutcomePace, paceState: PaceState.REGRESSING });
  if (delta === 0) return Object.freeze({ ...base, observedOutcomePace, paceState: PaceState.STALLED });

  // No deadline: pace-to-deadline is not a meaningful concept without one.
  // The positive rate itself is still reported (it may be useful elsewhere,
  // e.g. narrative), but paceState/paceRatio/projection all stay
  // unassessable rather than inventing an "ahead of nothing" claim.
  if (!Number.isFinite(remainingDays) || remainingDays <= 0 || !Number.isFinite(remainingGoalGap)) {
    return Object.freeze({ ...base, observedOutcomePace });
  }

  const requiredRemainingPace = { value: round(remainingGoalGap / remainingDays), unit: "per_day" };
  if (requiredRemainingPace.value <= 0) {
    return Object.freeze({ ...base, observedOutcomePace, requiredRemainingPace, paceState: PaceState.AHEAD });
  }

  const paceRatio = round(observedOutcomePace.value / requiredRemainingPace.value);
  const projectedCompletionOffsetDays = round(remainingDays - remainingGoalGap / observedOutcomePace.value);
  const paceState = classifyPaceState(paceRatio);

  return Object.freeze({
    schemaVersion: OBSERVED_OUTCOME_PACE_VERSION,
    observedOutcomePace,
    requiredRemainingPace,
    paceRatio,
    projectedCompletionOffsetDays,
    paceState,
  });
}

function classifyPaceState(paceRatio) {
  if (paceRatio >= PACE_RATIO_THRESHOLDS.ahead) return PaceState.AHEAD;
  if (paceRatio >= PACE_RATIO_THRESHOLDS.onPaceMin) return PaceState.ON_PACE;
  if (paceRatio >= PACE_RATIO_THRESHOLDS.behindMin) return PaceState.BEHIND;
  return PaceState.STALLED;
}

function directionalChange(priorValue, currentValue, direction) {
  if (![priorValue, currentValue].every((value) => Number.isFinite(value))) return null;
  return direction === "decrease" ? priorValue - currentValue : currentValue - priorValue;
}
function daysBetween(startIso, endIso) {
  const start = Date.parse(`${String(startIso ?? "").slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endIso ?? "").slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / 86_400_000);
}
function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}
