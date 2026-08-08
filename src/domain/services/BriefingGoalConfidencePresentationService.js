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

export function createBriefingGoalConfidenceBlockFromV2({
  assessment,
  projection,
  narrativeAssessment,
  capturedAt = null,
  captureSemantics = "canonical_v2_assessment_at_atomic_publication",
} = {}) {
  if (assessment?.schemaVersion !== "canonical_confidence_assessment_v2" ||
      assessment.currentPercentage !== projection?.currentPercentage) return null;
  const movementDirection = ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[assessment.movement];
  return {
    score: assessment.currentPercentage,
    band: assessment.confidenceBand,
    priorScore: assessment.priorPercentage,
    delta: assessment.priorPercentage == null ? null :
      assessment.currentPercentage - assessment.priorPercentage,
    movementDirection,
    movementMagnitude: assessment.movementMagnitude,
    primaryReason: narrativeAssessment?.confidenceExplanation?.text ?? null,
    presentationExplanation: narrativeAssessment?.confidenceExplanation?.text ?? null,
    supportingReasons: (narrativeAssessment?.primarySupportingFactors ?? [])
      .map((item) => item.text).filter(Boolean).slice(0, 2),
    limitingReasons: (narrativeAssessment?.primaryLimitingFactors ?? [])
      .map((item) => item.text).filter(Boolean).slice(0, 2),
    unresolvedUncertainty: (narrativeAssessment
      ?.remainingUncertaintyExplanation?.items ?? []).slice(0, 3),
    assessmentId: assessment.id,
    assessmentContext: { goalId: assessment.goalId, phaseId: assessment.phaseId,
      goalContractId: assessment.goalContract.id },
    evidenceCutoff: assessment.sourceCutoff,
    temporalCutoff: assessment.sourceCutoff,
    assessmentTimestamp: assessment.publicationTimestamp,
    capturedAt,
    captureSemantics,
    source: "canonical_confidence_v2_snapshot",
    modelVersion: assessment.schemaVersion,
    piVersion: "confidence_v2",
    originatingPublisher: assessment.publisherType,
    originatingArtifactId: assessment.briefingArtifactId,
  };
}

export function createMonthlyBriefingGoalConfidenceBlockFromAssessment(
  assessment,
  options = {}
) {
  const block = createBriefingGoalConfidenceBlockFromAssessment(assessment, options);
  return block;
}

export function createMidweekConfidencePresentation(
  confidence,
  _options = {}
) {
  return confidence ?? null;
}

function boundedReasons(contributors = []) {
  return contributors
    .filter((item) => item.userFacing !== false)
    .slice(0, 2)
    .map((item) => item.reason);
}
