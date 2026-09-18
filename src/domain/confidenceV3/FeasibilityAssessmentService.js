// Confidence V3 refinement. Separates FEASIBILITY from PERSISTENCE.
//
// bb64a72b's `DurabilityWeightService` bundled two genuinely different
// questions into one multiplier:
//   (a) how trustworthy is THIS measurement (a quality-of-tool question), and
//   (b) how many times has this outcome DIRECTION repeated (a repetition
//       question).
// Multiplying them together meant a single, high-quality, strongly-favorable
// authoritative reading was discounted almost as hard as a single reading of
// any kind — because the repetition discount and the measurement-quality
// discount compounded. That is what made a Founder result showing HALF of an
// entire Goal, on the highest-authority evidence type available, in one
// interval, move Confidence by less than the old architecture's own fixed
// +8 DEXA ceiling would already have allowed on its own.
//
// FEASIBILITY answers: "has the available authoritative outcome evidence
// DEMONSTRATED that progress at a rate sufficient to achieve the Goal, while
// respecting its Guardrail(s), CAN occur?" This is a quality-of-evidence and
// direction-of-outcome question. A single strong authoritative reading can
// answer it decisively — repetition is not required to recognize that
// something has been demonstrated, only to trust that it will CONTINUE (see
// `PersistenceAssessmentService`).
//
// GENERICITY: only evidence classified `authoritative_direct` or
// `high_frequency_direct` (see `EvidenceAuthorityService`) can ever move
// feasibility — a Goal with only proxy/behavioral evidence available stays
// `unproven` no matter how much of it accumulates, because none of it
// directly measures the Goal's own outcome. No Goal name, Phase name, or
// evidence-domain literal appears in this file.

export const FEASIBILITY_ASSESSMENT_VERSION = "feasibility_assessment_v1";

export const FeasibilityState = Object.freeze({
  UNPROVEN: "unproven",
  WEAKLY_SUPPORTED: "weakly_supported",
  DEMONSTRATED: "demonstrated",
  STRONGLY_DEMONSTRATED: "strongly_demonstrated",
  CONTRADICTED: "contradicted",
});

export const FeasibilityEvidenceStrength = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
});

const DIRECT_OUTCOME_AUTHORITIES = new Set(["authoritative_direct", "high_frequency_direct"]);

// Named, calibration-flagged (see DurabilityWeightService.CALIBRATION_STATUS
// for the module-wide disclosure convention this follows). Base strength by
// authority class, downgraded one tier when the reading was not measured
// against a valid, trustworthy comparable reference — a fact about THIS
// demonstration's credibility, not about how many times it has repeated.
const BASE_STRENGTH_BY_AUTHORITY = Object.freeze({
  authoritative_direct: FeasibilityEvidenceStrength.HIGH,
  high_frequency_direct: FeasibilityEvidenceStrength.MODERATE,
  supporting_proxy: FeasibilityEvidenceStrength.LOW,
  behavioral: FeasibilityEvidenceStrength.LOW,
});
const STRENGTH_DOWNGRADE = Object.freeze({
  [FeasibilityEvidenceStrength.HIGH]: FeasibilityEvidenceStrength.MODERATE,
  [FeasibilityEvidenceStrength.MODERATE]: FeasibilityEvidenceStrength.LOW,
  [FeasibilityEvidenceStrength.LOW]: FeasibilityEvidenceStrength.LOW,
});

// Confidence-in-the-demonstration-itself, 0-1, reported for future
// narrative/inspection — NOT directly the numeric Confidence movement (that
// combination lives in `StrategicConfidenceProjectionService`).
const STATE_BASE_CONFIDENCE = Object.freeze({
  [FeasibilityState.UNPROVEN]: 0,
  [FeasibilityState.WEAKLY_SUPPORTED]: 0.35,
  [FeasibilityState.DEMONSTRATED]: 0.70,
  [FeasibilityState.STRONGLY_DEMONSTRATED]: 0.90,
  [FeasibilityState.CONTRADICTED]: 0,
});
const STRENGTH_MULTIPLIER = Object.freeze({
  [FeasibilityEvidenceStrength.HIGH]: 1.0,
  [FeasibilityEvidenceStrength.MODERATE]: 0.75,
  [FeasibilityEvidenceStrength.LOW]: 0.5,
});

export const CALIBRATION_STATUS = Object.freeze({
  stateConfidence: "illustrative_pending_founder_calibration",
  guaranteedProperty: "strongly_demonstrated > demonstrated > weakly_supported > unproven == contradicted == 0",
});

/**
 * @param directOutcomeAuthority       from `classifyEvidenceAuthority` — may
 *                                     be null (unresolved).
 * @param hasValidComparableReference  whether THIS reading was measured
 *                                     against a trustworthy prior reference —
 *                                     a measurement-quality fact, independent
 *                                     of how many times the OUTCOME direction
 *                                     has repeated (see
 *                                     PersistenceAssessmentService for that).
 */
export function classifyFeasibilityEvidenceStrength({ directOutcomeAuthority, hasValidComparableReference = true } = {}) {
  const base = BASE_STRENGTH_BY_AUTHORITY[directOutcomeAuthority] ?? FeasibilityEvidenceStrength.LOW;
  return hasValidComparableReference ? base : STRENGTH_DOWNGRADE[base];
}

/**
 * The core classification. `paceState`/`goalProgressMagnitude` come from
 * `ObservedOutcomePaceService`/the orchestrator's magnitude bucketing;
 * `guardrailDirection` from `GuardrailTransitionService`. Guardrail dominance
 * is enforced here first and absolutely: a breached, unfavorable Guardrail
 * means the Goal — defined jointly with its Guardrail — has NOT been shown
 * feasible, no matter how strong the raw progress looked.
 */
export function classifyFeasibilityState({
  directOutcomeAuthority,
  guardrailDirection,
  paceState,
  goalProgressMagnitude,
} = {}) {
  if (!DIRECT_OUTCOME_AUTHORITIES.has(directOutcomeAuthority)) return FeasibilityState.UNPROVEN;
  if (guardrailDirection === "unfavorable") return FeasibilityState.CONTRADICTED;
  switch (paceState) {
    case "regressing": return FeasibilityState.CONTRADICTED;
    case "stalled":
    case "behind": return FeasibilityState.WEAKLY_SUPPORTED;
    case "on_pace": return FeasibilityState.DEMONSTRATED;
    case "ahead": return FeasibilityState.STRONGLY_DEMONSTRATED;
    case "unassessable":
    default:
      // No deadline (or pace otherwise uncomputable): fall back to raw
      // progress magnitude — a Goal without a deadline can still
      // demonstrate feasibility through sheer magnitude of favorable
      // change, just not through a pace-vs-deadline comparison.
      if (goalProgressMagnitude === "goal_complete" || goalProgressMagnitude === "material") {
        return FeasibilityState.DEMONSTRATED;
      }
      if (goalProgressMagnitude === "moderate") return FeasibilityState.WEAKLY_SUPPORTED;
      return FeasibilityState.UNPROVEN;
  }
}

export function computeFeasibilityConfidence({ feasibilityState, feasibilityEvidenceStrength }) {
  const base = STATE_BASE_CONFIDENCE[feasibilityState] ?? 0;
  const multiplier = STRENGTH_MULTIPLIER[feasibilityEvidenceStrength] ?? 0.5;
  return round(base * multiplier);
}

/**
 * Convenience aggregate consumed by `StrategicInterpretationService`.
 */
export function evaluateFeasibility({
  directOutcomeAuthority = null,
  hasValidComparableReference = true,
  guardrailDirection = "unknown",
  paceState = "unassessable",
  goalProgressMagnitude = "unassessable",
} = {}) {
  const feasibilityEvidenceStrength = classifyFeasibilityEvidenceStrength({
    directOutcomeAuthority, hasValidComparableReference,
  });
  const feasibilityState = classifyFeasibilityState({
    directOutcomeAuthority, guardrailDirection, paceState, goalProgressMagnitude,
  });
  return Object.freeze({
    schemaVersion: FEASIBILITY_ASSESSMENT_VERSION,
    feasibilityState,
    feasibilityEvidenceStrength,
    feasibilityConfidence: computeFeasibilityConfidence({ feasibilityState, feasibilityEvidenceStrength }),
    feasibilityReason: [
      "feasibility", feasibilityState, feasibilityEvidenceStrength,
      "authority", directOutcomeAuthority ?? "none", "pace", paceState,
    ].join("_"),
  });
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}
