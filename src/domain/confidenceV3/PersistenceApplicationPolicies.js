// Confidence V3 — persistence-application comparison pass.
//
// 5ff537c6 separated FEASIBILITY (has the evidence demonstrated the Goal is
// achievable, Guardrails respected?) from PERSISTENCE (how many times has
// that direction repeated?) — correctly. What remained under-examined is
// HOW persistence should constrain movement toward a feasibility-derived
// target. 5ff537c6 shipped exactly one answer (Model A below): scale the
// entire desired step by a persistence factor. This module holds that
// answer alongside three genuine alternatives, side by side, so the choice
// is made by comparison against a matrix — not by tuning Model A's one
// coefficient until one fixture looks right.
//
// Every policy shares the SAME feasibility target and SAME safety-ceiling
// derivation (`resolveFeasibilityTarget`/`resolveSafetyCeiling`, copied
// verbatim from `StrategicConfidenceProjectionService`'s v2 logic) so the
// comparison isolates exactly one variable: what persistence is allowed to
// control. Only the SELECTED policy is promoted into
// `StrategicConfidenceProjectionService`; this file is a comparison
// instrument, not a second production path.

export const PERSISTENCE_APPLICATION_POLICIES_VERSION = "persistence_application_policies_v1";

// ---------------------------------------------------------------------------
// Shared target/ceiling derivation — identical to
// StrategicConfidenceProjectionService v2, duplicated (not imported) so this
// comparison module has no coupling to which policy is currently "live" in
// the projection service. Kept in exact lockstep intentionally; if these
// diverge from that file, the comparison stops being meaningful.
// ---------------------------------------------------------------------------

export const BAND_TARGET = Object.freeze({
  very_low: 22, low: 34, developing: 47, moderate: 62, high: 78, very_high: 90,
});
export const FEASIBILITY_TARGET_ADJUSTMENT = Object.freeze({
  unproven: 0, weakly_supported: 5, demonstrated: 14, strongly_demonstrated: 20, contradicted: -10,
});
export const GUARDRAIL_PRESSURE_CAP = 48;
export const GUARDRAIL_BREACH_CAP = 35;
export const AUTHORITY_CEILING_MULTIPLIER = Object.freeze({ high: 2.5, moderate: 1.2, low: 0.6 });
export const DEFAULT_AUTHORITY_CEILING_MULTIPLIER = 0.5;
export const MINIMUM_CEILING_FRACTION_OF_BASE = 0.3;

export function resolveFeasibilityTarget({ confidenceBand, interpretation }) {
  if (interpretation.confidenceEligibility === "ineligible") return BAND_TARGET[confidenceBand];
  let target = BAND_TARGET[confidenceBand] + (FEASIBILITY_TARGET_ADJUSTMENT[interpretation.feasibilityState] ?? 0);
  if (interpretation.guardrailDirection === "unfavorable") {
    target = Math.min(target, isGuardrailBreached(interpretation) ? GUARDRAIL_BREACH_CAP : GUARDRAIL_PRESSURE_CAP);
  }
  return clamp(target, 10, 95);
}
export function resolveSafetyCeiling({ interpretation, baseCeiling, absoluteSafetyCap }) {
  const multiplier = AUTHORITY_CEILING_MULTIPLIER[interpretation.feasibilityEvidenceStrength] ?? DEFAULT_AUTHORITY_CEILING_MULTIPLIER;
  const scaled = baseCeiling * multiplier;
  const floor = baseCeiling * MINIMUM_CEILING_FRACTION_OF_BASE;
  return clamp(scaled, floor, absoluteSafetyCap);
}
function isGuardrailBreached(interpretation) {
  return (interpretation.guardrailEvaluations ?? []).some((item) =>
    (item.guardrailState === "below_range" || item.guardrailState === "above_range") &&
    item.guardrailDirection === "unfavorable");
}

// ---------------------------------------------------------------------------
// MODEL A — the 5ff537c6 baseline. Persistence controls STEP SIZE (a
// fraction of the entire desired move toward target), upward only.
// ---------------------------------------------------------------------------

export function applyModelA({ previousPercentage, target, ceiling, persistenceUpwardMovementFactor }) {
  const desiredDelta = target - previousPercentage;
  const movementDirection = desiredDelta > 0 ? 1 : desiredDelta < 0 ? -1 : 0;
  const persistenceFactor = movementDirection > 0 ? (persistenceUpwardMovementFactor ?? 0) : 1;
  const preCapDelta = desiredDelta * persistenceFactor;
  const appliedDelta = movementDirection > 0
    ? clamp(preCapDelta, 0, ceiling)
    : clamp(preCapDelta, -ceiling, 0);
  return finalize({ previousPercentage, appliedDelta, preCapDelta, ceiling, controls: "step_size_fraction_of_desired_delta" });
}

// ---------------------------------------------------------------------------
// MODEL B — CONFIDENCE RESERVE. Feasibility immediately captures a FLOOR
// FRACTION of the desired move (deterministic, keyed only by feasibility
// state — never a specific Goal/fixture); persistence controls ONLY the
// remaining reserve above that floor. The floor is recomputed fresh from
// CURRENT feasibility every assessment — it is not cached history, so a
// later drop to a weaker feasibility state (or to `contradicted`, which
// takes the downward branch entirely, bypassing the floor concept) is never
// blocked by an earlier floor. This directly answers "must not be pulled
// almost halfway back toward prior solely because persistence is low."
// ---------------------------------------------------------------------------

// Named, calibration-flagged, like every other coefficient table in this
// codebase. Monotonic in feasibility strength; `unproven`/`contradicted`
// are irrelevant (unproven has target==previous already; contradicted takes
// the full-strength downward branch, identical to Model A).
// REVISED once during comparison: an initial 0.75 strongly_demonstrated
// fraction, combined with this evidence tier's ~18pt safety ceiling,
// front-loaded so much of the step on the FIRST reading that the ceiling —
// not persistence — was already saturated, making a second confirming
// reading add nothing (violating "repeated favorable > single favorable").
// This is a structural fix (leave ceiling headroom so persistence has room
// to act at all) made before comparing outcomes, not a fit to any one
// fixture's preferred number — the values remain illustrative and
// calibration-flagged like every other table in this codebase.
export const FEASIBILITY_FLOOR_FRACTION = Object.freeze({
  unproven: 0, weakly_supported: 0.15, demonstrated: 0.40, strongly_demonstrated: 0.60, contradicted: 0,
});

export function applyModelB({ previousPercentage, target, ceiling, feasibilityState, persistenceUpwardMovementFactor }) {
  const desiredDelta = target - previousPercentage;
  if (desiredDelta <= 0) {
    // Downward/held movement: identical to Model A — full strength, safety-
    // ceiling bounded only. The floor concept applies to upward re-rating
    // only; it never softens a contradiction.
    const appliedDelta = clamp(desiredDelta, -ceiling, 0);
    return finalize({ previousPercentage, appliedDelta, preCapDelta: desiredDelta, ceiling, controls: "reserve_above_feasibility_floor (downward: full strength)" });
  }
  const floorFraction = FEASIBILITY_FLOOR_FRACTION[feasibilityState] ?? 0;
  const floorDelta = desiredDelta * floorFraction;
  const reserveDelta = desiredDelta - floorDelta;
  const persistenceUnlockedReserve = reserveDelta * (persistenceUpwardMovementFactor ?? 0);
  const preCapDelta = floorDelta + persistenceUnlockedReserve;
  const appliedDelta = clamp(preCapDelta, 0, ceiling);
  return finalize({
    previousPercentage, appliedDelta, preCapDelta, ceiling,
    controls: "reserve_above_feasibility_floor", floorDelta, reserveDelta, persistenceUnlockedReserve,
  });
}

// ---------------------------------------------------------------------------
// MODEL C — BAND/REGIME RESERVE. Feasibility selects a confidence REGIME
// (a bounded [min, max] window anchored to the existing BAND_TARGET
// values — not a new arbitrary scale); persistence sets POSITION within
// that regime (0 = regime floor, 1 = regime ceiling). The per-step SAFETY
// CEILING (not persistence) bounds how much of a large regime jump can be
// captured in one assessment. Numeric Confidence remains primary — the
// regime is a bounded anchor for where persistence aims, not a replacement
// scoring engine; nothing here re-derives the number FROM a band the way
// the pre-V3 architecture did.
// ---------------------------------------------------------------------------

export const FEASIBILITY_REGIME = Object.freeze({
  unproven: null,
  weakly_supported: Object.freeze({ min: BAND_TARGET.low, max: BAND_TARGET.developing }),
  demonstrated: Object.freeze({ min: BAND_TARGET.moderate, max: BAND_TARGET.high }),
  strongly_demonstrated: Object.freeze({ min: BAND_TARGET.high, max: BAND_TARGET.very_high }),
  contradicted: null,
});

export function applyModelC({ previousPercentage, target, ceiling, feasibilityState, guardrailDirection, persistenceUpwardMovementFactor }) {
  const regime = FEASIBILITY_REGIME[feasibilityState] ?? null;
  if (!regime || target <= previousPercentage) {
    // No regime (unproven/contradicted) or a downward/held target: fall
    // back to Model A's mechanics exactly — the regime concept only ever
    // applies to an upward re-rating driven by a genuine regime.
    const desiredDelta = target - previousPercentage;
    const appliedDelta = clamp(desiredDelta, -ceiling, 0);
    return finalize({ previousPercentage, appliedDelta, preCapDelta: desiredDelta, ceiling, controls: "regime_position (no regime / downward: full strength)" });
  }
  const cappedRegimeMax = guardrailDirection === "unfavorable" ? Math.min(regime.max, target) : regime.max;
  const regimeTarget = regime.min + (persistenceUpwardMovementFactor ?? 0) * (cappedRegimeMax - regime.min);
  const desiredDelta = regimeTarget - previousPercentage;
  const preCapDelta = Math.max(0, desiredDelta);
  const appliedDelta = clamp(preCapDelta, 0, ceiling);
  return finalize({
    previousPercentage, appliedDelta, preCapDelta, ceiling,
    controls: "regime_position", regimeMin: regime.min, regimeMax: cappedRegimeMax, regimeTarget,
  });
}

// ---------------------------------------------------------------------------
// MODEL D — ADDITIVE CONTRIBUTIONS. Considered per the brief's invitation to
// propose a cleaner alternative if one emerges from the analysis. It does
// NOT: it has no target/asymptote concept at all — feasibility and
// persistence each contribute a flat point value, summed, every assessment.
// Implemented and included in the comparison matrix for completeness, then
// REJECTED (see the written report) — with no target, identical evidence
// re-asserted across repeated assessments has no natural stopping point
// short of an ad hoc "no new evidence, no movement" guard, which is exactly
// the kind of extra, arbitrary safeguard this pass is trying to avoid
// needing. Fewer coefficients is not automatically simpler if the model
// needs a bolt-on elsewhere to stay bounded.
// ---------------------------------------------------------------------------

export const FEASIBILITY_CONTRIBUTION = Object.freeze({
  unproven: 0, weakly_supported: 3, demonstrated: 10, strongly_demonstrated: 16, contradicted: -12,
});
export const PERSISTENCE_CONTRIBUTION = Object.freeze({
  unestablished: 0, single_observation: 0, confirmed_repeat: 4, sustained_repeat: 8, contradicted: 0,
});

export function applyModelD({ previousPercentage, ceiling, feasibilityState, persistenceState, guardrailDirection }) {
  const feasibilityPoints = FEASIBILITY_CONTRIBUTION[feasibilityState] ?? 0;
  const movementDirection = feasibilityPoints > 0 ? 1 : feasibilityPoints < 0 ? -1 : 0;
  const persistencePoints = movementDirection > 0 ? (PERSISTENCE_CONTRIBUTION[persistenceState] ?? 0) : 0;
  let preCapDelta = feasibilityPoints + persistencePoints;
  if (guardrailDirection === "unfavorable") preCapDelta = Math.min(preCapDelta, 0);
  const appliedDelta = clamp(preCapDelta, -ceiling, ceiling);
  return finalize({ previousPercentage, appliedDelta, preCapDelta, ceiling, controls: "flat_additive_bonus_no_target" });
}

function finalize({ previousPercentage, appliedDelta, preCapDelta, ceiling, ...rationale }) {
  const currentPercentage = clamp(Math.round(previousPercentage + appliedDelta), 1, 99);
  return Object.freeze({
    previousPercentage,
    currentPercentage,
    delta: currentPercentage - previousPercentage,
    movement: currentPercentage === previousPercentage ? "no_meaningful_change" : currentPercentage > previousPercentage ? "increase" : "decrease",
    capBound: Math.abs(preCapDelta) > ceiling + 1e-9,
    preCapDelta: round(preCapDelta),
    appliedDelta: round(appliedDelta),
    ceiling: round(ceiling),
    rationale: Object.freeze(rationale),
  });
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, digits = 4) { return Number(Number(value).toFixed(digits)); }
