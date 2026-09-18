// Confidence V3 — Stage A. Direction-aware Guardrail interpretation.
//
// The V2 classifier (`DEXAEventContextService.classifyBodyFatGuardrail`) measures
// distance to the NEAREST edge with no concept of which edge, or which direction
// the value is moving. That is why a real Founder result — body fat entering an
// 8–9% range from 7.6% — rendered as "Near guardrail boundary": 8.1% is 0.1
// percentage points from the LOWER edge, and the classifier cannot tell that
// apart from being 0.1 points from the UPPER edge, or that arriving from below
// is the favorable direction for this Goal.
//
// This module separates three questions the old one conflated into one label:
//   guardrailState      — WHERE is the value right now (position only)?
//   guardrailTransition — WHICH WAY did it move to get here?
//   guardrailDirection  — does that movement help or hurt THIS Goal?
//
// `guardrailDirection` is the only field callers should branch scoring/narrative
// on. It requires the Goal's own `lowerBoundMeaning`/`upperBoundMeaning` to ever
// return "favorable" — this file contains no Goal-specific knowledge. Without
// declared meanings it degrades to the old symmetric behavior (never invents a
// favorable/unfavorable claim it cannot support), except that leaving a chosen
// range at all is treated as a generic caution by default — that is what
// "guardrail" already means, independent of any specific Goal's semantics.

export const GUARDRAIL_TRANSITION_VERSION = "guardrail_transition_v1";

export const GuardrailState = Object.freeze({
  BELOW_RANGE: "below_range",
  LOWER_THIRD: "lower_third",
  CENTRAL: "central",
  UPPER_THIRD: "upper_third",
  ABOVE_RANGE: "above_range",
  UNKNOWN: "unknown",
});

export const GuardrailTransition = Object.freeze({
  ENTERING_FROM_BELOW: "entering_from_below",
  ENTERING_FROM_ABOVE: "entering_from_above",
  RECEDING_FROM_LOWER_EDGE: "receding_from_lower_edge",
  RECEDING_FROM_UPPER_EDGE: "receding_from_upper_edge",
  DRIFTING_TOWARD_LOWER_EDGE: "drifting_toward_lower_edge",
  DRIFTING_TOWARD_UPPER_EDGE: "drifting_toward_upper_edge",
  STABLE: "stable",
  UNKNOWN: "unknown",
});

export const GuardrailDirection = Object.freeze({
  FAVORABLE: "favorable",
  NEUTRAL: "neutral",
  UNFAVORABLE: "unfavorable",
  UNKNOWN: "unknown",
});

// A value within this many range-units of an edge is still just "in that
// third" per `classifyGuardrailState` below; this constant only controls the
// degenerate zero-width-range guard, not boundary "nearness" (nearness is now
// expressed structurally via lower_third/upper_third, not a tolerance band).
const OUTSIDE_THIRDS_EPSILON = 1e-9;

/**
 * Position only. No history, no meaning — a pure function of one value
 * against one declared range. Returns `unknown` for any missing/degenerate
 * input rather than guessing.
 */
export function classifyGuardrailState(value, guardrail) {
  if (!isFiniteNumber(value) || !isValidRange(guardrail)) return GuardrailState.UNKNOWN;
  const { lowerBound, upperBound } = guardrail;
  if (value < lowerBound) return GuardrailState.BELOW_RANGE;
  if (value > upperBound) return GuardrailState.ABOVE_RANGE;
  const width = upperBound - lowerBound;
  if (width <= OUTSIDE_THIRDS_EPSILON) return GuardrailState.CENTRAL;
  const relativePosition = (value - lowerBound) / width;
  if (relativePosition <= 1 / 3) return GuardrailState.LOWER_THIRD;
  if (relativePosition >= 2 / 3) return GuardrailState.UPPER_THIRD;
  return GuardrailState.CENTRAL;
}

/**
 * Trajectory: which way did the value move relative to the range, from the
 * immediately preceding comparable measurement to this one. Requires both
 * values and a valid range; returns `unknown` otherwise rather than a
 * fabricated "stable".
 */
export function classifyGuardrailTransition(currentValue, priorValue, guardrail) {
  const currentState = classifyGuardrailState(currentValue, guardrail);
  const priorState = classifyGuardrailState(priorValue, guardrail);
  if (currentState === GuardrailState.UNKNOWN || priorState === GuardrailState.UNKNOWN) {
    return GuardrailTransition.UNKNOWN;
  }
  if (currentValue === priorValue) return GuardrailTransition.STABLE;
  const movedUp = currentValue > priorValue;

  const wasOutside = isOutside(priorState);
  const isNowOutside = isOutside(currentState);

  if (wasOutside && !isNowOutside) {
    return priorState === GuardrailState.BELOW_RANGE
      ? GuardrailTransition.ENTERING_FROM_BELOW
      : GuardrailTransition.ENTERING_FROM_ABOVE;
  }
  if (!wasOutside && isNowOutside) {
    return currentState === GuardrailState.BELOW_RANGE
      ? GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE
      : GuardrailTransition.DRIFTING_TOWARD_UPPER_EDGE;
  }
  if (wasOutside && isNowOutside) {
    // Still outside — report movement relative to the edge it is outside of,
    // regardless of whether it crossed to the other side (a jump from
    // below_range to above_range is rare and reported as drifting toward
    // whichever edge it now sits beyond).
    return currentState === GuardrailState.BELOW_RANGE
      ? (movedUp ? GuardrailTransition.RECEDING_FROM_LOWER_EDGE : GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE)
      : (movedUp ? GuardrailTransition.DRIFTING_TOWARD_UPPER_EDGE : GuardrailTransition.RECEDING_FROM_UPPER_EDGE);
  }
  // Both inside the range. Report movement toward/away from whichever edge
  // is now closer, using the tier change first and intra-tier direction
  // second so small in-tier moves are still meaningful.
  if (movedUp) {
    if (currentState === GuardrailState.UPPER_THIRD) return GuardrailTransition.DRIFTING_TOWARD_UPPER_EDGE;
    if (priorState === GuardrailState.LOWER_THIRD) return GuardrailTransition.RECEDING_FROM_LOWER_EDGE;
    return GuardrailTransition.STABLE;
  }
  if (currentState === GuardrailState.LOWER_THIRD) return GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE;
  if (priorState === GuardrailState.UPPER_THIRD) return GuardrailTransition.RECEDING_FROM_UPPER_EDGE;
  return GuardrailTransition.STABLE;
}

/**
 * The field callers actually branch on. Requires the Goal's declared
 * `lowerBoundMeaning`/`upperBoundMeaning` to ever say "favorable" — those are
 * optional, Goal-authored facts (see `GuardrailBoundaryMeaning`), never
 * inferred here. Leaving the chosen range is treated as a generic caution
 * ("unfavorable") by default: that is what choosing a range already means,
 * independent of which specific Goal chose it. This is the ONLY built-in
 * value judgment in this module, and it applies to every Goal identically.
 */
export function classifyGuardrailDirection({ currentValue, priorValue, guardrail } = {}) {
  const state = classifyGuardrailState(currentValue, guardrail);
  const transition = classifyGuardrailTransition(currentValue, priorValue, guardrail);
  if (state === GuardrailState.UNKNOWN) return GuardrailDirection.UNKNOWN;

  const lowerMeaning = guardrail?.lowerBoundMeaning ?? null;
  const upperMeaning = guardrail?.upperBoundMeaning ?? null;
  const isUnsafe = (meaning) => meaning === "unsafe_direction";
  const isSafe = (meaning) => meaning === "safe_direction";

  if (state === GuardrailState.ABOVE_RANGE) {
    return isSafe(upperMeaning) ? GuardrailDirection.NEUTRAL : GuardrailDirection.UNFAVORABLE;
  }
  if (state === GuardrailState.BELOW_RANGE) {
    return isSafe(lowerMeaning) ? GuardrailDirection.NEUTRAL : GuardrailDirection.UNFAVORABLE;
  }

  switch (transition) {
    case GuardrailTransition.ENTERING_FROM_BELOW:
      return isUnsafe(lowerMeaning) ? GuardrailDirection.FAVORABLE : GuardrailDirection.NEUTRAL;
    case GuardrailTransition.ENTERING_FROM_ABOVE:
      return isUnsafe(upperMeaning) ? GuardrailDirection.FAVORABLE : GuardrailDirection.NEUTRAL;
    case GuardrailTransition.DRIFTING_TOWARD_LOWER_EDGE:
      if (isUnsafe(lowerMeaning)) return GuardrailDirection.UNFAVORABLE;
      if (isSafe(lowerMeaning)) return GuardrailDirection.FAVORABLE;
      return GuardrailDirection.NEUTRAL;
    case GuardrailTransition.DRIFTING_TOWARD_UPPER_EDGE:
      if (isUnsafe(upperMeaning)) return GuardrailDirection.UNFAVORABLE;
      if (isSafe(upperMeaning)) return GuardrailDirection.FAVORABLE;
      return GuardrailDirection.NEUTRAL;
    case GuardrailTransition.RECEDING_FROM_LOWER_EDGE:
      return isUnsafe(lowerMeaning) ? GuardrailDirection.FAVORABLE : GuardrailDirection.NEUTRAL;
    case GuardrailTransition.RECEDING_FROM_UPPER_EDGE:
      return isUnsafe(upperMeaning) ? GuardrailDirection.FAVORABLE : GuardrailDirection.NEUTRAL;
    case GuardrailTransition.STABLE:
    case GuardrailTransition.UNKNOWN:
    default:
      return GuardrailDirection.NEUTRAL;
  }
}

/**
 * Convenience aggregate — the three fields together, as consumed by
 * `StrategicInterpretationService`. A Goal with no Guardrail at all (the
 * "Guardrails-optional" capability) is represented by `guardrail: null`,
 * which resolves every field to `unknown`/`neutral` rather than failing —
 * a Goal-without-a-Guardrail is not a Goal-with-a-violated-Guardrail.
 */
export function evaluateGuardrailTransition({ currentValue = null, priorValue = null, guardrail = null } = {}) {
  return Object.freeze({
    schemaVersion: GUARDRAIL_TRANSITION_VERSION,
    guardrailState: classifyGuardrailState(currentValue, guardrail),
    guardrailTransition: classifyGuardrailTransition(currentValue, priorValue, guardrail),
    guardrailDirection: guardrail
      ? classifyGuardrailDirection({ currentValue, priorValue, guardrail })
      : GuardrailDirection.UNKNOWN,
  });
}

function isOutside(state) {
  return state === GuardrailState.BELOW_RANGE || state === GuardrailState.ABOVE_RANGE;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isValidRange(guardrail) {
  return Boolean(guardrail) &&
    isFiniteNumber(guardrail.lowerBound) &&
    isFiniteNumber(guardrail.upperBound) &&
    guardrail.lowerBound <= guardrail.upperBound;
}
