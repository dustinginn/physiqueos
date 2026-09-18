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

export function createBriefingGoalConfidenceBlockFromV3({
  assessment,
  narrativePlan = assessment?.narrativePlan,
  capturedAt = null,
  captureSemantics = "canonical_v3_assessment_at_atomic_publication",
} = {}) {
  if (assessment?.schemaVersion !== "canonical_confidence_assessment_v3") {
    return null;
  }
  const movementDirection = ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[assessment.movement];
  const movementLabel = ({ increased: "Confidence increased",
    decreased: "Confidence decreased", held: "No meaningful change" })[
      movementDirection];
  const supportingReasons = (assessment.narrativeSupportingFactors ?? [])
    .map((item) => item.text ?? item).filter(Boolean).slice(0, 3);
  const limitingReasons = (assessment.narrativeLimitingFactors ?? [])
    .map((item) => item.text ?? item).filter(Boolean).slice(0, 3);
  const primaryReason = assessment.narrativeExplanation?.text ??
    assessment.narrativeSummary ?? null;
  return {
    score: assessment.currentPercentage,
    band: assessment.confidenceBand,
    priorScore: assessment.priorPercentage,
    delta: assessment.confidenceDelta,
    movementDirection,
    movementMagnitude: assessment.movementMagnitude,
    primaryReason,
    presentationExplanation: primaryReason,
    movementLabel,
    presentationMovementLabel: movementLabel,
    supportingReasons,
    limitingReasons,
    unresolvedUncertainty: (assessment.remainingUncertainty?.items ?? []).slice(0, 3),
    assessmentId: assessment.id,
    assessmentContext: {
      goalId: assessment.goalId,
      phaseId: assessment.phaseId,
      goalContractId: assessment.goalContract?.id ?? null,
      goalAchievement: assessment.goalAchievementState,
      strategyRevisionId: assessment.strategyEffectiveness?.strategyRevisionId ?? null,
    },
    evidenceCutoff: assessment.sourceCutoff,
    temporalCutoff: assessment.sourceCutoff,
    assessmentTimestamp: assessment.publicationTimestamp,
    assessmentDate: assessment.publicationTimestamp,
    capturedAt,
    captureSemantics,
    source: "canonical_confidence_v3_snapshot",
    modelVersion: assessment.schemaVersion,
    piVersion: "confidence_v3",
    originatingPublisher: assessment.publisherType,
    originatingArtifactId: assessment.briefingArtifactId,
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    explanationModel: {
      summary: primaryReason,
      movementLabel,
      supportingFactors: supportingReasons,
      limitingFactors: limitingReasons,
      nextDecisiveEvidence: assessment.nextConfidenceBuildingEvidence
        ? [assessment.nextConfidenceBuildingEvidence] : [],
    },
    narrativeSummary: assessment.narrativeSummary ?? null,
    narrativeDetail: assessment.narrativeDetail ?? null,
    narrativeSections: structuredClone(narrativePlan?.composition?.sections ??
      assessment.narrativeSections ?? null),
    narrativePresentationV3: structuredClone(
      assessment.narrativePresentationV3 ?? null),
    coachTake: assessment.narrativePresentationV3?.coachTake ??
      narrativePlan?.composition?.coachTake ?? null,
    latestMeaningfulMovement: structuredClone(
      assessment.narrativePresentationV3?.latestMeaningfulMovement ?? null),
  };
}

export function createMonthlyBriefingGoalConfidenceBlockFromAssessment(
  assessment,
  options = {}
) {
  const legacy = createBriefingGoalConfidenceBlockFromAssessment(assessment, options);
  if (legacy) return legacy;
  if (assessment?.schemaVersion === "canonical_confidence_assessment_v3") {
    return createBriefingGoalConfidenceBlockFromV3({ assessment, ...options });
  }
  if (assessment?.schemaVersion !== "canonical_confidence_assessment_v2") return null;
  const movementDirection = ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[assessment.movement];
  if (!movementDirection || !assessment.id ||
      !Number.isInteger(assessment.currentPercentage)) return null;
  return {
    score: assessment.currentPercentage,
    band: assessment.confidenceBand,
    priorScore: assessment.priorPercentage,
    delta: assessment.priorPercentage == null ? null :
      assessment.currentPercentage - assessment.priorPercentage,
    movementDirection,
    movementMagnitude: assessment.movementMagnitude,
    primaryReason: assessment.narrativeExplanation?.text ?? null,
    supportingReasons: [],
    limitingReasons: [],
    unresolvedUncertainty: (assessment.remainingUncertainty?.items ?? []).slice(0, 3),
    assessmentId: assessment.id,
    assessmentContext: {
      goalId: assessment.goalId,
      phaseId: assessment.phaseId,
      goalContractId: assessment.goalContract?.id ?? null,
    },
    evidenceCutoff: assessment.sourceCutoff,
    assessmentTimestamp: assessment.publicationTimestamp,
    capturedAt: options.capturedAt ?? null,
    captureSemantics: options.captureSemantics ??
      "canonical_v2_assessment_at_monthly_cutoff",
    source: "canonical_confidence_v2_snapshot",
    modelVersion: assessment.schemaVersion,
    piVersion: "confidence_v2",
    originatingPublisher: assessment.publisherType,
    originatingArtifactId: assessment.briefingArtifactId,
  };
}

export function createMidweekConfidencePresentation(
  confidence,
  _options = {}
) {
  return confidence ?? null;
}

export function applyNarrativeV3ToBriefingArtifact({
  artifact,
  publicationType,
  narrativePlan,
  strategicInterpretation,
} = {}) {
  const candidate = structuredClone(artifact);
  const sections = narrativePlan?.composition?.sections ?? {};
  const canonical = {
    summary: narrativePlan?.composition?.headline ?? null,
    detail: narrativePlan?.composition?.finalNarrative ?? null,
    sections: structuredClone(sections),
    coachTake: narrativePlan?.composition?.coachTake ?? null,
    confidenceExplanation: structuredClone(
      narrativePlan?.confidenceDeepExplanation ?? null),
    strategicQuestion: structuredClone(
      strategicInterpretation?.nextCoachingQuestion ?? null),
    recommendation: structuredClone(
      strategicInterpretation?.recommendation ?? null),
    strategicInterpretationId: strategicInterpretation?.id ?? null,
  };
  candidate.briefing ??= {};
  candidate.briefing.narrativeV3 = canonical;

  if (publicationType === "midweek") {
    candidate.briefing.hero = {
      ...(candidate.briefing.hero ?? {}),
      verdict: canonical.summary,
      summary: sections.meaning ?? sections.result ?? canonical.summary,
    };
    candidate.briefing.coachTake = canonical.coachTake ?? sections.action ??
      canonical.summary;
    candidate.briefing.prioritiesThroughSunday = [sections.action, sections.watch]
      .filter(Boolean);
  } else if (publicationType === "weekly") {
    const weekly = candidate.briefing.weeklyNarrative ?? {};
    weekly.summary = canonical.summary;
    weekly.primaryStory = sections.result ?? canonical.summary;
    weekly.goalMeaning = sections.meaning ?? null;
    weekly.coachDirection = sections.action ?? null;
    weekly.nextWeekFocus = sections.watch ?? null;
    if (weekly.cards?.hero) {
      weekly.cards.hero.title = canonical.summary;
      weekly.cards.hero.body = sections.meaning ?? sections.result ?? canonical.summary;
    }
    if (weekly.cards?.coachInsight) {
      weekly.cards.coachInsight.celebration = sections.result ?? null;
      weekly.cards.coachInsight.explanation = canonical.coachTake ??
        sections.action ?? null;
      weekly.cards.coachInsight.preparation = sections.watch ?? null;
    }
    weekly.narrativePresentationSelection ??= {};
    weekly.narrativePresentationSelection.hero = {
      ...(weekly.narrativePresentationSelection.hero ?? {}),
      headline: canonical.summary,
      summary: sections.meaning ?? sections.result ?? canonical.summary,
    };
    weekly.narrativePresentationSelection.coachInsight = {
      ...(weekly.narrativePresentationSelection.coachInsight ?? {}),
      biggestWin: sections.result ?? canonical.summary,
      keepBuilding: canonical.coachTake ?? sections.action ?? null,
      watchNextWeek: sections.watch ?? null,
      actionItems: [sections.action, sections.watch].filter(Boolean),
    };
    candidate.briefing.weeklyNarrative = weekly;
  } else if (publicationType === "monthly") {
    const monthly = candidate.briefing.monthlyNarrative ?? {};
    monthly.title = canonical.summary;
    monthly.thesis = sections.meaning ?? sections.result ?? canonical.summary;
    monthly.strategicSummaryV3 = canonical;
    candidate.briefing.monthlyNarrative = monthly;
    if (candidate.briefing.monthlyPresentation?.hero) {
      candidate.briefing.monthlyPresentation.hero.title = canonical.summary;
      candidate.briefing.monthlyPresentation.hero.thesis = monthly.thesis;
    }
  } else if (["dexa", "photo"].includes(publicationType)) {
    const key = publicationType === "dexa"
      ? "dexaEventNarrative" : "photoEventNarrative";
    const event = candidate.briefing[key] ?? {};
    event.hero = { ...(event.hero ?? {}), title: canonical.summary,
      body: sections.result ?? canonical.summary };
    event.strategicMeaningV3 = {
      result: sections.result ?? null,
      meaning: sections.meaning ?? null,
      action: sections.action ?? null,
      watch: sections.watch ?? null,
      confidence: sections.confidence ?? null,
      coachTake: canonical.coachTake,
    };
    if (publicationType === "dexa") {
      event.coachInsight = {
        ...(event.coachInsight ?? {}),
        biggestWin: sections.result ?? canonical.summary,
        protect: sections.action ?? null,
        watch: sections.watch ?? null,
        next: canonical.coachTake ?? sections.action ?? null,
      };
    } else {
      event.cardContent ??= {};
      event.cardContent.coachInsight = {
        ...(event.cardContent.coachInsight ?? {}),
        body: canonical.coachTake ?? sections.action ?? canonical.summary,
      };
    }
    candidate.briefing[key] = event;
  }
  return candidate;
}

function boundedReasons(contributors = []) {
  return contributors
    .filter((item) => item.userFacing !== false)
    .slice(0, 2)
    .map((item) => item.reason);
}
