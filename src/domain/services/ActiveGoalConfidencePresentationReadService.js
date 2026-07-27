import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";

export const ACTIVE_GOAL_CONFIDENCE_PRESENTATION_VERSION =
  "active_goal_confidence_presentation_v1";

export function resolveActiveGoalConfidencePresentation({
  activeGoal,
  activePhase = activeGoal?.phases?.find((item) => item.status === "active"),
  operatingState = activeGoal?.openingApproach?.value ??
    activeGoal?.operatingState?.value ?? activeGoal?.operatingState,
  store,
  legacyReadModel = null,
} = {}) {
  const fallback = (reason, status = "legacy_fallback") =>
    legacyFallback(legacyReadModel, activeGoal, activePhase, operatingState, reason, status);
  if (!activeGoal?.id || !activePhase?.id) {
    return fallback("active_goal_or_phase_unavailable", "unavailable");
  }
  const series = createPIGoalConfidenceReadService({ store })
    .getGoalConfidenceSeries({ goalId: activeGoal.id, phaseId: activePhase.id });
  if (!series.currentSnapshot) {
    const otherCanonicalExists = (store?.goalConfidenceSnapshots?.length ?? 0) > 0;
    return fallback(
      otherCanonicalExists
        ? "canonical_boundary_mismatch" : "canonical_series_unavailable",
      otherCanonicalExists ? "invalid_canonical" : "legacy_fallback"
    );
  }
  const snapshot = series.currentSnapshot;
  const history = series.history.find((item) => item.id === snapshot.historyRecordId);
  const assessment = history?.assessment;
  const mismatch = snapshot.goalId !== activeGoal.id ||
    snapshot.phaseId !== activePhase.id ||
    snapshot.operatingState !== operatingState;
  if (mismatch) return fallback("canonical_boundary_mismatch", "invalid_canonical");
  if (!history || !assessment ||
      snapshot.currentAssessmentId !== assessment.id ||
      history.assessmentId !== assessment.id ||
      snapshot.currentScore !== assessment.score?.current ||
      snapshot.scoreBand !== assessment.score?.band ||
      assessment.goalId !== activeGoal.id ||
      assessment.phaseId !== activePhase.id ||
      assessment.operatingState !== operatingState) {
    return fallback("canonical_snapshot_or_history_invalid", "invalid_canonical");
  }
  return Object.freeze({
    status: "canonical",
    source: "canonical_pi_snapshot",
    canonicalSeries: true,
    value: assessment.score.current,
    score: assessment.score.current,
    numericValue: assessment.score.current,
    percentageLabel: `${assessment.score.current}%`,
    band: assessment.score.band,
    label: title(assessment.score.band),
    assessmentId: assessment.id,
    snapshotId: snapshot.id,
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    operatingState: assessment.operatingState,
    movement: assessment.score.movement,
    movementDirection: assessment.score.movement.direction,
    movementMagnitude: assessment.score.movement.magnitude,
    delta: assessment.score.delta,
    priorScore: assessment.score.prior,
    primaryReason: assessment.primaryReason,
    explanation: assessment.primaryReason,
    supportingContributors: assessment.contributors.filter((item) =>
      item.direction === "supporting"),
    limitingContributors: assessment.contributors.filter((item) =>
      item.direction === "limiting"),
    unresolvedUncertainty: assessment.unresolvedUncertainty,
    evidenceCutoff: assessment.evidenceCutoff,
    assessmentTimestamp: assessment.provenance.generatedAt,
    modelVersion: assessment.modelVersion,
    piVersion: assessment.piVersion,
    fallbackReason: null,
    provenance: assessment.score.priorScoreProvenance,
  });
}

function legacyFallback(legacy, goal, phase, operatingState, reason, status) {
  if (!legacy || !Number.isFinite(legacy.value)) {
    return Object.freeze({
      status: "unavailable", source: "unavailable", canonicalSeries: false,
      value: null, score: null, numericValue: null, percentageLabel: null,
      band: null, label: "Unavailable", assessmentId: null, snapshotId: null,
      goalId: goal?.id ?? null, phaseId: phase?.id ?? null,
      operatingState: operatingState ?? null, movement: null,
      movementDirection: null, movementMagnitude: null, delta: null,
      priorScore: null, primaryReason: null, explanation: null,
      supportingContributors: [], limitingContributors: [],
      unresolvedUncertainty: [], evidenceCutoff: null,
      assessmentTimestamp: null, modelVersion: null, piVersion: null,
      fallbackReason: reason, provenance: null,
    });
  }
  return Object.freeze({
    ...legacy,
    status,
    source: "legacy_overall_goal_confidence",
    canonicalSeries: false,
    score: legacy.value,
    numericValue: legacy.value,
    percentageLabel: `${legacy.value}%`,
    assessmentId: null,
    snapshotId: null,
    goalId: goal?.id ?? null,
    phaseId: phase?.id ?? null,
    operatingState: operatingState ?? null,
    movement: null,
    movementDirection: null,
    movementMagnitude: null,
    delta: null,
    priorScore: null,
    primaryReason: legacy.explanation ?? null,
    supportingContributors: [],
    limitingContributors: [],
    unresolvedUncertainty: [],
    evidenceCutoff: null,
    assessmentTimestamp: null,
    modelVersion: "overall_goal_confidence_v1",
    piVersion: null,
    fallbackReason: reason,
    provenance: { source: "temporary_legacy_fallback", piDerived: false },
  });
}
function title(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase());
}
