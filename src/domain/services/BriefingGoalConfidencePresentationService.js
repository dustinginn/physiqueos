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

export function createMonthlyBriefingGoalConfidenceBlockFromAssessment(
  assessment,
  options = {}
) {
  const block = createBriefingGoalConfidenceBlockFromAssessment(assessment, options);
  if (!block) return null;
  return {
    ...block,
    presentationExplanation: composeMonthlyConfidenceExplanation(assessment),
  };
}

export function createMidweekConfidencePresentation(
  confidence,
  { briefing } = {}
) {
  if (!confidence) return null;
  const direction = confidence.movementDirection === "increased"
    ? "moved up slightly"
    : confidence.movementDirection === "decreased"
      ? "moved down slightly"
      : "held steady";
  const signals = [
    (briefing?.training?.sessionsCompleted ?? 0) > 0 && "training",
    (briefing?.energyBalance?.completeNutritionDays ?? 0) > 0 && "calories",
    (briefing?.energyBalance?.completeActivityDays ?? 0) > 0 && "activity",
    (briefing?.weightContext?.observations ?? 0) > 0 && "weight",
  ].filter(Boolean);
  return {
    ...confidence,
    presentationExplanation:
      `Confidence ${direction} because ${naturalList(signals.length ? signals : ["the first few days"])} are telling a consistent early story, but the week still needs to finish before Sunday’s full review.`,
  };
}

function composeMonthlyConfidenceExplanation(assessment) {
  const contributors = assessment.contributors ?? [];
  const hasObjectiveBaseline = contributors.some((item) =>
    item.domain === "dexa" && item.userFacing !== false
  );
  const hasConstructiveTraining = contributors.some((item) =>
    item.domain === "training" &&
    item.direction === "supporting" &&
    item.userFacing !== false
  );
  const foundation = hasObjectiveBaseline && hasConstructiveTraining
    ? "July established an objective body-composition baseline, and training began moving in the right direction"
    : hasObjectiveBaseline
      ? "July established an objective body-composition baseline"
      : "July established a clearer starting point";
  const nextMeasure = hasObjectiveBaseline
    ? "August and the next DEXA will show whether that progress continues"
    : "August will show whether that early progress continues";
  return `${foundation}. One month is still too soon to confirm muscle gain; ${nextMeasure}.`;
}

function boundedReasons(contributors = []) {
  return contributors
    .filter((item) => item.userFacing !== false)
    .slice(0, 2)
    .map((item) => item.reason);
}

function naturalList(values) {
  if (values.length === 1) return values[0];
  if (values.length === 2) return values.join(" and ");
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
