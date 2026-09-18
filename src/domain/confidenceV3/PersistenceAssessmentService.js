// Confidence V3 refinement. PERSISTENCE — the second half of the split from
// `DurabilityWeightService` (see `FeasibilityAssessmentService`'s header for
// the full rationale).
//
// PERSISTENCE answers: "how much evidence do we have that the demonstrated
// outcome rate/direction is likely to CONTINUE long enough to complete the
// Goal?" This is PURELY a repetition/agreement question — it does not know
// or care how authoritative the evidence type is, or how good this specific
// reading's measurement quality was (that is `FeasibilityAssessmentService`'s
// job). Two independently-run direct measurements of body composition, a
// strength test, or a lab panel are all judged by the exact same repetition
// arithmetic here.
//
// A single favorable authoritative interval must NOT imply high persistence
// — but critically, per the refinement's design decision, persistence
// governs how much of an UPWARD move is trusted, not whether a
// DOWNWARD move (a contradicting result) is trusted. Confidence should be
// slow to climb on unconfirmed evidence and fast to correct on adverse
// evidence — a deliberate asymmetry (see `movementDirection` parameter on
// `computePersistenceMovementFactor`), not an oversight. This is what lets
// the model avoid permanently ratcheting Confidence upward after one
// favorable result while still responding decisively to a contradiction.

export const PERSISTENCE_ASSESSMENT_VERSION = "persistence_assessment_v1";

export const PersistenceState = Object.freeze({
  UNESTABLISHED: "unestablished",
  SINGLE_OBSERVATION: "single_observation",
  CONFIRMED_REPEAT: "confirmed_repeat",
  SUSTAINED_REPEAT: "sustained_repeat",
  CONTRADICTED: "contradicted",
});

// Governs UPWARD movement only (see file header). Named, calibration-flagged
// — the single_observation value is the ONE coefficient in this whole
// refinement most directly answerable by Founder product judgment rather
// than by further architecture work: it is "how much of a feasibility-
// justified target increase should a Goal be allowed to capture on the
// very first time a favorable rate has ever been observed." 0.60 here means
// "a majority, but consciously not all" — an explicit, inspectable choice,
// not a coefficient tuned to reproduce one fixture's expected output.
export const PERSISTENCE_UPWARD_MOVEMENT_FACTOR = Object.freeze({
  [PersistenceState.UNESTABLISHED]: 0,
  [PersistenceState.SINGLE_OBSERVATION]: 0.60,
  [PersistenceState.CONFIRMED_REPEAT]: 0.85,
  [PersistenceState.SUSTAINED_REPEAT]: 1.0,
  // A history containing disagreement resets trust to the single-observation
  // baseline for any FUTURE favorable reading — it does not zero it (a prior
  // contradiction should not permanently block ever trusting this evidence
  // type again), and it does not gate the CURRENT downward correction at all
  // (see computePersistenceMovementFactor).
  [PersistenceState.CONTRADICTED]: 0.60,
});

export const CALIBRATION_STATUS = Object.freeze({
  singleObservationFactor: "illustrative_pending_founder_calibration — the primary open lever",
  guaranteedProperty: "sustained_repeat > confirmed_repeat > single_observation > unestablished == 0",
  asymmetry: "downward movement is never scaled by this table — see computePersistenceMovementFactor",
});

/**
 * @param hasObservedInterval         whether a comparable interval exists at
 *                                    all for this reading (false = a true
 *                                    baseline, nothing to judge persistence
 *                                    of yet).
 * @param priorConfirmingIntervalCount  how many PRIOR intervals already
 *                                    showed the SAME favorable direction as
 *                                    this one — NOT how many prior
 *                                    measurements exist in general. A long,
 *                                    stable, flat reference history that
 *                                    never showed favorable movement
 *                                    contributes 0 here (it may still make
 *                                    THIS reading's measurement more
 *                                    trustworthy — that is
 *                                    `hasValidComparableReference`'s job in
 *                                    `FeasibilityAssessmentService`, a
 *                                    deliberately separate fact).
 * @param contradicted                a later or contemporaneous reading of
 *                                    the same evidence type disagrees with
 *                                    this one's direction.
 */
export function classifyPersistenceState({
  hasObservedInterval = false,
  priorConfirmingIntervalCount = 0,
  contradicted = false,
} = {}) {
  if (contradicted) return PersistenceState.CONTRADICTED;
  if (!hasObservedInterval) return PersistenceState.UNESTABLISHED;
  if (priorConfirmingIntervalCount <= 0) return PersistenceState.SINGLE_OBSERVATION;
  if (priorConfirmingIntervalCount === 1) return PersistenceState.CONFIRMED_REPEAT;
  return PersistenceState.SUSTAINED_REPEAT;
}

/**
 * The asymmetric core of this refinement. `movementDirection` is the sign of
 * the desired Confidence change BEFORE this factor is applied (positive =
 * would raise Confidence, negative/zero = would hold or lower it).
 * Downward movement is returned as `1` (no persistence discount at all) —
 * bounded only by the numeric engine's own safety ceiling, never by how many
 * times this direction has repeated. This is what lets one contradicting
 * authoritative reading correct an earlier, possibly premature, increase.
 */
export function computePersistenceMovementFactor({ persistenceState, movementDirection = 1 } = {}) {
  if (movementDirection <= 0) return 1;
  return PERSISTENCE_UPWARD_MOVEMENT_FACTOR[persistenceState] ?? 0;
}

export function evaluatePersistence({
  hasObservedInterval = false,
  priorConfirmingIntervalCount = 0,
  contradicted = false,
} = {}) {
  const persistenceState = classifyPersistenceState({ hasObservedInterval, priorConfirmingIntervalCount, contradicted });
  return Object.freeze({
    schemaVersion: PERSISTENCE_ASSESSMENT_VERSION,
    persistenceState,
    // Reported as the UPWARD factor for inspection/narrative — the
    // orchestrator/projection service resolves the actual (possibly
    // asymmetric) factor at combination time, once it knows which direction
    // this assessment is moving.
    persistenceUpwardMovementFactor: PERSISTENCE_UPWARD_MOVEMENT_FACTOR[persistenceState] ?? 0,
    persistenceReason: [
      "persistence", persistenceState,
      "priorConfirming", String(priorConfirmingIntervalCount),
    ].join("_"),
  });
}
