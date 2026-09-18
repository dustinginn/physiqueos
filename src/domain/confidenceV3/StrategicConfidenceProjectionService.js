// Confidence V3 — promoted from shadow (53300b3e) to production numeric
// Confidence projection, wired by StrategicActivationService and by
// createCanonicalConfidenceAssessmentV3 for post-activation briefings.
//
// `NumericConfidenceProjectionService` (V2) remains untouched and continues
// to serve any historical/legacy read path that still names it explicitly;
// it is not called by anything V3-published. This module still writes
// nothing itself — persistence is the publication service's job, exactly as
// under V2 — but its output is no longer a comparison-only number.
//
// v3 CHANGE — selected persistence-application model. 5ff537c6 shipped
// exactly one answer for how persistence constrains movement toward a
// feasibility-derived target: scale the ENTIRE desired step by a single
// persistence factor ("Model A" in the comparison pass). Compared against
// three genuine alternatives in `PersistenceApplicationPolicies.js` — a
// confidence-RESERVE model (Model B), a band/regime-position model
// (Model C), and a flat-additive-contribution model (Model D) — across a
// 16-scenario matrix plus explicit progression and adverse-follow-up
// simulations, **Model B was selected**:
//
//   Feasibility immediately captures a FLOOR FRACTION of the desired move —
//   deterministic, keyed only by feasibility state. Persistence controls
//   ONLY the remaining reserve above that floor (never the floor itself,
//   never downward/contradicting movement, which stays full-strength).
//
// Why B over A: A's single multiplier discounts the ENTIRE feasibility-
// justified gap by the persistence factor, which is exactly the "persistence
// still suppresses too much of the immediate re-rating" concern this pass
// was raised to address. B structurally guarantees most of a demonstrated
// result lands immediately (the stated product principle: "feasibility
// should drive most of the immediate re-rating"), while persistence still
// visibly, meaningfully gates the remainder — and every required
// relationship in the comparison matrix holds for both, so the choice
// between A and B is a product-fit decision, not a correctness one.
//
// Why C and D were rejected — proven, not asserted, in
// `PersistenceApplicationPolicies.test.js`:
//   C: its regime bounds are anchored to absolute band values far from a
//      realistic prior, so the safety ceiling — not persistence — decides
//      the result at any real persistence tier once demonstrated feasibility
//      implies a large jump. This reproduces the pre-V3 band-dominance
//      defect one layer down. Disqualifying.
//   D: has no target/asymptote at all — flat contributions summed each
//      assessment can make a LATER confirming step exceed an EARLIER one
//      (the opposite of the required diminishing shape), and a merely weak
//      (not adverse) follow-up keeps adding on top of an already-elevated
//      prior indefinitely. Disqualifying.
//
// All four candidate policies remain implemented and tested in
// `PersistenceApplicationPolicies.js` for future comparison; only Model B is
// wired into this orchestrator. Target/ceiling derivation is imported from
// that shared module (not duplicated) so this file and the comparison
// harness can never silently diverge.

import {
  resolveFeasibilityTarget, resolveSafetyCeiling, applyModelB,
  BAND_TARGET, FEASIBILITY_TARGET_ADJUSTMENT, FEASIBILITY_FLOOR_FRACTION,
  GUARDRAIL_PRESSURE_CAP, GUARDRAIL_BREACH_CAP,
  AUTHORITY_CEILING_MULTIPLIER, DEFAULT_AUTHORITY_CEILING_MULTIPLIER, MINIMUM_CEILING_FRACTION_OF_BASE,
} from "./PersistenceApplicationPolicies.js";

export const STRATEGIC_CONFIDENCE_PROJECTION_VERSION = "strategic_confidence_projection_v3";
export const SELECTED_PERSISTENCE_APPLICATION_MODEL = "confidence_reserve_model_b";

export const DEFAULT_ABSOLUTE_SAFETY_CAP = 18;

export {
  BAND_TARGET, FEASIBILITY_TARGET_ADJUSTMENT, FEASIBILITY_FLOOR_FRACTION,
  GUARDRAIL_PRESSURE_CAP, GUARDRAIL_BREACH_CAP,
  AUTHORITY_CEILING_MULTIPLIER, DEFAULT_AUTHORITY_CEILING_MULTIPLIER, MINIMUM_CEILING_FRACTION_OF_BASE,
};

/**
 * @param previousPercentage  V2's currently-published percentage (integer,
 *                             1-99) — carried forward, never recomputed from
 *                             scratch.
 * @param confidenceBand       V2's existing categorical band for this
 *                             assessment (unchanged input, reused for
 *                             continuity with the categorical anchor).
 * @param interpretation        The v2 `StrategicInterpretation` (feasibility
 *                             + persistence fields).
 * @param baseCeiling            Per-context safety floor, analogous to V2's
 *                             `MOVEMENT_CEILING[publisherType]`. Defaults to
 *                             8 — V2's own DEXA-event ceiling.
 * @param absoluteSafetyCap      Named, overridable — see
 *                             DEFAULT_ABSOLUTE_SAFETY_CAP.
 */
export function projectStrategicConfidence({
  previousPercentage,
  confidenceBand,
  interpretation,
  baseCeiling = 8,
  absoluteSafetyCap = DEFAULT_ABSOLUTE_SAFETY_CAP,
} = {}) {
  if (!Number.isInteger(previousPercentage) || previousPercentage < 1 || previousPercentage > 99) {
    throw new Error("projectStrategicConfidence requires a valid previous percentage (1-99).");
  }
  if (!(confidenceBand in BAND_TARGET)) {
    throw new Error(`projectStrategicConfidence requires a known confidenceBand, got "${confidenceBand}".`);
  }
  if (!interpretation || interpretation.schemaVersion !== "strategic_interpretation_v2") {
    throw new Error("projectStrategicConfidence requires a v2 StrategicInterpretation input.");
  }

  const target = resolveFeasibilityTarget({ confidenceBand, interpretation });
  const ceiling = resolveSafetyCeiling({ interpretation, baseCeiling, absoluteSafetyCap });
  const result = applyModelB({
    previousPercentage, target, ceiling,
    feasibilityState: interpretation.feasibilityState,
    persistenceUpwardMovementFactor: interpretation.persistenceUpwardMovementFactor,
  });

  return Object.freeze({
    schemaVersion: STRATEGIC_CONFIDENCE_PROJECTION_VERSION,
    shadowOnly: true,
    persistenceApplicationModel: SELECTED_PERSISTENCE_APPLICATION_MODEL,
    previousPercentage,
    currentPercentage: result.currentPercentage,
    movement: result.movement,
    delta: result.delta,
    rationale: {
      target,
      ceiling,
      preCapDelta: result.preCapDelta,
      appliedDelta: result.appliedDelta,
      capBound: result.capBound,
      floorDelta: result.rationale.floorDelta ?? null,
      reserveDelta: result.rationale.reserveDelta ?? null,
      persistenceUnlockedReserve: result.rationale.persistenceUnlockedReserve ?? null,
      controls: result.rationale.controls,
      baseCeiling,
      absoluteSafetyCap,
      guardrailCapApplied: target < uncappedTarget({ confidenceBand, interpretation }),
      feasibilityState: interpretation.feasibilityState,
      feasibilityEvidenceStrength: interpretation.feasibilityEvidenceStrength,
      persistenceState: interpretation.persistenceState,
      confidenceMovementReason: interpretation.confidenceMovementReason,
      confidenceEligibility: interpretation.confidenceEligibility,
    },
    interpretationInputFingerprint: interpretation.provenance.inputFingerprint,
  });
}

function uncappedTarget({ confidenceBand, interpretation }) {
  const adjustment = FEASIBILITY_TARGET_ADJUSTMENT[interpretation.feasibilityState] ?? 0;
  return clamp(BAND_TARGET[confidenceBand] + adjustment, 10, 95);
}

/**
 * Explicit multi-cap comparison utility — kept from v1/v2. Per this pass's
 * explicit instruction, the cap itself is not re-tuned here.
 */
export function evaluateCandidateAbsoluteSafetyCaps({
  previousPercentage, confidenceBand, interpretation, baseCeiling = 8,
  candidates = [12, 15, 18, 20],
} = {}) {
  return Object.freeze(Object.fromEntries(candidates.map((cap) => [
    cap,
    projectStrategicConfidence({ previousPercentage, confidenceBand, interpretation, baseCeiling, absoluteSafetyCap: cap }),
  ])));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
