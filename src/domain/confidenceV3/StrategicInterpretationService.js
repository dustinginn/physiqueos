// Confidence V3 — v2. The one shared strategic-interpretation object.
//
// Today, `DEXAEventNarrativeService`, `PIDEXAConfidenceReasoningService`, and
// `NumericConfidenceProjectionService` each independently recompute their own
// partial view of "what does this evidence event mean" — which is exactly
// why a real Founder briefing could say "+5.0 lb, plan on track" in its
// headline while its own confidence explanation called the same scan a mere
// "baseline" and the number never moved. This module is the single place
// that answer is computed. Every downstream surface — numeric scoring,
// narrative, explanation, Home — reads THIS object; none of them re-derive
// progress, pace, guardrail position, evidence authority, feasibility, or
// persistence on their own once this is wired in (wiring is a later stage;
// this stage only produces the object).
//
// v2 CHANGE — FEASIBILITY vs PERSISTENCE: v1 (bb64a72b) routed evidence
// authority through `DurabilityWeightService`, whose single
// `durabilityWeight` multiplied a measurement-quality discount by a
// repetition discount. That compounding is what suppressed a strongly
// favorable, highest-authority, guardrail-respecting result to less
// movement than the pre-V3 architecture's own fixed ceiling already
// allowed. This version separates:
//   FEASIBILITY  — has the evidence DEMONSTRATED the required rate is
//                  achievable, Guardrails respected? (see
//                  FeasibilityAssessmentService)
//   PERSISTENCE  — how much do we trust that direction to CONTINUE? (see
//                  PersistenceAssessmentService — applied asymmetrically:
//                  it discounts upward movement, never downward correction)
// `durabilityState`/`durabilityWeight` are REMOVED from this schema
// (schemaVersion bumped v1 -> v2) — DurabilityWeightService itself is left
// untouched in the repository for side-by-side comparison, just no longer
// imported here.
//
// GENERICITY: this file contains no Goal name, Phase name, or evidence-domain
// branch. It knows about "guardrails," "quantitative progress," "observed
// intervals," "evidence authority classes," "feasibility," and
// "persistence" — never "Build Lean Mass," "Establish Maintenance," or
// "DEXA" as special-cased strings. See
// `StrategicInterpretationService.test.js`'s genericity assertions.
//
// DETERMINISM: pure function, bounded inputs only. Raw evidence (scan
// objects, weight/workout/photo arrays, source observations/claims,
// canonical evidence objects) is rejected at the INPUT boundary, mirroring
// `NumericConfidenceProjectionService.rejectRawEvidence`'s existing
// discipline — and the OUTPUT is scanned for the same forbidden shapes
// before it is frozen, as defense in depth.

import { createHash } from "node:crypto";
import {
  evaluateGuardrailTransition,
  GuardrailDirection,
} from "./GuardrailTransitionService.js";
import { classifyEvidenceAuthority } from "./EvidenceAuthorityService.js";
import { evaluateFeasibility, FeasibilityState } from "./FeasibilityAssessmentService.js";
import { evaluatePersistence, PersistenceState } from "./PersistenceAssessmentService.js";
import { evaluateObservedOutcomePace, PaceState } from "./ObservedOutcomePaceService.js";

export const STRATEGIC_INTERPRETATION_VERSION = "strategic_interpretation_v2";

export const GoalProgressMagnitude = Object.freeze({
  MARGINAL: "marginal",
  MODERATE: "moderate",
  MATERIAL: "material",
  GOAL_COMPLETE: "goal_complete",
  UNASSESSABLE: "unassessable",
});

export const StrategicOutcomeDirection = Object.freeze({
  FAVORABLE: "favorable",
  MIXED: "mixed",
  UNFAVORABLE: "unfavorable",
  NEUTRAL: "neutral",
});

export const StrategicSignificance = Object.freeze({
  MARGINAL: "marginal",
  MODERATE: "moderate",
  MATERIAL: "material",
});

export const ConfidenceEligibility = Object.freeze({
  ELIGIBLE: "eligible",
  CAPPED_BY_UNCERTAINTY: "capped_by_uncertainty",
  CAPPED_BY_GUARDRAIL: "capped_by_guardrail",
  INELIGIBLE: "ineligible",
});

// Named, calibration-flagged — see FeasibilityAssessmentService/
// PersistenceAssessmentService's own CALIBRATION_STATUS for the per-module
// disclosure. Interval contribution is measured against the Goal's TOTAL
// required progress, not its total elapsed fraction, so a small Goal near
// completion and a large Goal early on are judged by how much of the
// remaining work this ONE interval represents, not by an absolute unit size.
export const PROGRESS_MAGNITUDE_THRESHOLDS = Object.freeze({
  material: 0.30,
  moderate: 0.10,
});

const FORBIDDEN_KEY = /^(rawEvidence|evidenceDescriptors|sourceObservations|sourceClaims|canonicalEvidence|dexaScans|weights|workouts|photos|progressPhotos|dexaRecord|dexaRecords)$/i;

/**
 * @param goalProgress   For quantitative Goals: { requiredProgress, remainingGap,
 *                       direction } describing the Goal's TOTAL target shape
 *                       (not this interval — see `observedInterval`). Pass
 *                       `null` for non-quantitative Goals; nothing is
 *                       fabricated in its absence (qualitative/threshold/range
 *                       Goals use `thresholdProgress` instead, or neither).
 * @param thresholdProgress  For threshold/range Goals: { distanceToTarget,
 *                       priorDistanceToTarget, direction } — an alternative,
 *                       mutually exclusive progress signal.
 * @param observedInterval  Bounded { priorValue, priorObservedOn,
 *                       currentValue, currentObservedOn } — see
 *                       `ObservedOutcomePaceService`. Resolving which prior
 *                       reading is "the latest comparable one" is a
 *                       per-evidence-type adapter's job, out of scope here.
 * @param deadline       { remainingDays } | null. Deadline-optional: every
 *                       pace field degrades to null/unassessable, never a
 *                       fabricated pace, when absent.
 * @param guardrails     Array of { id, currentValue, priorValue, guardrail }
 *                       — zero or more. Guardrail-optional: an empty array
 *                       produces `guardrailDirection: "unknown"` for the
 *                       aggregate, never a fabricated "favorable"/"neutral".
 * @param evidence       { domain, goalOutcomeMetric, goalAuthorityOverrides }
 * @param evidenceQuality  { hasValidComparableReference } — a fact about
 *                       whether THIS reading was measured against a
 *                       trustworthy prior reference. Feeds
 *                       `feasibilityEvidenceStrength` ONLY — it is a
 *                       measurement-quality fact, deliberately independent
 *                       of how many times the outcome direction has
 *                       repeated (see `persistenceContext`).
 * @param persistenceContext  { priorConfirmingIntervalCount, contradicted } —
 *                       PURELY repetition/agreement facts about the evidence
 *                       HISTORY, never a phase/calendar concept.
 *                       `priorConfirmingIntervalCount` counts prior intervals
 *                       that already showed the SAME favorable direction as
 *                       this one — a stable-but-flat reference history
 *                       contributes 0 here even though it may make
 *                       `hasValidComparableReference` true.
 */
export function deriveStrategicInterpretation(input = {}) {
  assertNoRawEvidence(input);

  const {
    goalProgress = null,
    thresholdProgress = null,
    observedInterval = null,
    deadline = null,
    guardrails = [],
    evidence = {},
    evidenceQuality = {},
    persistenceContext = {},
    provenance = {},
  } = input;

  const direction = goalProgress?.direction ?? thresholdProgress?.direction ?? "increase";
  const remainingDays = Number.isFinite(deadline?.remainingDays) ? deadline.remainingDays : null;

  // — Progress magnitude: how much of the TOTAL remaining work does THIS
  //   interval represent? Quantitative and threshold/range Goals resolve it
  //   differently; a Goal with neither stays `unassessable` rather than
  //   inventing a fraction.
  const intervalDelta = directionalDelta(observedInterval, direction);
  const goalProgressFraction = goalProgress?.status === "available" && Number.isFinite(goalProgress.progressFraction)
    ? goalProgress.progressFraction
    : null;
  const remainingGoalGap = goalProgress?.status === "available" ? goalProgress.remainingGap : null;
  const goalProgressAbsolute = goalProgress?.status === "available" ? goalProgress.cumulativeProgress : null;
  const goalProgressMagnitude = resolveProgressMagnitude({
    goalProgress, thresholdProgress, intervalDelta, remainingGoalGap,
  });

  // — Pace: purely from the observed interval + deadline; never depends on
  //   an accepted trajectory existing (see ObservedOutcomePaceService header).
  const pace = evaluateObservedOutcomePace({
    observedInterval, direction, remainingGoalGap, remainingDays,
  });

  // — Guardrails: zero, one, or many. Aggregate direction is the most
  //   unfavorable individual result — any single breached/adverse guardrail
  //   dominates, mirroring the existing architecture's guardrail-dominance
  //   principle (never averaged away by other, unrelated guardrails).
  const guardrailEvaluations = guardrails.map((item) => ({
    id: item.id ?? null,
    ...evaluateGuardrailTransition({
      currentValue: item.currentValue, priorValue: item.priorValue, guardrail: item.guardrail,
    }),
  }));
  const guardrailDirection = aggregateGuardrailDirection(guardrailEvaluations);

  // — Evidence authority.
  const authority = classifyEvidenceAuthority({
    evidenceDomain: evidence.domain,
    goalOutcomeMetric: evidence.goalOutcomeMetric,
    goalAuthorityOverrides: evidence.goalAuthorityOverrides,
  });

  // — Feasibility: has this evidence DEMONSTRATED the required rate is
  //   achievable, Guardrails respected? A first authoritative reading can
  //   answer this decisively (see FeasibilityAssessmentService).
  const feasibility = evaluateFeasibility({
    directOutcomeAuthority: authority.directOutcomeAuthority,
    hasValidComparableReference: evidenceQuality.hasValidComparableReference !== false,
    guardrailDirection,
    paceState: pace.paceState,
    goalProgressMagnitude,
  });

  // — Persistence: purely repetition/agreement history — independent of
  //   evidence authority/quality (see PersistenceAssessmentService).
  const persistence = evaluatePersistence({
    hasObservedInterval: Boolean(observedInterval),
    priorConfirmingIntervalCount: persistenceContext.priorConfirmingIntervalCount ?? 0,
    contradicted: persistenceContext.contradicted === true,
  });

  // — Composite verdict.
  const progressDirection = resolveProgressDirection({ intervalDelta, goalProgressMagnitude });
  const strategicOutcomeDirection = resolveStrategicOutcomeDirection({ progressDirection, guardrailDirection });
  const strategicSignificance = resolveStrategicSignificance({
    goalProgressMagnitude, paceState: pace.paceState,
  });
  const confidenceEligibility = resolveConfidenceEligibility({
    feasibilityState: feasibility.feasibilityState,
    guardrailDirection,
  });
  const uncertaintyReason = collectUncertaintyReasons({
    feasibilityState: feasibility.feasibilityState,
    persistenceState: persistence.persistenceState,
    directOutcomeAuthority: authority.directOutcomeAuthority,
    pace,
    deadline,
    guardrailEvaluations,
  });
  const confidenceMovementReason = [
    authority.directOutcomeAuthority ?? "unresolved_authority",
    "feasibility", feasibility.feasibilityState,
    "persistence", persistence.persistenceState,
    strategicOutcomeDirection,
    "guardrail", guardrailDirection,
  ].join("_");
  const nextDecisiveEvidence = resolveNextDecisiveEvidence({
    feasibilityState: feasibility.feasibilityState,
    persistenceState: persistence.persistenceState,
    evidenceDomain: evidence.domain ?? null,
  });

  const output = {
    schemaVersion: STRATEGIC_INTERPRETATION_VERSION,

    goalProgressFraction,
    goalProgressAbsolute,
    remainingGoalGap,
    goalProgressMagnitude,

    elapsedGoalTimeFraction: Number.isFinite(input.elapsedGoalTimeFraction) ? input.elapsedGoalTimeFraction : null,
    remainingDays,

    observedOutcomePace: pace.observedOutcomePace,
    requiredRemainingPace: pace.requiredRemainingPace,
    paceRatio: pace.paceRatio,
    projectedCompletionOffsetDays: pace.projectedCompletionOffsetDays,
    paceState: pace.paceState,

    guardrailEvaluations,
    guardrailDirection,

    directOutcomeAuthority: authority.directOutcomeAuthority,
    measurementUncertainty: authority.measurementUncertainty,

    feasibilityState: feasibility.feasibilityState,
    feasibilityEvidenceStrength: feasibility.feasibilityEvidenceStrength,
    feasibilityConfidence: feasibility.feasibilityConfidence,
    feasibilityReason: feasibility.feasibilityReason,

    persistenceState: persistence.persistenceState,
    persistenceUpwardMovementFactor: persistence.persistenceUpwardMovementFactor,
    persistenceReason: persistence.persistenceReason,

    // Deferred by explicit instruction — see a future
    // CorroborationEvaluationService. Fields kept for schema stability so a
    // later stage is additive, not a breaking change.
    corroborationState: "not_evaluated",
    corroboratingDomains: [],

    strategicOutcomeDirection,
    strategicSignificance,
    confidenceEligibility,
    confidenceMovementReason,
    uncertaintyReason,
    nextDecisiveEvidence,

    provenance: {
      goalContractFingerprint: provenance.goalContractFingerprint ?? null,
      inputFingerprint: fingerprint(input),
      engineVersion: STRATEGIC_INTERPRETATION_VERSION,
    },
  };

  assertNoRawEvidence(output);
  return deepFreeze(output);
}

// ---------------------------------------------------------------------------
// Progress resolution
// ---------------------------------------------------------------------------

function resolveProgressMagnitude({ goalProgress, thresholdProgress, intervalDelta, remainingGoalGap }) {
  if (Number.isFinite(remainingGoalGap) && remainingGoalGap <= 0) return GoalProgressMagnitude.GOAL_COMPLETE;
  if (goalProgress?.status === "available" && Number.isFinite(goalProgress.requiredProgress) &&
      goalProgress.requiredProgress > 0 && intervalDelta != null) {
    const contribution = Math.abs(intervalDelta) / goalProgress.requiredProgress;
    return bucketMagnitude(contribution);
  }
  if (thresholdProgress?.status === "available" && Number.isFinite(thresholdProgress.distanceToTarget) &&
      Number.isFinite(thresholdProgress.priorDistanceToTarget) && thresholdProgress.priorDistanceToTarget > 0) {
    const closed = thresholdProgress.priorDistanceToTarget - thresholdProgress.distanceToTarget;
    return bucketMagnitude(Math.abs(closed) / thresholdProgress.priorDistanceToTarget);
  }
  return GoalProgressMagnitude.UNASSESSABLE;
}
function bucketMagnitude(contribution) {
  if (contribution >= PROGRESS_MAGNITUDE_THRESHOLDS.material) return GoalProgressMagnitude.MATERIAL;
  if (contribution >= PROGRESS_MAGNITUDE_THRESHOLDS.moderate) return GoalProgressMagnitude.MODERATE;
  return GoalProgressMagnitude.MARGINAL;
}
function resolveProgressDirection({ intervalDelta, goalProgressMagnitude }) {
  if (goalProgressMagnitude === GoalProgressMagnitude.GOAL_COMPLETE) return StrategicOutcomeDirection.FAVORABLE;
  if (intervalDelta == null) return StrategicOutcomeDirection.NEUTRAL;
  if (intervalDelta > 0) return StrategicOutcomeDirection.FAVORABLE;
  if (intervalDelta < 0) return StrategicOutcomeDirection.UNFAVORABLE;
  return StrategicOutcomeDirection.NEUTRAL;
}
function directionalDelta(observedInterval, direction) {
  if (!observedInterval) return null;
  const { priorValue, currentValue } = observedInterval;
  if (![priorValue, currentValue].every((value) => Number.isFinite(value))) return null;
  return direction === "decrease" ? priorValue - currentValue : currentValue - priorValue;
}

// ---------------------------------------------------------------------------
// Guardrail aggregation
// ---------------------------------------------------------------------------

const GUARDRAIL_DIRECTION_SEVERITY = Object.freeze({
  [GuardrailDirection.UNFAVORABLE]: 3,
  [GuardrailDirection.NEUTRAL]: 2,
  [GuardrailDirection.FAVORABLE]: 1,
  [GuardrailDirection.UNKNOWN]: 0,
});
function aggregateGuardrailDirection(guardrailEvaluations) {
  if (guardrailEvaluations.length === 0) return GuardrailDirection.UNKNOWN;
  // Most-unfavorable-wins: one breached/adverse guardrail dominates any
  // number of favorable ones, mirroring the non-negotiable dominance
  // principle already established for the numeric scoring layer.
  return guardrailEvaluations.reduce((worst, item) =>
    GUARDRAIL_DIRECTION_SEVERITY[item.guardrailDirection] > GUARDRAIL_DIRECTION_SEVERITY[worst]
      ? item.guardrailDirection : worst,
    GuardrailDirection.UNKNOWN);
}

// ---------------------------------------------------------------------------
// Composite verdict
// ---------------------------------------------------------------------------

function resolveStrategicOutcomeDirection({ progressDirection, guardrailDirection }) {
  const guardrailFavorable = guardrailDirection === GuardrailDirection.FAVORABLE;
  const guardrailUnfavorable = guardrailDirection === GuardrailDirection.UNFAVORABLE;
  if (progressDirection === StrategicOutcomeDirection.FAVORABLE) {
    if (guardrailUnfavorable) return StrategicOutcomeDirection.MIXED;
    return StrategicOutcomeDirection.FAVORABLE;
  }
  if (progressDirection === StrategicOutcomeDirection.UNFAVORABLE) {
    if (guardrailFavorable) return StrategicOutcomeDirection.MIXED;
    return StrategicOutcomeDirection.UNFAVORABLE;
  }
  if (guardrailUnfavorable) return StrategicOutcomeDirection.UNFAVORABLE;
  if (guardrailFavorable) return StrategicOutcomeDirection.FAVORABLE;
  return StrategicOutcomeDirection.NEUTRAL;
}

function resolveStrategicSignificance({ goalProgressMagnitude, paceState }) {
  if (goalProgressMagnitude === GoalProgressMagnitude.GOAL_COMPLETE) return StrategicSignificance.MATERIAL;
  const aheadOrOnPace = paceState === PaceState.AHEAD || paceState === PaceState.ON_PACE;
  if (goalProgressMagnitude === GoalProgressMagnitude.MATERIAL && (aheadOrOnPace || paceState === PaceState.UNASSESSABLE)) {
    return StrategicSignificance.MATERIAL;
  }
  if (goalProgressMagnitude === GoalProgressMagnitude.MATERIAL ||
      (goalProgressMagnitude === GoalProgressMagnitude.MODERATE && aheadOrOnPace)) {
    return StrategicSignificance.MODERATE;
  }
  if (goalProgressMagnitude === GoalProgressMagnitude.MODERATE) return StrategicSignificance.MODERATE;
  return StrategicSignificance.MARGINAL;
}

function resolveConfidenceEligibility({ feasibilityState, guardrailDirection }) {
  if (feasibilityState === FeasibilityState.UNPROVEN) return ConfidenceEligibility.INELIGIBLE;
  if (guardrailDirection === GuardrailDirection.UNFAVORABLE) return ConfidenceEligibility.CAPPED_BY_GUARDRAIL;
  if (feasibilityState === FeasibilityState.WEAKLY_SUPPORTED) return ConfidenceEligibility.CAPPED_BY_UNCERTAINTY;
  return ConfidenceEligibility.ELIGIBLE;
}

function collectUncertaintyReasons({ feasibilityState, persistenceState, directOutcomeAuthority, pace, deadline, guardrailEvaluations }) {
  const reasons = [];
  if (persistenceState === PersistenceState.SINGLE_OBSERVATION) {
    reasons.push("single_observation_of_favorable_direction");
    if (directOutcomeAuthority === "authoritative_direct") reasons.push("biological_persistence_unproven");
  }
  if (persistenceState === PersistenceState.CONFIRMED_REPEAT) {
    reasons.push("awaiting_sustained_confirmation");
  }
  if (persistenceState === PersistenceState.CONTRADICTED) reasons.push("contradicting_reading_present");
  if (feasibilityState === FeasibilityState.WEAKLY_SUPPORTED) reasons.push("required_rate_not_yet_demonstrated");
  if (pace.paceState === PaceState.UNASSESSABLE && !Number.isFinite(deadline?.remainingDays)) {
    reasons.push("no_deadline_pace_unavailable");
  }
  if (guardrailEvaluations.some((item) => item.guardrailDirection === GuardrailDirection.UNKNOWN)) {
    reasons.push("guardrail_state_unknown");
  }
  return reasons;
}

function resolveNextDecisiveEvidence({ feasibilityState, persistenceState, evidenceDomain }) {
  if (persistenceState === PersistenceState.SUSTAINED_REPEAT || feasibilityState === FeasibilityState.CONTRADICTED) {
    return null;
  }
  if (!evidenceDomain) return null;
  return Object.freeze({
    evidenceType: evidenceDomain,
    reason: feasibilityState === FeasibilityState.UNPROVEN
      ? "a first authoritative reading is needed to demonstrate feasibility at all"
      : "a further comparable reading in the same direction would increase persistence",
  });
}

// ---------------------------------------------------------------------------
// Determinism guard + utilities
// ---------------------------------------------------------------------------

function assertNoRawEvidence(value, path = "") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`StrategicInterpretation cannot contain raw evidence key "${path}${key}".`);
    }
    assertNoRawEvidence(child, `${path}${key}.`);
  }
}
function fingerprint(value) {
  return `sha256_${createHash("sha256").update(stable(value)).digest("hex")}`;
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
