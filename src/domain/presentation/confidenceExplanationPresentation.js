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
    text: "The objective remains feasible.", priority: 20,
  },
  objective_ahead: {
    role: "support", semanticToken: "objective_ahead",
    text: "Measured progress is ahead of the expected trajectory.", priority: 18,
  },
  objective_on_track: {
    role: "support", semanticToken: "objective_on_track",
    text: "Measured progress is consistent with the expected trajectory.", priority: 18,
  },
  attainability_ahead: {
    role: "support", semanticToken: "trajectory_ahead",
    text: "The Goal is ahead of its expected path.", priority: 19,
  },
  attainability_on_expected_trajectory: {
    role: "support", semanticToken: "trajectory_on_path",
    text: "The Goal remains on its expected path.", priority: 19,
  },
  quality_robust: {
    role: "support", semanticToken: "quality_robust",
    text: "The available evidence is robust.", priority: 12,
  },
  quality_adequate: {
    role: "support", semanticToken: "quality_adequate",
    text: "The available evidence is trustworthy enough for this assessment.", priority: 11,
  },
  guardrails_clear: {
    role: "support", semanticToken: "guardrails_clear",
    text: "The required Guardrails remain clear.", priority: 15,
  },
  milestone_supported: {
    role: "support", semanticToken: "milestone_supported",
    text: "A planned checkpoint has been supported.", priority: 13,
  },
  agreement_strong_convergence: {
    role: "support", semanticToken: "agreement_strong",
    text: "The available signals have strong agreement.", priority: 17,
  },
  agreement_moderate_convergence: {
    role: "support", semanticToken: "agreement_moderate",
    text: "The available signals have moderate agreement.", priority: 16,
  },
  strategy_confirmed: {
    role: "support", semanticToken: "strategy_confirmed",
    text: "The current strategy is supported across the expected responses.", priority: 15,
  },
  strategy_directionally_supported: {
    role: "support", semanticToken: "strategy_supported",
    text: "The current strategy is directionally supported, but not fully confirmed.", priority: 14,
  },
  objective_uncertain: {
    role: "limit", semanticToken: "objective_uncertain",
    text: "Direct outcome confirmation remains pending.", priority: 20,
    isContradiction: false,
  },
  objective_behind: {
    role: "limit", semanticToken: "objective_behind",
    text: "Measured progress is behind the expected trajectory.", priority: 22,
    isContradiction: true,
  },
  objective_contradicted: {
    role: "limit", semanticToken: "objective_contradicted",
    text: "A measured result materially conflicts with the expected trajectory.", priority: 24,
    isContradiction: true,
  },
  objective_at_risk: {
    role: "limit", semanticToken: "objective_at_risk",
    text: "The objective is at risk against its expected trajectory.", priority: 23,
    isContradiction: true,
  },
  objective_unlikely: {
    role: "limit", semanticToken: "objective_unlikely",
    text: "The current evidence makes the objective unlikely on the expected trajectory.", priority: 24,
    isContradiction: true,
  },
  agreement_mixed: {
    role: "limit", semanticToken: "agreement_mixed",
    text: "The available signals remain mixed.", priority: 16,
    isContradiction: false,
  },
  agreement_conflicting: {
    role: "limit", semanticToken: "agreement_conflicting",
    text: "Material evidence conflicts with another signal.", priority: 23,
    isContradiction: true,
  },
  agreement_insufficient: {
    role: "limit", semanticToken: "agreement_insufficient",
    text: "There is not enough signal coverage to establish agreement yet.", priority: 16,
    isContradiction: false,
  },
  guardrails_watch: {
    role: "limit", semanticToken: "guardrails_watch",
    text: "The body-composition Guardrail remains under observation.", priority: 15,
    isContradiction: false,
  },
  guardrails_pressured: {
    role: "limit", semanticToken: "guardrails_pressured",
    text: "A required Guardrail is materially pressured.", priority: 22,
    isContradiction: true,
  },
  guardrails_violated: {
    role: "limit", semanticToken: "guardrails_violated",
    text: "A required Guardrail has been crossed.", priority: 24,
    isContradiction: true,
  },
  strategy_still_calibrating: {
    role: "limit", semanticToken: "strategy_calibrating",
    text: "The current strategy is still being calibrated.", priority: 13,
    isContradiction: false,
  },
  strategy_mixed: {
    role: "limit", semanticToken: "strategy_mixed",
    text: "The current strategy has both supporting and conflicting signals.", priority: 19,
    isContradiction: true,
  },
  strategy_contradicted: {
    role: "limit", semanticToken: "strategy_contradicted",
    text: "Material evidence contradicts the current strategy.", priority: 24,
    isContradiction: true,
  },
  quality_limited: {
    role: "limit", semanticToken: "quality_limited",
    text: "Evidence quality remains limited.", priority: 14,
    isContradiction: false,
  },
  quality_insufficient: {
    role: "limit", semanticToken: "quality_insufficient",
    text: "Evidence quality is not sufficient for precise causal conclusions.", priority: 18,
    isContradiction: false,
  },
  attainability_quantitative_progress_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "A direct progress comparison is not available yet.", priority: 14,
    isContradiction: false,
  },
  attainability_positive_but_behind: {
    role: "limit", semanticToken: "trajectory_positive_but_behind",
    text: "Progress is positive but remains behind the expected pace.", priority: 20,
    isContradiction: false,
  },
  attainability_stalled: {
    role: "limit", semanticToken: "trajectory_stalled",
    text: "Measured progress has stalled against the expected pace.", priority: 22,
    isContradiction: true,
  },
  attainability_regressing: {
    role: "limit", semanticToken: "trajectory_regressing",
    text: "Measured progress is moving away from the expected trajectory.", priority: 24,
    isContradiction: true,
  },
  attainability_unassessable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "There is not enough comparable outcome evidence to assess pace.", priority: 15,
    isContradiction: false,
  },
  attainability_authorized_expected_trajectory_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "The expected trajectory is not available for a reliable pace comparison.", priority: 15,
    isContradiction: false,
  },
  attainability_goal_progress_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "Comparable Goal progress is not available yet.", priority: 15,
    isContradiction: false,
  },
  attainability_phase_progress_baseline_unavailable: {
    role: "limit", semanticToken: "trajectory_measurement_pending",
    text: "A comparable Phase baseline is not available yet.", priority: 15,
    isContradiction: false,
  },
  attainability_completion_timing_not_firm: {
    role: "limit", semanticToken: "timeline_not_firm",
    text: "The completion timing is not firm enough for a precise pace assessment.", priority: 14,
    isContradiction: false,
  },
  attainability_remaining_gap_exceeds_authorized_expected_envelope: {
    role: "limit", semanticToken: "trajectory_behind",
    text: "The remaining gap exceeds the expected progress envelope.", priority: 22,
    isContradiction: true,
  },
  milestone_contradicted: {
    role: "limit", semanticToken: "milestone_contradicted",
    text: "A planned checkpoint has a contradicting result.", priority: 23,
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
    text: "The assessment window has not started yet.", priority: 13,
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
    text: "Energy calibration remains uncertain because the current evidence is not conclusive yet.",
  },
  recovery_evidence_missing: {
    semanticToken: "recovery_coverage_incomplete",
    text: "Recovery evidence remains insufficient for this assessment window.",
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
    text: "A Guardrail question remains unresolved.",
  },
  signal_conflict: {
    semanticToken: "signal_conflict",
    text: "Material evidence conflicts with another signal.",
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
  );
  const evidenceContextNote = explainEvidenceContext(assessment);
  const hasStructuredLineage = supportingFactors.length > 0 ||
    limitingFactors.length > 0 || nextDecisiveEvidence.length > 0;
  const summary = hasStructuredLineage
    ? surfaceSummary({ assessment, evidenceContextNote, historicalContext,
        limitingFactors, movementExplanation, nextDecisiveEvidence,
        supportingFactors, surface })
    : `Confidence remains ${confidenceBandLabel(assessment.confidenceBand)}, but the current assessment does not contain enough structured factor detail to explain the drivers precisely.`;
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
  return Object.freeze({
    qualitativeLevel: model.bandLabel,
    summary: model.summary,
    supportingFactors: model.supportingFactors.map((item) => item.text),
    limitingFactors: model.limitingFactors.map((item) => item.text),
    movementFactors: [model.movementExplanation.text].filter(Boolean),
    clarifyingFactors: model.nextDecisiveEvidence.map((item) => item.text),
    evidenceContextNote: model.evidenceContextNote ?? "",
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
    ? `Training progression has supported the plan across ${count} independent weekly periods.`
    : persistence === "emerging"
      ? "Training progression is supportive, though the signal is still emerging."
      : "Training progression supports the current plan.";
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
    text: "A consistently prepared follow-up DEXA can test whether the lean-mass response is durable while the body-fat Guardrail remains controlled.",
    priority: 25,
    sourceRefs: [],
    uncertaintyRefs: [...new Set(next.uncertaintyRefs ?? [])],
    decisionBoundary: next.decisionBoundary ?? null,
    expectedWindow: next.expectedWindow ?? null,
    lineageStatus: "canonical_next_evidence",
  }];
}

function explainMovement(assessment, supportingFactors, limitingFactors) {
  const prior = assessment.priorPercentage;
  const current = assessment.currentPercentage;
  const rationaleCode = assessment.narrativeExplanation?.movementRationaleCode ??
    assessment.sourceLineage?.confidenceExplanationDrivers?.materiallyChanged?.rationale ?? null;
  let text;
  if (assessment.movement === "increase") {
    const strengthenedBy = supportingFactors[0]?.text ??
      "The structured evidence materially strengthened the assessment.";
    text = `${strengthenedBy} Confidence increased from ${prior}% to ${current}%.`;
  } else if (assessment.movement === "decrease") {
    const weakenedBy = limitingFactors[0]?.text ??
      "The structured evidence materially weakened the assessment.";
    text = `${weakenedBy} Confidence decreased from ${prior}% to ${current}%.`;
  } else if (prior == null) {
    text = `This is the initial ${current}% Confidence assessment.`;
  } else {
    text = `Nothing material changed versus the predecessor; Confidence held ${prior}% → ${current}%.`;
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
    return "DEXA establishes the body-composition decision baseline. Weight remains monitoring context rather than direct outcome confirmation.";
  }
  if (hasDexa) {
    return "DEXA establishes the body-composition decision baseline; it does not by itself prove a durable response.";
  }
  if (hasWeight) return "Weight is monitoring context rather than direct outcome confirmation.";
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
  const mixed = tokens.has("agreement_mixed");
  const pending = tokens.has("direct_confirmation_pending") ||
    tokens.has("objective_uncertain") || tokens.has("trajectory_measurement_pending");
  const held = assessment.movement === "no_meaningful_change";
  const noContradiction = assessment.evidenceDurability?.contradictionState === "none";
  const nextDexa = nextDecisiveEvidence.some((item) => item.semanticToken === "follow_up_dexa");
  if (surface === "photo_event" && historicalContext?.matchedOnly) {
    const date = formatDate(historicalContext.eventDate ?? assessment.sourceCutoff);
    return `This Photo Event is paired with the Confidence assessment that existed at its ${date} cutoff. The matched historical event did not publish a successor assessment and did not replace current Confidence. The event does not retain enough participating Photo factor lineage to claim that Photos moved the score.`;
  }
  if (surface === "dexa_event") {
    const date = formatDate(historicalContext?.eventDate ?? assessment.sourceCutoff);
    const trustworthy = tokens.has("quality_adequate") || tokens.has("quality_robust");
    const support = onPath
      ? `provided ${trustworthy ? "trustworthy " : ""}body-composition evidence consistent with the expected trajectory`
      : `provided ${trustworthy ? "trustworthy " : ""}body-composition evidence`;
    const response = objectiveResponseLabel(assessment);
    const unresolved = listClauses([
      tokens.has("strategy_calibrating") && "strategy calibration",
      tokens.has("guardrails_watch") && "Guardrail status",
      recovery && "Recovery coverage",
    ]);
    const eventEffect = assessment.movement === "increase"
      ? `${movementExplanation.text} The scan materially strengthened the assessment rather than only establishing a baseline.`
      : assessment.movement === "decrease"
        ? `${movementExplanation.text} The scan materially weakened the assessment rather than only adding monitoring context.`
        : `It did not raise Confidence because it established the next decision baseline rather than proving a durable ${response} response; ${unresolved} still required observation.`;
    return `The ${date} DEXA ${support}. ${eventEffect} This historical event assessment does not replace today's Confidence.`;
  }
  if (surface === "monthly" && held && training) {
    return `Training progression is the strongest supportive domain signal, repeating across ${trainingPeriodCount(assessment)} independent weekly periods. Confidence held because ${listClauses([
      energy && "Energy calibration",
      recovery && "Recovery coverage",
      mixed && "signal agreement",
      pending && "direct outcome confirmation",
    ])} did not become materially more conclusive. It did not fall because ${listClauses([
      feasible && "the objective remained feasible",
      onPath && "the trajectory stayed on path",
      noContradiction && "no material contradiction emerged",
    ])}. ${nextDexa ? "A consistently prepared follow-up DEXA is the next major test." : "The next decisive evidence remains identified in the assessment."}`;
  }
  if (surface === "weekly" && held && training) {
    return `Training supported the plan for ${ordinalPeriod(trainingPeriodCount(assessment))} independent week, while ${listClauses([
      feasible && "the objective remained feasible",
      onPath && "the Goal stayed on its expected path",
    ])}. Confidence held because ${listClauses([
      mixed && "the broader evidence remained mixed",
      pending && "direct body-composition confirmation was still pending",
    ])}.`;
  }
  if (surface === "midweek") {
    return `Confidence remains ${confidenceBandLabel(assessment.confidenceBand)}. Partial-week evidence is useful context, but it does not by itself establish a completed-week change. ${movementExplanation.text}`;
  }
  if (surface === "home" && feasible && onPath) {
    return `The Goal remains feasible and on its expected path. ${training ? "Training is supportive, but " : ""}${listClauses([
      energy && "Energy calibration",
      recovery && "Recovery coverage",
      nextDexa && "a follow-up body-composition check",
    ])} ${energy || recovery || nextDexa ? "are not conclusive yet." : "The assessment remains appropriately bounded."}`;
  }
  if (surface === "goal") {
    return `${feasible ? "The Goal remains feasible" : `Confidence remains ${confidenceBandLabel(assessment.confidenceBand)}`}${onPath ? " and on its expected path" : ""}. ${training ? "Training progression is the strongest supportive signal. " : ""}${movementExplanation.text}${nextDexa ? " A consistently prepared follow-up DEXA is the next decisive evidence." : ""}`;
  }
  return `${movementExplanation.text} ${supportingFactors[0]?.text ?? ""} ${limitingFactors[0]?.text ?? ""} ${nextDecisiveEvidence[0]?.text ?? ""} ${evidenceContextNote ?? ""}`
    .replace(/\s+/gu, " ").trim();
}

function historicalContextText(context) {
  if (!context?.matchedOnly) return "This explanation is bound to its historical assessment.";
  return "This matched historical assessment did not replace current Confidence.";
}

function trainingPeriodCount(assessment) {
  const signal = (assessment.evidenceDurability?.signals ?? [])
    .find((item) => item.capability === "training_progression");
  return Math.max(1, Number(signal?.independentPeriodCount ??
    assessment.evidenceDurability?.independentPeriodCount ?? 1));
}

function objectiveResponseLabel(assessment) {
  const boundary = JSON.stringify(
    assessment.nextConfidenceBuildingEvidence?.decisionBoundary ?? ""
  ).toLowerCase();
  return boundary.includes("lean_mass") || boundary.includes("lean mass")
    ? "lean-mass" : "Goal";
}

function ordinalPeriod(count) {
  if (count === 2) return "a second";
  if (count === 3) return "a third";
  return "another";
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
