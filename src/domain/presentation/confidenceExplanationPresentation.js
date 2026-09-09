import {
  assertFounderPresentationSafe,
  confidenceBandLabel,
  confidenceMovementLabel,
  confidenceSemanticCode,
} from "./productLanguagePresentation";

// Semantic presentation model for Confidence explanations. The canonical Confidence assessment
// carries structured internal-reasoning data (remainingUncertainty.items, a movement rationale
// code, nextConfidenceBuildingEvidence, a raw narrative sentence written in Confidence-engine
// vocabulary) — none of that is coaching copy. This module is the one sanctioned place that
// turns that reasoning into plain, specific, coaching-voice sentences. Typing the output as
// strings only solves serialization ([object Object]); this module is what solves the meaning —
// every internal factor/kind/rationale code is classified and re-expressed in the user's terms,
// never echoed or lightly edited. Unrecognized internal shapes are either mapped to a safe,
// honest, generic sentence or omitted — they are never stringified as-is.

export const CONFIDENCE_EXPLANATION_PRESENTATION_VERSION =
  "confidence_explanation_presentation_v2";

const FACTOR_PRESENTATION = Object.freeze({
  objective_feasible: {
    role: "support", semanticToken: "objective_feasible",
    text: "The goal still looks realistic.", priority: 20,
  },
  objective_ahead: {
    role: "support", semanticToken: "objective_ahead",
    text: "Measured progress is ahead of plan.", priority: 18,
  },
  objective_on_track: {
    role: "support", semanticToken: "objective_on_track",
    text: "Measured progress is on track.", priority: 18,
  },
  attainability_ahead: {
    role: "support", semanticToken: "trajectory_ahead",
    text: "The goal is ahead of its expected path.", priority: 19,
  },
  attainability_on_expected_trajectory: {
    role: "support", semanticToken: "trajectory_on_path",
    text: "The goal remains on track.", priority: 19,
  },
  quality_robust: {
    role: "support", semanticToken: "quality_robust",
    text: "The available information is reliable.", priority: 12,
  },
  quality_adequate: {
    role: "support", semanticToken: "quality_adequate",
    text: "The available information is reliable enough to guide the plan.", priority: 11,
  },
  guardrails_clear: {
    role: "support", semanticToken: "guardrails_clear",
    text: "The required guardrails remain clear.", priority: 15,
  },
  milestone_supported: {
    role: "support", semanticToken: "milestone_supported",
    text: "A planned checkpoint has been supported.", priority: 13,
  },
  agreement_strong_convergence: {
    role: "support", semanticToken: "agreement_strong",
    text: "The results point clearly in the same direction.", priority: 17,
  },
  agreement_moderate_convergence: {
    role: "support", semanticToken: "agreement_moderate",
    text: "Most of the results point in the same direction.", priority: 16,
  },
  strategy_confirmed: {
    role: "support", semanticToken: "strategy_confirmed",
    text: "The current plan is producing the responses we expected.", priority: 15,
  },
  strategy_directionally_supported: {
    role: "support", semanticToken: "strategy_supported",
    text: "The current plan is moving in the right direction, but it needs more time.", priority: 14,
  },
  objective_uncertain: {
    role: "limit", semanticToken: "objective_uncertain",
    text: "We still need a direct body-composition check to confirm the result.", priority: 20,
    isContradiction: false,
  },
  objective_behind: {
    role: "limit", semanticToken: "objective_behind",
    text: "Measured progress is behind plan.", priority: 22,
    isContradiction: true,
  },
  objective_contradicted: {
    role: "limit", semanticToken: "objective_contradicted",
    text: "A measured result points away from the expected path.", priority: 24,
    isContradiction: true,
  },
  objective_at_risk: {
    role: "limit", semanticToken: "objective_at_risk",
    text: "The goal is at risk of falling off track.", priority: 23,
    isContradiction: true,
  },
  objective_unlikely: {
    role: "limit", semanticToken: "objective_unlikely",
    text: "The current results make the goal unlikely on the expected timeline.", priority: 24,
    isContradiction: true,
  },
  agreement_mixed: {
    role: "limit", semanticToken: "agreement_mixed",
    text: "The results do not all point in the same direction yet.", priority: 16,
    isContradiction: false,
  },
  agreement_conflicting: {
    role: "limit", semanticToken: "agreement_conflicting",
    text: "Two important results point in different directions.", priority: 23,
    isContradiction: true,
  },
  agreement_insufficient: {
    role: "limit", semanticToken: "agreement_insufficient",
    text: "We do not have enough information to see a clear pattern yet.", priority: 16,
    isContradiction: false,
  },
  guardrails_watch: {
    role: "limit", semanticToken: "guardrails_watch",
    text: "The body-composition guardrail still needs watching.", priority: 15,
    isContradiction: false,
  },
  guardrails_pressured: {
    role: "limit", semanticToken: "guardrails_pressured",
    text: "A required guardrail is under pressure.", priority: 22,
    isContradiction: true,
  },
  guardrails_violated: {
    role: "limit", semanticToken: "guardrails_violated",
    text: "A required guardrail has been crossed.", priority: 24,
    isContradiction: true,
  },
  strategy_still_calibrating: {
    role: "limit", semanticToken: "strategy_calibrating",
    text: "The current strategy is still being calibrated.", priority: 13,
    isContradiction: false,
  },
  strategy_mixed: {
    role: "limit", semanticToken: "strategy_mixed",
    text: "Some results support the current plan while others raise questions.", priority: 19,
    isContradiction: true,
  },
  strategy_contradicted: {
    role: "limit", semanticToken: "strategy_contradicted",
    text: "An important result conflicts with the current plan.", priority: 24,
    isContradiction: true,
  },
  quality_limited: {
    role: "limit", semanticToken: "quality_limited",
    text: "The available information is still limited.", priority: 14,
    isContradiction: false,
  },
  quality_insufficient: {
    role: "limit", semanticToken: "quality_insufficient",
    text: "We do not have enough reliable information to explain the result yet.", priority: 18,
    isContradiction: false,
  },
  attainability_quantitative_progress_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "A direct progress comparison is not available yet.", priority: 14,
    isContradiction: false,
  },
  attainability_positive_but_behind: {
    role: "limit", semanticToken: "trajectory_positive_but_behind",
    text: "Progress is moving forward but remains behind plan.", priority: 20,
    isContradiction: false,
  },
  attainability_stalled: {
    role: "limit", semanticToken: "trajectory_stalled",
    text: "Measured progress has stalled.", priority: 22,
    isContradiction: true,
  },
  attainability_regressing: {
    role: "limit", semanticToken: "trajectory_regressing",
    text: "Measured progress is moving away from the expected path.", priority: 24,
    isContradiction: true,
  },
  attainability_unassessable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "We do not have enough comparable results to judge the pace yet.", priority: 15,
    isContradiction: false,
  },
  attainability_authorized_expected_trajectory_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "The expected trajectory is not available for a reliable pace comparison.", priority: 15,
    isContradiction: false,
  },
  attainability_goal_progress_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "Comparable goal progress is not available yet.", priority: 15,
    isContradiction: false,
  },
  attainability_phase_progress_baseline_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "A comparable phase baseline is not available yet.", priority: 15,
    isContradiction: false,
  },
  attainability_completion_timing_not_firm: {
    role: "limit", semanticToken: "timeline_not_firm",
    text: "The completion timing is not firm enough for a precise pace assessment.", priority: 14,
    isContradiction: false,
  },
  attainability_remaining_gap_exceeds_authorized_expected_envelope: {
    role: "limit", semanticToken: "trajectory_behind",
    text: "The remaining gap is larger than the plan allows for.", priority: 22,
    isContradiction: true,
  },
  milestone_contradicted: {
    role: "limit", semanticToken: "milestone_contradicted",
    text: "A planned checkpoint produced a result that points away from the plan.", priority: 23,
    isContradiction: true,
  },
  milestone_due_unresolved: {
    role: "limit", semanticToken: "milestone_unresolved",
    text: "A planned checkpoint is due and remains unresolved.", priority: 18,
    isContradiction: false,
  },
  milestone_overdue_unresolved: {
    role: "limit", semanticToken: "milestone_overdue",
    text: "A required checkpoint is overdue and unresolved.", priority: 22,
    isContradiction: false,
  },
  timeline_overdue: {
    role: "limit", semanticToken: "timeline_overdue",
    text: "The authorized timeline is overdue.", priority: 23,
    isContradiction: false,
  },
  timeline_unknown: {
    role: "limit", semanticToken: "timeline_unknown",
    text: "The timeline is not defined precisely enough for this assessment.", priority: 15,
    isContradiction: false,
  },
  timeline_not_started: {
    role: "limit", semanticToken: "timeline_not_started",
    text: "It is too early to evaluate this period.", priority: 13,
    isContradiction: false,
  },
});

const UNCERTAINTY_PRESENTATION = Object.freeze({
  measurement_pending: {
    semanticToken: "direct_confirmation_pending",
    text: "Direct body-composition confirmation remains pending.",
  },
  energy_calibration_uncertain: {
    semanticToken: "energy_calibration_uncertain",
    text: "Calories still need more consistency before we can tell whether this intake is right.",
  },
  recovery_evidence_missing: {
    semanticToken: "recovery_coverage_incomplete",
    text: "Recovery is still a blind spot because we do not have enough information yet.",
  },
  coverage_limited: {
    semanticToken: "coverage_limited",
    text: "The observation window remains incomplete.",
  },
  elapsed_time: {
    semanticToken: "elapsed_time_needed",
    text: "More time is needed before the response can be judged reliably.",
  },
  comparison_missing: {
    semanticToken: "comparison_missing",
    text: "A valid comparison is not available yet.",
  },
  execution_ambiguous: {
    semanticToken: "execution_uncertain",
    text: "Exposure to the current strategy is not clear enough for attribution.",
  },
  attribution: {
    semanticToken: "attribution_uncertain",
    text: "The observed change cannot yet be attributed confidently to the current strategy.",
  },
  measurement_precision: {
    semanticToken: "measurement_precision_limited",
    text: "The available measurement precision does not resolve the question.",
  },
  unresolved_guardrail_risk: {
    semanticToken: "guardrail_uncertain",
    text: "A guardrail question remains unresolved.",
  },
  signal_conflict: {
    semanticToken: "signal_conflict",
    text: "Two important results point in different directions.",
    isContradiction: true,
  },
});

export function buildConfidenceExplanationModel({
  assessment,
  surface = "detail",
  historicalContext = null,
} = {}) {
  if (!assessment || assessment.schemaVersion !== "canonical_confidence_assessment_v2") {
    return null;
  }
  const warnings = [];
  const supportingFactors = collectFactors(assessment, "support", warnings);
  addDurabilitySupport(assessment, supportingFactors);
  const limitingFactors = collectFactors(assessment, "limit", warnings);
  addUncertainties(assessment, limitingFactors, warnings);
  const nextDecisiveEvidence = collectNextEvidence(assessment, warnings);
  const movementExplanation = explainMovement(
    assessment,
    supportingFactors,
    limitingFactors,
    nextDecisiveEvidence,
  );
  const evidenceContextNote = explainEvidenceContext(assessment);
  const hasStructuredLineage = supportingFactors.length > 0 ||
    limitingFactors.length > 0 || nextDecisiveEvidence.length > 0;
  const summary = hasStructuredLineage
    ? surfaceSummary({ assessment, evidenceContextNote, historicalContext,
        limitingFactors, movementExplanation, nextDecisiveEvidence,
        supportingFactors, surface })
    : `Confidence is ${confidenceBandLabel(assessment.confidenceBand, { context: "narrative" })}, but this assessment does not include enough detail to explain why.`;
  const model = {
    schemaVersion: CONFIDENCE_EXPLANATION_PRESENTATION_VERSION,
    score: assessment.currentPercentage,
    band: assessment.confidenceBand,
    bandLabel: confidenceBandLabel(assessment.confidenceBand),
    movement: assessment.movement,
    movementLabel: confidenceMovementLabel(assessment.movement),
    movementMagnitude: assessment.movementMagnitude,
    summary,
    supportingFactors: freezeFactors(supportingFactors),
    limitingFactors: freezeFactors(limitingFactors),
    movementExplanation: Object.freeze(movementExplanation),
    nextDecisiveEvidence: freezeFactors(nextDecisiveEvidence),
    evidenceContextNote,
    historicalContext: historicalContext ? Object.freeze({
      matchedOnly: historicalContext.matchedOnly === true,
      eventDate: historicalContext.eventDate ?? null,
      text: historicalContextText(historicalContext),
    }) : null,
    sourceAssessmentId: assessment.id,
    sourceCutoff: assessment.sourceCutoff,
    sourcePublisher: assessment.publisherType,
    degradation: Object.freeze({
      status: hasStructuredLineage ? (warnings.length ? "partial" : "complete") : "insufficient",
      warnings: Object.freeze(warnings),
    }),
  };
  assertFounderPresentationSafe(model);
  return deepFreeze(model);
}

export function projectConfidenceExplanationForSurface(confidence, {
  assessment = null,
  surface = "detail",
  historicalContext = null,
} = {}) {
  if (!confidence) return confidence;
  const model = assessment
    ? buildConfidenceExplanationModel({ assessment, surface, historicalContext })
    : confidence.explanationModel ?? null;
  return model ? Object.freeze({ ...confidence, explanationModel: model,
    presentationExplanation: model.summary }) : confidence;
}

export function confidenceExplanationDetailFromModel(model) {
  if (!model) return null;
  const tokens = factorTokens(model);
  const trainingPeriods = model.supportingFactors.find((item) =>
    item.semanticToken === "training_progression_support")?.periodCount ?? 0;
  const supportingFactors = [];
  if (tokens.has("training_progression_support")) {
    supportingFactors.push(trainingPeriods >= 2
      ? "Training has been consistently strong for the last few weeks."
      : "Training is moving in the right direction.");
  }
  if (tokens.has("objective_feasible") || tokens.has("trajectory_on_path") ||
      tokens.has("objective_on_track")) {
    supportingFactors.push("The goal still looks realistic, and nothing we're seeing suggests the plan is off track.");
  }
  if (!supportingFactors.length && model.supportingFactors[0]?.text) {
    supportingFactors.push(model.supportingFactors[0].text);
  }
  const limitingFactors = [];
  if (tokens.has("energy_calibration_uncertain")) {
    limitingFactors.push("Calories still need more consistency before we can tell whether this intake is right.");
  }
  if (tokens.has("recovery_coverage_incomplete")) {
    limitingFactors.push("Recovery is still a blind spot because we do not have enough information yet.");
  }
  if (tokens.has("direct_confirmation_pending") || tokens.has("objective_uncertain") ||
      tokens.has("trajectory_measurement_pending") || tokens.has("follow_up_dexa")) {
    limitingFactors.push("We need another body-composition check before we can confirm that the early progress is turning into lean-mass gain.");
  }
  if (!limitingFactors.length) {
    const contradiction = model.limitingFactors.find((item) => item.isContradiction);
    const firstLimit = contradiction ?? model.limitingFactors[0];
    if (firstLimit?.text) limitingFactors.push(firstLimit.text);
  }
  return Object.freeze({
    qualitativeLevel: model.bandLabel,
    summary: model.summary,
    supportingFactors: supportingFactors.slice(0, 2),
    limitingFactors: limitingFactors.slice(0, 3),
    movementFactors: [model.movementExplanation.text].filter(Boolean),
    clarifyingFactors: model.nextDecisiveEvidence.map((item) => item.text),
    evidenceContextNote: "",
    historicalContext: model.historicalContext?.text ?? "",
    uncertaintyStatement: model.degradation.status === "insufficient" ? model.summary : "",
  });
}

function collectFactors(assessment, role, warnings) {
  const lineageKey = role === "support" ? "primarySupportingFactors" : "primaryLimitingFactors";
  const driverKey = role === "support" ? "strengthenedBy" : "limitedBy";
  const codes = [
    ...(assessment.forecastExplanationLineage?.[lineageKey] ?? []),
    ...(assessment.sourceLineage?.confidenceExplanationDrivers?.[driverKey] ?? [])
      .map((item) => item?.key),
  ].filter(Boolean);
  const values = [];
  for (const code of [...new Set(codes)]) {
    const semanticCode = confidenceSemanticCode(code);
    const presentation = FACTOR_PRESENTATION[semanticCode];
    if (!presentation || presentation.role !== role) {
      warnings.push(warning("unknown_factor", code));
      continue;
    }
    values.push({
      code,
      semanticToken: presentation.semanticToken,
      role,
      text: presentation.text,
      priority: presentation.priority,
      materiality: null,
      isContradiction: presentation.isContradiction === true,
      sourceRefs: sourceRefsFor(assessment, code, driverKey),
      lineageStatus: "canonical_factor",
    });
  }
  return dedupeFactors(values);
}

function addDurabilitySupport(assessment, output) {
  const durability = assessment.evidenceDurability ?? {};
  const signal = (durability.signals ?? []).find((item) =>
    item.capability === "training_progression" &&
    !["contradicting", "negative"].includes(item.direction));
  const includesTraining = signal ||
    (durability.corroboratingCapabilities ?? []).includes("training_progression");
  if (!includesTraining) return;
  const count = Number(signal?.independentPeriodCount ?? durability.independentPeriodCount ?? 0);
  const persistence = signal?.persistence ?? durability.persistence ?? "emerging";
  const text = count >= 2
    ? "Training has been consistently strong for the last few weeks."
    : persistence === "emerging"
      ? "Training is moving in the right direction, but we need more time to see whether it holds."
      : "Training is moving in the right direction.";
  output.unshift({
    code: "training_progression",
    semanticToken: "training_progression_support",
    role: "support",
    text,
    priority: 25,
    materiality: null,
    isContradiction: false,
    sourceRefs: [],
    lineageStatus: signal?.lineageAvailable === false
      ? "canonical_summary_only" : "canonical_durability",
    periodCount: count,
  });
}

function addUncertainties(assessment, output, warnings) {
  for (const item of assessment.remainingUncertainty?.items ?? []) {
    const presentation = UNCERTAINTY_PRESENTATION[item?.kind];
    if (!presentation) {
      // Guardrail configuration is intentionally not Founder-actionable. It is omitted and
      // diagnosed rather than guessed or exposed.
      warnings.push(warning("unknown_uncertainty", item?.kind));
      continue;
    }
    output.push({
      code: item.kind,
      semanticToken: presentation.semanticToken,
      role: "limit",
      text: presentation.text,
      priority: materialityPriority(item.materiality),
      materiality: item.materiality ?? null,
      isContradiction: presentation.isContradiction === true,
      sourceRefs: [],
      uncertaintyRefs: [item.id].filter(Boolean),
      lineageStatus: "canonical_uncertainty",
    });
  }
  const deduped = dedupeFactors(output);
  output.splice(0, output.length, ...deduped);
}

function collectNextEvidence(assessment, warnings) {
  const next = assessment.nextConfidenceBuildingEvidence;
  if (!next || next.status !== "identified") return [];
  if (next.evidenceCapability !== "dexa_body_composition") {
    warnings.push(warning("unknown_next_evidence", next.evidenceCapability));
    return [];
  }
  return [{
    code: next.evidenceCapability,
    semanticToken: "follow_up_dexa",
    capability: next.evidenceCapability,
    eventType: next.expectedEventType ?? null,
    text: "Your next consistently prepared DEXA will be the most useful check. It should tell us whether the early training progress is translating into measurable lean-mass gain without pushing body fat outside the guardrail.",
    priority: 25,
    sourceRefs: [],
    uncertaintyRefs: [...new Set(next.uncertaintyRefs ?? [])],
    decisionBoundary: next.decisionBoundary ?? null,
    expectedWindow: next.expectedWindow ?? null,
    lineageStatus: "canonical_next_evidence",
  }];
}

function explainMovement(assessment, supportingFactors, limitingFactors,
  nextDecisiveEvidence = []) {
  const prior = assessment.priorPercentage;
  const current = assessment.currentPercentage;
  const rationaleCode = assessment.narrativeExplanation?.movementRationaleCode ??
    assessment.sourceLineage?.confidenceExplanationDrivers?.materiallyChanged?.rationale ?? null;
  let text;
  if (assessment.movement === "increase") {
    const strengthenedBy = supportingFactors[0]?.text ??
      "The latest results gave us more reason to trust the plan.";
    text = `Confidence increased from ${prior}% to ${current}%. ${strengthenedBy}`;
  } else if (assessment.movement === "decrease") {
    const weakenedBy = limitingFactors[0]?.text ??
      "The latest results raised a meaningful concern about the plan.";
    text = `Confidence decreased from ${prior}% to ${current}%. ${weakenedBy}`;
  } else if (prior == null) {
    text = `Confidence starts at ${current}%.`;
  } else {
    const tokens = new Set([...supportingFactors, ...limitingFactors,
      ...nextDecisiveEvidence]
      .map((item) => item.semanticToken));
    const openQuestions = listClauses([
      tokens.has("energy_calibration_uncertain") && "calories",
      tokens.has("recovery_coverage_incomplete") && "recovery",
      (tokens.has("direct_confirmation_pending") || tokens.has("objective_uncertain") ||
        tokens.has("trajectory_measurement_pending") || tokens.has("follow_up_dexa")) &&
        "body composition",
    ]);
    text = tokens.has("training_progression_support")
      ? `Confidence stayed at ${current}%. Training continued to support the plan, but the bigger questions around ${openQuestions} are still unresolved.`
      : `Confidence stayed at ${current}%. The open questions have not changed enough to move it.`;
  }
  return {
    direction: assessment.movement,
    magnitude: assessment.movementMagnitude,
    rationaleCode,
    prior,
    current,
    text,
  };
}

function explainEvidenceContext(assessment) {
  const descriptors = assessment.sourceLineage?.evidenceNormalization?.descriptors ?? [];
  const hasDexa = descriptors.some((item) => item.capability === "dexa_body_composition");
  const hasWeight = descriptors.some((item) => item.capability === "body_weight_trend");
  if (hasDexa && hasWeight) {
    return "DEXA gives us the body-composition baseline. Weight helps us monitor the trend, but it cannot confirm the result by itself.";
  }
  if (hasDexa) {
    return "DEXA gives us the body-composition baseline, but one scan cannot prove a lasting response.";
  }
  if (hasWeight) return "Weight helps us monitor the trend, but it cannot confirm the result by itself.";
  return null;
}

function surfaceSummary({ assessment, evidenceContextNote, historicalContext,
  limitingFactors, movementExplanation, nextDecisiveEvidence,
  supportingFactors, surface }) {
  const tokens = new Set([...supportingFactors, ...limitingFactors]
    .map((item) => item.semanticToken));
  const training = tokens.has("training_progression_support");
  const feasible = tokens.has("objective_feasible");
  const onPath = tokens.has("trajectory_on_path") || tokens.has("objective_on_track");
  const energy = tokens.has("energy_calibration_uncertain");
  const recovery = tokens.has("recovery_coverage_incomplete");
  const pending = tokens.has("direct_confirmation_pending") ||
    tokens.has("objective_uncertain") || tokens.has("trajectory_measurement_pending");
  const held = assessment.movement === "no_meaningful_change";
  const noContradiction = assessment.evidenceDurability?.contradictionState === "none";
  const nextDexa = nextDecisiveEvidence.some((item) => item.semanticToken === "follow_up_dexa");
  if (surface === "photo_event" && historicalContext?.matchedOnly) {
    const date = formatDate(historicalContext.eventDate ?? assessment.sourceCutoff);
    return `These photos gave us a visual checkpoint for ${date}, but they were not used to change confidence. This reflects what we knew at that point in time and does not replace today's reading.`;
  }
  if (surface === "dexa_event") {
    const date = formatDate(historicalContext?.eventDate ?? assessment.sourceCutoff);
    const result = onPath
      ? `The ${date} DEXA gave us a reliable body-composition baseline and showed that the plan was still on track.`
      : `The ${date} DEXA gave us a reliable body-composition baseline.`;
    const eventEffect = assessment.movement === "increase"
      ? `${movementExplanation.text} The scan gave us new evidence that the plan was working.`
      : assessment.movement === "decrease"
        ? `${movementExplanation.text} The scan raised a new concern that needed attention.`
        : "It did not change confidence because one scan could not yet show a lasting lean-mass response.";
    return `${result} ${eventEffect} This reflects what we knew at that point in time and does not replace today's confidence.`;
  }
  if (surface === "monthly" && held && training) {
    const consistencyNeeds = [energy && "calories", recovery && "recovery"].filter(Boolean);
    const sentences = [
      "Training is moving in the right direction, but it is still too early to raise confidence.",
      `This month brought encouraging progress in the gym${consistencyNeeds.length ? `, while ${listClauses(consistencyNeeds)} still ${consistencyNeeds.length === 1 ? "needs" : "need"} more consistency` : ""}${pending ? " and we do not yet have enough body-composition evidence to confirm that the plan is adding muscle the way we want" : ""}.`,
      `${onPath || feasible || noContradiction ? "Nothing this month suggests the plan is off track, so " : ""}confidence stays at ${assessment.currentPercentage}%.`,
      nextDexa
        ? "Your next DEXA will be the most important check on whether the early progress is turning into measurable lean-mass gain."
        : "Keep the plan steady while we collect the next useful result.",
    ];
    return sentences.join(" ");
  }
  if (surface === "weekly" && held && training) {
    const openQuestions = [
      energy && "calories",
      recovery && "recovery",
      pending && "the next body-composition check",
    ].filter(Boolean);
    return `Training moved forward again this week, and the goal still looks realistic. ${openQuestions.length ? `${capitalize(listClauses(openQuestions))} ${openQuestions.length === 1 ? "is" : "are"} still ${openQuestions.length === 1 ? "an open question" : "the open questions"}, so ` : ""}confidence stays at ${assessment.currentPercentage}%. Keep the plan steady and continue collecting the information we need.`;
  }
  if (surface === "midweek") {
    if (training) {
      return "Things are moving in the right direction. Training is strong, but it is still early in the week. Keep the plan steady and let the full week show whether that progress is holding.";
    }
    return "It is still early in the week, so keep the plan steady for now. Let the full week show whether the current pattern is holding before making a change.";
  }
  if (surface === "home" && feasible && onPath) {
    const consistencyNeeds = [energy && "calories", recovery && "recovery"].filter(Boolean);
    return `${training ? "Training is moving in the right direction and " : ""}the plan remains on track. ${consistencyNeeds.length ? `${capitalize(listClauses(consistencyNeeds))} still ${consistencyNeeds.length === 1 ? "needs" : "need"} more consistency` : "We still need more time"}${nextDexa ? ", and the next body-composition check will tell us whether that progress is translating into measurable lean-mass gain" : " before we know whether the progress is holding"}.`;
  }
  if (surface === "goal") {
    return `${training ? "Training is moving in the right direction, and " : ""}${feasible ? "the goal still looks realistic" : `confidence is ${confidenceBandLabel(assessment.confidenceBand, { context: "narrative" })}`}${onPath ? ". The plan remains on track" : ""}. ${movementExplanation.text}${nextDexa ? " Your next DEXA is the key decision point." : ""}`;
  }
  return `${movementExplanation.text} ${supportingFactors[0]?.text ?? ""} ${limitingFactors[0]?.text ?? ""} ${nextDecisiveEvidence[0]?.text ?? ""} ${evidenceContextNote ?? ""}`
    .replace(/\s+/gu, " ").trim();
}

function historicalContextText(context) {
  if (!context?.matchedOnly) return "This explanation reflects what was known at that point in time.";
  return "This historical reading does not replace today's confidence.";
}

function factorTokens(model) {
  return new Set([...model.supportingFactors, ...model.limitingFactors,
    ...model.nextDecisiveEvidence].map((item) => item.semanticToken));
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function listClauses(values) {
  const items = values.filter(Boolean);
  if (!items.length) return "the structured evidence remained incomplete";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function sourceRefsFor(assessment, code, driverKey) {
  const driver = (assessment.sourceLineage?.confidenceExplanationDrivers?.[driverKey] ?? [])
    .find((item) => item?.key === code);
  return [...new Set(driver?.sourceRefs ?? [])];
}

function warning(kind, code) {
  return Object.freeze({ kind, code: typeof code === "string" ? code : null });
}

function materialityPriority(value) {
  return ({ high: 21, moderate: 17, low: 10 })[value] ?? 8;
}

function dedupeFactors(values) {
  const seen = new Set();
  return values.filter((item) => {
    if (seen.has(item.semanticToken)) return false;
    seen.add(item.semanticToken);
    return true;
  }).sort((left, right) => right.priority - left.priority);
}

function freezeFactors(values) {
  return Object.freeze(values.slice(0, 6).map((item) => Object.freeze({ ...item,
    sourceRefs: Object.freeze([...(item.sourceRefs ?? [])]),
    uncertaintyRefs: Object.freeze([...(item.uncertaintyRefs ?? [])]),
  })));
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "event";
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", timeZone: "UTC",
  }).format(date);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const SUPPORT_RATIONALE_COPY = Object.freeze({
  proxy_support_repeated_increase: "supportive",
  proxy_support_sustained_increase: "supportive",
  uncertainty_reduced_increase: "resolved",
  proxy_support_emerging_hold: "emerging",
});

const CAPABILITY_SUPPORT_COPY = Object.freeze({
  training: "Training has continued moving forward, which supports confidence that the plan is working.",
  nutrition: "Nutrition and intake trends have continued to hold up, which supports confidence that the plan is working.",
  weight: "Weight trends have continued to hold up, which supports confidence that the plan is working.",
  recovery: "Recovery has continued to hold up, which supports confidence that the plan is working.",
  activity: "Activity trends have continued to hold up, which supports confidence that the plan is working.",
});
const GENERIC_SUPPORT_COPY = "Recent evidence has continued to support the current plan.";

const CAPABILITY_KEYWORDS = Object.freeze([
  ["training", /\btraining\b/i],
  ["nutrition", /\b(nutrition|intake|calorie)/i],
  ["weight", /\bweight\b/i],
  ["recovery", /\brecovery\b/i],
  ["activity", /\bactivity\b/i],
]);

// Each uncertainty "kind" is a small, closed enum from the Confidence engine — not
// Founder-specific data. `goal_semantics_missing` (a Guardrail record missing a configured
// threshold) is deliberately omitted: it's a data-completeness detail about the system's own
// configuration, not something meaningful or actionable for the user, so it provides no
// value if surfaced and is safely dropped rather than translated.
const UNCERTAINTY_KIND_COPY = Object.freeze({
  measurement_pending: "There hasn't yet been enough direct body-composition evidence to confirm the desired outcome.",
  energy_calibration_uncertain: "There isn't yet enough time under the current calorie and activity targets to know how the body is responding.",
  recovery_evidence_missing: "Recovery evidence is limited right now.",
});

const EVIDENCE_CAPABILITY_COPY = Object.freeze({
  dexa_body_composition: "The next DEXA/body-composition measurement can directly confirm how this is progressing.",
});

const MATERIALITY_RANK = Object.freeze({ high: 0, moderate: 1, low: 2 });

// Known internal phrasing that occasionally reaches a narrative sentence verbatim (baked into
// an already-published, immutable historical record) — translated here at render time rather
// than by rewriting stored text. Generic pattern match, not a Founder-specific string swap.
// Retained for any remaining legacy callers that still render raw narrative text directly.
const INTERNAL_PHRASE_TRANSLATIONS = Object.freeze([
  [/\bdirect goal confirmation remains pending\.?/gi,
    "a direct measurement hasn't confirmed this yet"],
  [/\bdirect goal confirmation remains unresolved\.?/gi,
    "a direct measurement hasn't confirmed this yet"],
]);

export function translateConfidenceProse(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  return INTERNAL_PHRASE_TRANSLATIONS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  ).trim();
}

function detectCapability(text) {
  const value = String(text ?? "");
  for (const [key, pattern] of CAPABILITY_KEYWORDS) if (pattern.test(value)) return key;
  return null;
}

function describeUncertaintyItem(item) {
  return UNCERTAINTY_KIND_COPY[item?.kind] ?? null;
}

function summarizeUncertaintyItems(items = []) {
  const seen = new Map();
  for (const item of [...items].sort((a, b) =>
    (MATERIALITY_RANK[a?.materiality] ?? 3) - (MATERIALITY_RANK[b?.materiality] ?? 3))) {
    const description = describeUncertaintyItem(item);
    if (!description || seen.has(description)) continue;
    seen.set(description, true);
    if (seen.size >= 4) break;
  }
  return [...seen.keys()];
}

function describeNextEvidence(next) {
  if (!next || next.status !== "identified") return [];
  const description = EVIDENCE_CAPABILITY_COPY[next.evidenceCapability];
  return description ? [description] : [];
}

// Classifies *why* confidence moved using the engine's small closed rationale-code enum
// (never Founder-specific), then expresses that reason in the user's terms. The raw
// narrative sentence is only ever consulted to guess which capability (training, nutrition,
// weight, recovery, activity) is being referenced — never echoed.
function describeSupport({ narrativeText, movement, movementRationaleCode, uncertaintyReduction }) {
  const reduced = uncertaintyReduction?.status === "forecast_identified_reduction_factors" &&
    (uncertaintyReduction.factorCodes?.length ?? 0) > 0;
  if (reduced) return ["A previously uncertain factor was resolved by recent evidence."];

  const classification = SUPPORT_RATIONALE_COPY[movementRationaleCode] ??
    (movement === "increase" ? "supportive" : null);
  if (!classification) return [];

  if (classification === "resolved") return ["A previously uncertain factor was resolved by recent evidence."];
  if (classification === "emerging") {
    return ["An early positive signal is showing, though it's still too soon to be fully confident in it."];
  }
  const capability = detectCapability(narrativeText);
  return [CAPABILITY_SUPPORT_COPY[capability] ?? GENERIC_SUPPORT_COPY];
}

// Builds the typed detail rendered by the Confidence explanation modal (and any other
// surface that explains a canonical Confidence assessment). Accepts either the current V2
// canonical shape or a legacy-shaped object with pre-built string arrays — legacy input
// passes straight through untouched so older callers keep working unmodified.
export function buildConfidenceExplanationDetail({
  qualitativeLevel = null,
  narrativeText = null,
  movement = null,
  movementRationaleCode = null,
  uncertaintyReduction = null,
  remainingUncertaintyItems = null,
  nextConfidenceBuildingEvidence = null,
  legacySupportingFactors = null,
  legacyLimitingFactors = null,
  legacyClarifyingFactors = null,
  legacyUncertaintyStatement = null,
} = {}) {
  const isLegacy = remainingUncertaintyItems === null && narrativeText === null;
  if (isLegacy) {
    return {
      qualitativeLevel,
      supportingFactors: asStringArray(legacySupportingFactors),
      limitingFactors: asStringArray(legacyLimitingFactors),
      clarifyingFactors: asStringArray(legacyClarifyingFactors),
      uncertaintyStatement: typeof legacyUncertaintyStatement === "string" ? legacyUncertaintyStatement : "",
    };
  }
  // The bottom summary paragraph is intentionally left empty for the real (V2) path: once
  // supports/limits/clearer carry the actual translated meaning, a fourth paragraph built
  // from the same raw narrative text would only repeat it — in Confidence-engine vocabulary,
  // not the user's. A future summary is welcome here if it can synthesize something the
  // three lists genuinely don't already say; echoing the narrative sentence doesn't qualify.
  return {
    qualitativeLevel,
    supportingFactors: describeSupport({ narrativeText, movement, movementRationaleCode, uncertaintyReduction }),
    limitingFactors: summarizeUncertaintyItems(remainingUncertaintyItems ?? []),
    clarifyingFactors: describeNextEvidence(nextConfidenceBuildingEvidence),
    uncertaintyStatement: "",
  };
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}
