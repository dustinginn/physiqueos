export function createBriefingGoalConfidenceBlock(confidence, {
  capturedAt = null,
} = {}) {
  if (!confidence?.canonicalSeries ||
      confidence.source !== "canonical_pi_snapshot" ||
      !confidence.assessmentId) return null;

  return {
    score: confidence.value,
    band: confidence.band,
    priorScore: confidence.priorScore,
    delta: confidence.delta,
    movementDirection: confidence.movementDirection,
    movementMagnitude: confidence.movementMagnitude,
    primaryReason: confidence.primaryReason,
    supportingReasons: boundedReasons(confidence.supportingContributors),
    limitingReasons: boundedReasons(confidence.limitingContributors),
    unresolvedUncertainty: (confidence.unresolvedUncertainty ?? []).slice(0, 3),
    assessmentId: confidence.assessmentId,
    assessmentContext: {
      goalId: confidence.goalId,
      phaseId: confidence.phaseId,
      operatingState: confidence.operatingState,
    },
    evidenceCutoff: confidence.evidenceCutoff,
    assessmentTimestamp: confidence.assessmentTimestamp,
    capturedAt,
    captureSemantics: "canonical_assessment_at_briefing_generation",
    source: confidence.source,
    modelVersion: confidence.modelVersion,
    piVersion: confidence.piVersion,
  };
}

export function createBriefingGoalConfidenceBlockFromAssessment(
  assessment, {
    capturedAt = null,
    captureSemantics = "cadence_assessment_at_atomic_publication",
  } = {}
) {
  if (!assessment?.id || assessment.schemaVersion !==
      "pi_goal_confidence_assessment_v1") return null;
  return {
    score: assessment.score.current,
    band: assessment.score.band,
    priorScore: assessment.score.prior,
    delta: assessment.score.delta,
    movementDirection: assessment.score.movement.direction,
    movementMagnitude: assessment.score.movement.magnitude,
    primaryReason: assessment.primaryReason,
    supportingReasons: assessment.contributors.filter((item) =>
      item.direction === "supporting" && item.userFacing !== false
    ).slice(0, 2).map((item) => item.reason),
    limitingReasons: assessment.contributors.filter((item) =>
      item.direction === "limiting" && item.userFacing !== false
    ).slice(0, 2).map((item) => item.reason),
    unresolvedUncertainty: assessment.unresolvedUncertainty.slice(0, 3),
    assessmentId: assessment.id,
    assessmentContext: {
      goalId: assessment.goalId,
      phaseId: assessment.phaseId,
      operatingState: assessment.operatingState,
    },
    evidenceCutoff: assessment.evidenceCutoff,
    assessmentTimestamp: assessment.provenance.generatedAt,
    capturedAt,
    captureSemantics,
    source: "canonical_pi_snapshot",
    modelVersion: assessment.modelVersion,
    piVersion: assessment.piVersion,
  };
}

function boundedReasons(contributors = []) {
  return contributors
    .filter((item) => item.userFacing !== false)
    .slice(0, 2)
    .map((item) => item.reason);
}
