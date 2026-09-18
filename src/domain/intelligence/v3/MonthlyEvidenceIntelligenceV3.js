import { deepFreeze, round, semanticFingerprint } from "./V3Runtime.js";

export const MonthlyMeasurementTypeV3 = deepFreeze({
  DIRECT_OUTCOME: "DIRECT_OUTCOME",
  STRUCTURED_OBSERVATION: "STRUCTURED_OBSERVATION",
  RECORDED_INPUT: "RECORDED_INPUT",
  WEARABLE_ESTIMATE: "WEARABLE_ESTIMATE",
  DERIVED_ESTIMATE: "DERIVED_ESTIMATE",
  CONTEXTUAL_MEASUREMENT: "CONTEXTUAL_MEASUREMENT",
});

export const MonthlyDeviationStateV3 = deepFreeze({
  NORMAL_VARIATION: "NORMAL_VARIATION",
  ISOLATED_DEVIATION: "ISOLATED_DEVIATION",
  REPEATED_DEVIATION: "REPEATED_DEVIATION",
  PERSISTENT_TREND_CHANGE: "PERSISTENT_TREND_CHANGE",
  STRUCTURAL_CHANGE: "STRUCTURAL_CHANGE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});

export const MonthlyCrossSourceRelationshipV3 = deepFreeze({
  CORROBORATION: "CROSS_SOURCE_CORROBORATION",
  TENSION: "CROSS_SOURCE_TENSION",
  ESTIMATE_VS_OUTCOME: "ESTIMATE_VS_OUTCOME_TENSION",
  LEADING_VS_LAGGING: "LEADING_VS_LAGGING_TENSION",
  NEUTRAL: "NO_MATERIAL_RELATIONSHIP",
});

const QUALITY_RANK = Object.freeze({ insufficient: 0, limited: 1,
  adequate: 2, robust: 3 });
const RELEVANCE_RANK = Object.freeze({ none: 0, contextual: 1,
  supporting: 2, high: 3, direct: 4 });

/**
 * Builds a bounded, transparent Monthly reasoning model from canonical history.
 * It deliberately derives personal calibration on demand. The result contains no
 * learned coefficient, persistence instruction, publication payload, or
 * Confidence mutation.
 */
export function createMonthlyEvidenceIntelligenceV3({
  window,
  goalPolicy,
  outcomes = [],
  photos = [],
  training = {},
  nutrition = [],
  activity = [],
  energy = [],
  weight = [],
  recovery = [],
  execution = [],
  historicalCalibration = [],
  communicationMemory = [],
  currentConfidence = null,
} = {}) {
  assertWindow(window);
  const personalCalibration = derivePersonalCalibration({
    historicalCalibration,
    energy,
  });
  const trainingPattern = evaluateTrainingPattern({
    sessions: training.sessions ?? [],
    baselineSessions: training.baselineSessions ?? [],
    configuredSplit: training.configuredSplit ?? null,
    window,
  });
  const sourceMatrix = [
    ...outcomes.map((item) => outcomeMatrixRow(item, goalPolicy)),
    ...photos.map((item) => photoMatrixRow(item, goalPolicy)),
    trainingMatrixRow(training, trainingPattern, goalPolicy),
    trainingSplitMatrixRow(trainingPattern, goalPolicy),
    coverageMatrixRow("nutrition", nutrition, goalPolicy),
    coverageMatrixRow("activity", activity, goalPolicy),
    energyMatrixRow(energy, personalCalibration, goalPolicy),
    weightMatrixRow(weight, goalPolicy),
    optionalCoverageMatrixRow("recovery", recovery, goalPolicy),
    optionalCoverageMatrixRow("execution", execution, goalPolicy),
  ].filter(Boolean);
  const relationships = deriveCrossSourceRelationships(sourceMatrix);
  applyRelationships(sourceMatrix, relationships);
  const candidates = deriveMonthlyCandidates({
    sourceMatrix,
    trainingPattern,
    trainingCandidates: training.coachingCandidates ?? [],
    communicationMemory,
  });
  const selectedHighlights = selectMonthlyHighlights(candidates);
  const recommendation = deriveRecommendation({
    sourceMatrix,
    relationships,
    goalPolicy,
  });
  const confidenceConsequence = deriveConfidenceConsequence({
    sourceMatrix,
    relationships,
    currentConfidence,
  });
  const semantic = {
    schemaVersion: "monthly_evidence_intelligence_v3",
    window: { ...window },
    sourceMatrix,
    relationships,
    personalCalibration,
    trainingPattern,
    selectedHighlights,
    rejectedHighlights: candidates.filter((item) =>
      !selectedHighlights.some((selected) => selected.candidateId ===
        item.candidateId)).map((item) => ({
      candidateId: item.candidateId,
      domain: item.domain,
      reason: item.rejectionReason ?? "lower_monthly_priority",
    })),
    recommendation,
    confidenceConsequence,
    persistence: {
      required: false,
      mode: "derive_from_bounded_canonical_history",
      auditableInputs: ["sourceMatrix", "historicalCalibration",
        "trainingPattern"],
    },
    publication: { mode: "shadow_only", writes: 0 },
  };
  return deepFreeze({
    ...semantic,
    id: `monthly_evidence_intelligence_v3|${semanticFingerprint(
      semantic).slice(7)}`,
  });
}

function outcomeMatrixRow(item, goalPolicy) {
  return matrixRow({
    sourceId: item.id,
    domain: item.domain ?? "outcome",
    statement: item.statement,
    measurementType: MonthlyMeasurementTypeV3.DIRECT_OUTCOME,
    quality: item.quality ?? "robust",
    uncertainty: item.limitations ?? [],
    deviation: item.deviation ?? MonthlyDeviationStateV3.STRUCTURAL_CHANGE,
    goalRelevance: relevance(goalPolicy, item.domain ?? "outcome", "direct"),
    direction: item.direction ?? "supports",
    strategicConsequence: item.strategicConsequence ??
      "authoritative_outcome_anchor",
    narrativeConsequence: item.narrativeConsequence ??
      "monthly_major_highlight",
    observedAt: item.observedAt,
    facts: item.facts ?? {},
  });
}

function photoMatrixRow(item, goalPolicy) {
  const comparable = item.comparability === "comparable";
  const quality = comparable ? item.quality ?? "adequate" : "limited";
  const configured = relevance(goalPolicy, "photos", "supporting");
  const direction = comparable ? item.direction ?? "indeterminate" :
    "indeterminate";
  return matrixRow({
    sourceId: item.id,
    domain: "photos",
    statement: item.statement,
    measurementType: MonthlyMeasurementTypeV3.STRUCTURED_OBSERVATION,
    quality,
    uncertainty: [
      ...(!comparable ? ["comparison_not_reliable"] : []),
      ...(item.limitations ?? []),
    ],
    deviation: comparable ? item.deviation ??
      MonthlyDeviationStateV3.NORMAL_VARIATION :
      MonthlyDeviationStateV3.INSUFFICIENT_DATA,
    goalRelevance: configured,
    direction,
    strategicConsequence: comparable && QUALITY_RANK[quality] >= 2
      ? "qualitative_context_only" : "no_strategic_change",
    narrativeConsequence: item.inWindow === false
      ? "carry_forward_context_not_monthly_highlight"
      : comparable ? "eligible_if_decision_relevant" : "omit",
    observedAt: item.observedAt,
    facts: { comparability: item.comparability,
      observationCount: item.observationCount ?? null,
      inWindow: item.inWindow !== false },
  });
}

function trainingMatrixRow(training, pattern, goalPolicy) {
  const candidates = training.coachingCandidates ?? [];
  const progressive = candidates.filter((item) =>
    ["milestone", "progression", "record"].includes(item.kind));
  const adverse = candidates.filter((item) =>
    ["plateau", "deterioration"].includes(item.kind));
  const direction = adverse.some((item) => item.persistent)
    ? "mixed" : progressive.length ? "supports" : "indeterminate";
  return matrixRow({
    sourceId: "monthly|training_performance",
    domain: "training_performance",
    statement: training.statement ?? `${pattern.sessionCount} resistance-training sessions were recorded in the window.`,
    measurementType: MonthlyMeasurementTypeV3.STRUCTURED_OBSERVATION,
    quality: pattern.sessionCount >= 4 ? "robust" : pattern.sessionCount
      ? "adequate" : "insufficient",
    uncertainty: training.limitations ?? [],
    deviation: progressive.length >= 2
      ? MonthlyDeviationStateV3.REPEATED_DEVIATION
      : progressive.length === 1 ? MonthlyDeviationStateV3.ISOLATED_DEVIATION
        : pattern.sessionCount ? MonthlyDeviationStateV3.NORMAL_VARIATION
          : MonthlyDeviationStateV3.INSUFFICIENT_DATA,
    goalRelevance: relevance(goalPolicy, "training", "high"),
    direction,
    strategicConsequence: direction === "supports"
      ? "supports_forward_outlook_without_impersonating_outcome"
      : direction === "mixed" ? "watch_leading_indicator"
        : "no_new_performance_conclusion",
    narrativeConsequence: progressive.length
      ? "select_specific_personal_highlight" : "brief_execution_context",
    observedAt: pattern.lastSessionDate,
    facts: { sessionCount: pattern.sessionCount,
      progressiveCandidateCount: progressive.length,
      adverseCandidateCount: adverse.length },
  });
}

function trainingSplitMatrixRow(pattern, goalPolicy) {
  return matrixRow({
    sourceId: "monthly|training_split",
    domain: "training_split",
    statement: pattern.summary,
    measurementType: MonthlyMeasurementTypeV3.RECORDED_INPUT,
    quality: pattern.baselineMode === "insufficient" ? "limited" : "adequate",
    uncertainty: pattern.limitations,
    deviation: pattern.deviation,
    goalRelevance: relevance(goalPolicy, "training", "high"),
    direction: pattern.persistentMisses.length ? "contradicts" :
      pattern.returnedToRhythm || pattern.sessionCount ? "supports" :
        "indeterminate",
    strategicConsequence: pattern.persistentMisses.length
      ? "training_frequency_requires_attention"
      : pattern.isolatedMisses.length || pattern.shortBreaks.length
        ? "bounded_watch_only" : "split_execution_supportive",
    narrativeConsequence: pattern.shortBreaks.length ||
      pattern.extraExposures.length || pattern.isolatedMisses.length
      ? "eligible_specific_monthly_context" : "omit_if_unchanged",
    observedAt: pattern.lastSessionDate,
    facts: {
      baselineMode: pattern.baselineMode,
      expectedWeeklyFrequencies: pattern.expectedWeeklyFrequencies,
      actualWeeklyFrequencies: pattern.actualWeeklyFrequencies,
      extraExposures: pattern.extraExposures,
      isolatedMisses: pattern.isolatedMisses,
      persistentMisses: pattern.persistentMisses,
      shortBreaks: pattern.shortBreaks,
      returnedToRhythm: pattern.returnedToRhythm,
    },
  });
}

function coverageMatrixRow(domain, records, goalPolicy) {
  const expected = expectedDays(records);
  const usable = records.filter((item) => item.usable !== false);
  const ratio = expected ? usable.length / expected : 0;
  const measurementType = domain === "activity"
    ? MonthlyMeasurementTypeV3.WEARABLE_ESTIMATE
    : MonthlyMeasurementTypeV3.RECORDED_INPUT;
  const quality = ratio >= 0.85 ? "adequate" : ratio >= 0.5
    ? "limited" : "insufficient";
  const averageValue = average(usable.map((item) => item.value));
  return matrixRow({
    sourceId: `monthly|${domain}`,
    domain,
    statement: coverageStatement(domain, usable, expected, averageValue,
      records[0]),
    measurementType,
    quality,
    uncertainty: unique(records.flatMap((item) => item.limitations ?? [])),
    deviation: deviationFromRecords(records),
    goalRelevance: relevance(goalPolicy, domain, "supporting"),
    direction: recordsDirection(records),
    strategicConsequence: quality === "insufficient"
      ? "do_not_draw_execution_conclusion" : "execution_context",
    narrativeConsequence: records.some((item) => item.narrativeWorthy)
      ? "eligible_if_selected" : "internal_context_unless_actionable",
    observedAt: latestDate(records),
    facts: { expectedDays: expected, usableDays: usable.length,
      coverageRatio: round(ratio, 3), average: averageValue },
  });
}

function optionalCoverageMatrixRow(domain, records, goalPolicy) {
  if (!records.length) return matrixRow({
    sourceId: `monthly|${domain}`,
    domain,
    statement: `There is not enough ${domain} evidence for a monthly conclusion.`,
    measurementType: MonthlyMeasurementTypeV3.RECORDED_INPUT,
    quality: "insufficient",
    uncertainty: [`${domain}_coverage_insufficient`],
    deviation: MonthlyDeviationStateV3.INSUFFICIENT_DATA,
    goalRelevance: relevance(goalPolicy, domain, "supporting"),
    direction: "indeterminate",
    strategicConsequence: "not_assessed",
    narrativeConsequence: "omit",
    observedAt: null,
    facts: { expectedDays: 0, usableDays: 0 },
  });
  return coverageMatrixRow(domain, records, goalPolicy);
}

function energyMatrixRow(records, calibration, goalPolicy) {
  const paired = records.filter((item) => Number.isFinite(item.balance));
  const averageBalance = average(paired.map((item) => item.balance));
  const quality = paired.length >= 10 ? "adequate" : paired.length >= 4
    ? "limited" : "insufficient";
  const relationship = calibration.currentRelationship;
  return matrixRow({
    sourceId: "monthly|derived_energy",
    domain: "energy",
    statement: paired.length
      ? `${paired.length} days support a calculated average Energy balance of ${signed(round(averageBalance))} kcal/day.`
      : "There are not enough paired Nutrition and Activity days to calculate Energy balance.",
    measurementType: MonthlyMeasurementTypeV3.DERIVED_ESTIMATE,
    quality,
    uncertainty: unique([
      "intake_is_logged_or_interpreted_not_physically_observed",
      "active_expenditure_is_wearable_estimated",
      ...(records.flatMap((item) => item.limitations ?? [])),
    ]),
    deviation: deviationFromRecords(records),
    goalRelevance: relevance(goalPolicy, "energy", "supporting"),
    direction: recordsDirection(records),
    strategicConsequence: relationship === "poor_literal_alignment"
      ? "directional_input_with_reduced_literal_reliance"
      : "derived_strategy_context",
    narrativeConsequence: relationship === "poor_literal_alignment"
      ? "mention_only_if_it_explains_a_decision_or_watch_item"
      : "eligible_if_decision_relevant",
    observedAt: latestDate(records),
    facts: { pairedDays: paired.length, averageBalance: round(averageBalance),
      surplusDays: paired.filter((item) => item.balance > 0).length,
      deficitDays: paired.filter((item) => item.balance < 0).length,
      historicalCalibration: relationship,
      segments: summarizeEnergySegments(paired) },
  });
}

function weightMatrixRow(records, goalPolicy) {
  const usable = records.filter((item) => Number.isFinite(item.value));
  const first = usable[0]?.value ?? null;
  const last = usable.at(-1)?.value ?? null;
  return matrixRow({
    sourceId: "monthly|weight",
    domain: "weight",
    statement: usable.length
      ? `Morning weight moved from ${format(first, 1)} to ${format(last, 1)} lb across ${usable.length} observations.`
      : "There is not enough weight evidence for a trend.",
    measurementType: MonthlyMeasurementTypeV3.CONTEXTUAL_MEASUREMENT,
    quality: usable.length >= 10 ? "adequate" : usable.length >= 3
      ? "limited" : "insufficient",
    uncertainty: ["body_weight_does_not_identify_tissue_composition"],
    deviation: deviationFromRecords(records),
    goalRelevance: relevance(goalPolicy, "weight", "supporting"),
    direction: recordsDirection(records),
    strategicConsequence: usable.length >= 3
      ? "trajectory_context_not_direct_composition_proof" : "not_assessed",
    narrativeConsequence: records.some((item) => item.narrativeWorthy)
      ? "eligible_if_selected" : "supporting_context",
    observedAt: latestDate(records),
    facts: { observations: usable.length, first, last,
      average: average(usable.map((item) => item.value)),
      minimum: minimum(usable.map((item) => item.value)),
      maximum: maximum(usable.map((item) => item.value)) },
  });
}

function derivePersonalCalibration({ historicalCalibration, energy }) {
  const comparable = historicalCalibration.filter((item) =>
    item.comparable !== false && item.derivedDirection &&
      item.realizedOutcomeDirection);
  const disagreements = comparable.filter((item) =>
    item.derivedDirection !== item.realizedOutcomeDirection);
  const repeatedDisagreement = disagreements.length >= 2 ||
    disagreements.some((item) => item.authoritativeOutcome === true &&
      item.durationDays >= 14);
  return {
    mode: "transparent_on_demand_history",
    comparableWindows: comparable.length,
    alignedWindows: comparable.length - disagreements.length,
    tensionWindows: disagreements.length,
    currentRelationship: repeatedDisagreement
      ? "poor_literal_alignment" : comparable.length
        ? "directionally_informative" : "insufficient_history",
    learnedCorrectionFactor: null,
    evidenceIds: unique(comparable.flatMap((item) => item.evidenceIds ?? [])),
    currentPairedDays: energy.filter((item) => Number.isFinite(
      item.balance)).length,
  };
}

function evaluateTrainingPattern({ sessions, baselineSessions,
  configuredSplit, window }) {
  const normalized = sessions.map(normalizeSession).filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
  const baseline = baselineSessions.map(normalizeSession).filter(Boolean);
  const configured = configuredSplit?.weeklyFrequencies ?? null;
  const expectedWeeklyFrequencies = configured ??
    inferPersonalWeeklyFrequency(baseline);
  const baselineMode = configured ? "configured_strategy" :
    Object.keys(expectedWeeklyFrequencies).length ? "personal_history" :
      "insufficient";
  const actualWeeklyFrequencies = weeklyCategoryCounts(normalized);
  const comparableWeeklyFrequencies = Object.fromEntries(Object.entries(
    actualWeeklyFrequencies).filter(([week]) => fullWeekInsideWindow(
    week, window)));
  const deviations = compareWeeklyFrequencies(comparableWeeklyFrequencies,
    expectedWeeklyFrequencies);
  const shortBreaks = detectShortBreaks(normalized, window);
  const returnedToRhythm = shortBreaks.some((item) => item.returnedAt != null);
  const limitations = unique([
    ...(!configured ? ["explicit_category_split_unavailable"] : []),
    ...(baselineMode === "insufficient" ? ["personal_split_baseline_insufficient"] : []),
  ]);
  const summaryParts = [`${normalized.length} resistance-training sessions were recorded.`];
  if (shortBreaks.length) summaryParts.push(
    `${shortBreaks.length} short break${shortBreaks.length === 1 ? "" : "s"} occurred without an inferred cause.`);
  if (returnedToRhythm) summaryParts.push("Training returned afterward.");
  return {
    baselineMode,
    sessionCount: normalized.length,
    expectedWeeklyFrequencies,
    actualWeeklyFrequencies,
    comparableWeeklyFrequencies,
    extraExposures: deviations.extra,
    isolatedMisses: deviations.isolatedMisses,
    persistentMisses: deviations.persistentMisses,
    shortBreaks,
    returnedToRhythm,
    lastSessionDate: normalized.at(-1)?.date ?? null,
    deviation: deviations.persistentMisses.length
      ? MonthlyDeviationStateV3.PERSISTENT_TREND_CHANGE
      : deviations.isolatedMisses.length || shortBreaks.length
        ? MonthlyDeviationStateV3.ISOLATED_DEVIATION
        : normalized.length ? MonthlyDeviationStateV3.NORMAL_VARIATION
          : MonthlyDeviationStateV3.INSUFFICIENT_DATA,
    limitations,
    summary: summaryParts.join(" "),
  };
}

function deriveCrossSourceRelationships(matrix) {
  const usable = matrix.filter((item) => QUALITY_RANK[item.quality] >= 1 &&
    item.direction !== "indeterminate");
  const relationships = [];
  for (let leftIndex = 0; leftIndex < usable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < usable.length;
      rightIndex += 1) {
      const left = usable[leftIndex];
      const right = usable[rightIndex];
      if (!relationshipRelevant(left, right)) continue;
      const sameDirection = normalizedDirection(left.direction) ===
        normalizedDirection(right.direction);
      let type = sameDirection
        ? MonthlyCrossSourceRelationshipV3.CORROBORATION
        : MonthlyCrossSourceRelationshipV3.TENSION;
      if (!sameDirection && [left, right].some((item) =>
        item.measurementType === MonthlyMeasurementTypeV3.DERIVED_ESTIMATE) &&
        [left, right].some((item) =>
          item.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME)) {
        type = MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME;
      } else if (!sameDirection && [left, right].some((item) =>
        item.domain === "training_performance") && [left, right].some((item) =>
        item.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME)) {
        type = MonthlyCrossSourceRelationshipV3.LEADING_VS_LAGGING;
      }
      relationships.push({
        relationshipId: `monthly_relationship|${left.sourceId}|${right.sourceId}`,
        type,
        sourceIds: [left.sourceId, right.sourceId],
        strongerSourceId: strongerSource(left, right)?.sourceId ?? null,
        strategicConsequence: relationshipConsequence(type, left, right),
      });
    }
  }
  const calibratedEnergy = matrix.find((item) => item.domain === "energy" &&
    item.facts?.historicalCalibration === "poor_literal_alignment");
  const favorableOutcome = matrix.find((item) =>
    item.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME &&
    item.direction === "supports" && QUALITY_RANK[item.quality] >= 2);
  if (calibratedEnergy && favorableOutcome && !relationships.some((item) =>
    item.type === MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME &&
    item.sourceIds.includes(calibratedEnergy.sourceId))) {
    relationships.push({
      relationshipId: `monthly_relationship|${favorableOutcome.sourceId}|${calibratedEnergy.sourceId}`,
      type: MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME,
      sourceIds: [favorableOutcome.sourceId, calibratedEnergy.sourceId],
      strongerSourceId: favorableOutcome.sourceId,
      strategicConsequence:
        "reduce_literal_reliance_on_estimate_not_on_recorded_values",
    });
  }
  return relationships;
}

function applyRelationships(matrix, relationships) {
  for (const row of matrix) {
    row.corroborates = relationships.filter((item) =>
      item.type === MonthlyCrossSourceRelationshipV3.CORROBORATION &&
      item.sourceIds.includes(row.sourceId)).flatMap((item) =>
      item.sourceIds.filter((id) => id !== row.sourceId));
    row.tensionsWith = relationships.filter((item) =>
      item.type !== MonthlyCrossSourceRelationshipV3.CORROBORATION &&
      item.sourceIds.includes(row.sourceId)).flatMap((item) =>
      item.sourceIds.filter((id) => id !== row.sourceId));
  }
}

function deriveMonthlyCandidates({ sourceMatrix, trainingPattern,
  trainingCandidates, communicationMemory }) {
  const communicated = new Map(communicationMemory.map((item) =>
    [item.topicKey, item.materialStateKey]));
  const candidates = [];
  for (const item of trainingCandidates) {
    candidates.push(candidate({
      candidateId: item.id,
      domain: "training",
      topicKey: item.topicKey,
      materialStateKey: item.materialStateKey,
      headline: item.headline ?? trainingCandidateHeadline(item),
      detail: item.detail ?? trainingCandidateDetail(item),
      kind: item.kind,
      score: 70 + (item.milestoneValue ?? 0) * 20 +
        (item.decisionImpact ?? 0) * 10,
      alreadyCommunicated: communicated.get(item.topicKey) ===
        item.materialStateKey,
    }));
  }
  for (const row of sourceMatrix) {
    if (["monthly_major_highlight", "eligible_if_selected",
      "eligible_specific_monthly_context"].includes(row.narrativeConsequence)) {
      const topicKey = `monthly|${row.domain}`;
      candidates.push(candidate({
        candidateId: `monthly_candidate|${row.sourceId}`,
        domain: row.domain,
        topicKey,
        materialStateKey: semanticFingerprint(row),
        headline: row.statement,
        detail: row.strategicConsequence,
        kind: row.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME
          ? "outcome" : "context",
        score: matrixNarrativeScore(row),
        alreadyCommunicated: communicated.get(topicKey) ===
          semanticFingerprint(row),
      }));
    }
  }
  for (const item of trainingPattern.shortBreaks) {
    candidates.push(candidate({
      candidateId: `monthly_candidate|training_break|${item.startDate}`,
      domain: "training",
      topicKey: "monthly|training|short_break",
      materialStateKey: `${item.startDate}|${item.endDate}|${item.returnedAt}`,
      headline: `Training paused for ${item.days} days, then returned on ${item.returnedAt}.`,
      detail: "No cause is inferred from the evidence.",
      kind: "split_deviation",
      score: item.returnedAt ? 64 : 58,
      alreadyCommunicated: communicated.get("monthly|training|short_break") ===
        `${item.startDate}|${item.endDate}|${item.returnedAt}`,
    }));
  }
  return candidates.map((item) => item.alreadyCommunicated &&
    item.kind !== "outcome" ? { ...item, score: item.score - 45,
      rejectionReason: "already_communicated_without_material_change" } : item)
    .sort((left, right) => right.score - left.score ||
      left.candidateId.localeCompare(right.candidateId));
}

function selectMonthlyHighlights(candidates) {
  const selected = [];
  const domains = new Map();
  for (const item of candidates) {
    if (item.score < 50) continue;
    const count = domains.get(item.domain) ?? 0;
    if (count >= 2) continue;
    if (item.alreadyCommunicated && item.kind !== "outcome") continue;
    selected.push(item);
    domains.set(item.domain, count + 1);
    if (selected.length === 5) break;
  }
  return selected;
}

function deriveRecommendation({ sourceMatrix, relationships, goalPolicy }) {
  const directOutcome = sourceMatrix.find((item) =>
    item.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME &&
      item.direction === "supports" && item.quality === "robust");
  const confirmedAdverse = sourceMatrix.filter((item) =>
    item.direction === "contradicts" && QUALITY_RANK[item.quality] >= 2 &&
      RELEVANCE_RANK[item.goalRelevance] >= 2);
  const peerTension = relationships.some((item) =>
    item.type === MonthlyCrossSourceRelationshipV3.TENSION &&
      item.strongerSourceId == null);
  const change = confirmedAdverse.length >= 2 || peerTension;
  return {
    action: change ? "review_current_strategy" :
      directOutcome ? "continue_current_strategy" : "continue_and_gather_evidence",
    basis: change ? "persistent_corroborated_adverse_evidence" :
      directOutcome ? "strong_outcome_with_no_confirmed_reversal" :
        "insufficient_reason_for_structural_change",
    derivedEstimateAloneCanChangeStrategy: false,
    guardrail: goalPolicy?.guardrail ?? null,
  };
}

function deriveConfidenceConsequence({ sourceMatrix, relationships,
  currentConfidence }) {
  const confirmedReversal = relationships.some((item) =>
    item.type === MonthlyCrossSourceRelationshipV3.LEADING_VS_LAGGING &&
      sourceMatrix.filter((row) => item.sourceIds.includes(row.sourceId) &&
        row.direction === "contradicts" && QUALITY_RANK[row.quality] >= 2)
        .length >= 2);
  return {
    priorPercentage: currentConfidence,
    currentPercentage: currentConfidence,
    delta: 0,
    movement: "no_meaningful_change",
    reason: confirmedReversal
      ? "recalculation_required_by_canonical_confidence_engine"
      : "monthly_awareness_does_not_change_confidence_without_new_decision_relevant_semantics",
    narrativeInterestChangesConfidence: false,
    measurementUncertaintyAutomaticallyLowersConfidence: false,
  };
}

function compareWeeklyFrequencies(actual, expected) {
  const extra = [];
  const missesByCategory = new Map();
  for (const [week, counts] of Object.entries(actual)) {
    for (const [category, expectedCount] of Object.entries(expected)) {
      const actualCount = counts[category] ?? 0;
      if (actualCount > expectedCount) extra.push({ week, category,
        expected: expectedCount, actual: actualCount });
      if (actualCount < expectedCount) {
        const values = missesByCategory.get(category) ?? [];
        values.push({ week, category, expected: expectedCount,
          actual: actualCount });
        missesByCategory.set(category, values);
      }
    }
  }
  const isolatedMisses = [];
  const persistentMisses = [];
  for (const values of missesByCategory.values()) {
    if (values.length >= 2) persistentMisses.push(...values);
    else isolatedMisses.push(...values);
  }
  return { extra, isolatedMisses, persistentMisses };
}

function inferPersonalWeeklyFrequency(sessions) {
  const counts = weeklyCategoryCounts(sessions);
  const weeks = Object.values(counts);
  const categories = unique(weeks.flatMap((item) => Object.keys(item)));
  return Object.fromEntries(categories.map((category) => {
    const values = weeks.map((item) => item[category] ?? 0).sort((a, b) => a - b);
    return [category, values[Math.floor((values.length - 1) / 2)]];
  }).filter(([, frequency]) => frequency > 0));
}

function fullWeekInsideWindow(week, window) {
  return week >= window.startDate && addDays(week, 6) <= window.endDate;
}

function weeklyCategoryCounts(sessions) {
  const result = {};
  for (const session of sessions) {
    const week = weekStart(session.date);
    result[week] ??= {};
    for (const category of unique(session.categories)) {
      result[week][category] = (result[week][category] ?? 0) + 1;
    }
  }
  return result;
}

function detectShortBreaks(sessions, window) {
  const dates = unique(sessions.map((item) => item.date)).sort();
  const result = [];
  for (let index = 1; index < dates.length; index += 1) {
    const gap = dayDifference(dates[index - 1], dates[index]) - 1;
    if (gap < 2 || gap > 5) continue;
    result.push({ startDate: addDays(dates[index - 1], 1),
      endDate: addDays(dates[index], -1), days: gap,
      returnedAt: dates[index], inferredReason: null });
  }
  if (!dates.length && window?.startDate && window?.endDate) return [];
  return result;
}

function deviationFromRecords(records) {
  const flagged = records.filter((item) => item.deviation === true ||
    item.deviation === "deviated");
  if (!records.length) return MonthlyDeviationStateV3.INSUFFICIENT_DATA;
  if (!flagged.length) return MonthlyDeviationStateV3.NORMAL_VARIATION;
  const persistent = longestConsecutiveDates(flagged.map((item) => item.date));
  if (persistent >= 4) return MonthlyDeviationStateV3.PERSISTENT_TREND_CHANGE;
  if (flagged.length >= 2) return MonthlyDeviationStateV3.REPEATED_DEVIATION;
  return MonthlyDeviationStateV3.ISOLATED_DEVIATION;
}

function matrixRow(value) {
  return { ...value, corroborates: [], tensionsWith: [] };
}

function candidate(value) {
  return { ...value, score: round(value.score), narrativeWorthy: value.score >= 50 };
}

function matrixNarrativeScore(row) {
  return (RELEVANCE_RANK[row.goalRelevance] ?? 0) * 12 +
    (QUALITY_RANK[row.quality] ?? 0) * 8 +
    (row.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME ? 30 : 0) +
    (row.deviation === MonthlyDeviationStateV3.PERSISTENT_TREND_CHANGE ? 12 : 0);
}

function relevance(policy, domain, fallback) {
  return policy?.domains?.[domain]?.goalRelevance ?? fallback;
}

function relationshipRelevant(left, right) {
  if (left.sourceId === right.sourceId) return false;
  if (RELEVANCE_RANK[left.goalRelevance] < 1 ||
      RELEVANCE_RANK[right.goalRelevance] < 1) return false;
  if (normalizedDirection(left.direction) === "indeterminate" ||
      normalizedDirection(right.direction) === "indeterminate") return false;
  const types = new Set([left.measurementType, right.measurementType]);
  if (types.has(MonthlyMeasurementTypeV3.DIRECT_OUTCOME) && [
    MonthlyMeasurementTypeV3.STRUCTURED_OBSERVATION,
    MonthlyMeasurementTypeV3.DERIVED_ESTIMATE,
    MonthlyMeasurementTypeV3.CONTEXTUAL_MEASUREMENT,
  ].some((type) => types.has(type))) return true;
  const pair = [left.domain, right.domain].sort().join("|");
  return new Set([
    "photos|training_performance",
    "photos|weight",
    "training_performance|training_split",
    "nutrition|training_performance",
    "recovery|training_performance",
    "execution|training_split",
  ]).has(pair);
}

function strongerSource(left, right) {
  const score = (item) => (RELEVANCE_RANK[item.goalRelevance] ?? 0) * 10 +
    (QUALITY_RANK[item.quality] ?? 0) * 4 +
    (item.measurementType === MonthlyMeasurementTypeV3.DIRECT_OUTCOME ? 8 : 0) -
    (item.measurementType === MonthlyMeasurementTypeV3.DERIVED_ESTIMATE ? 5 : 0);
  const difference = score(left) - score(right);
  return Math.abs(difference) < 3 ? null : difference > 0 ? left : right;
}

function relationshipConsequence(type, left, right) {
  if (type === MonthlyCrossSourceRelationshipV3.CORROBORATION) {
    return "strengthen_interpretation_without_automatic_confidence_movement";
  }
  if (type === MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME) {
    return "reduce_literal_reliance_on_estimate_not_on_recorded_values";
  }
  if (type === MonthlyCrossSourceRelationshipV3.LEADING_VS_LAGGING) {
    return "increase_attention_to_forward_outlook_without_erasing_prior_outcome";
  }
  return strongerSource(left, right)
    ? "localize_uncertainty_to_weaker_conclusion"
    : "open_resolution_question";
}

function normalizedDirection(value) {
  return value === "mixed" ? "indeterminate" : value;
}

function recordsDirection(records) {
  const directions = new Set(records.map((item) => item.direction)
    .filter((item) => ["supports", "contradicts"].includes(item)));
  return directions.size > 1 ? "mixed" : [...directions][0] ?? "indeterminate";
}

function coverageStatement(domain, usable, expected, averageValue, sample) {
  const label = domain === "nutrition" ? "Nutrition" :
    domain === "activity" ? "Activity" : upperFirst(domain);
  let averageText = "";
  if (Number.isFinite(averageValue) && sample?.metricName) {
    averageText = ` Recorded ${sample.metricName} averaged ${format(
      averageValue, 1)}${sample.unit ? ` ${sample.unit}` : ""}.`;
  }
  return `${label} was available on ${usable.length} of ${expected} expected days.${averageText}`;
}

function trainingCandidateHeadline(item) {
  const current = Number(item.currentValue);
  const previous = Number(item.previousValue);
  const percent = Number.isFinite(Number(item.percentChange))
    ? Number(item.percentChange)
    : Number.isFinite(current) && Number.isFinite(previous) && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100 : null;
  if (item.kind === "record" && item.metric === "session_volume") {
    return `${item.subjectLabel} set a new session-volume best${
      Number.isFinite(percent) ? `, ${format(percent, 1)}% above the previous best` : ""}.`;
  }
  if (item.kind === "milestone" && item.metric === "load") {
    return `${item.subjectLabel} reached a new load best at ${format(
      current)}${item.unit ? ` ${item.unit}` : ""}.`;
  }
  if (item.kind === "progression" && item.metric === "session_volume") {
    return `${item.subjectLabel} added ${format(Math.abs(percent), 1)}% more session volume than the prior comparable exposure.`;
  }
  return `${item.subjectLabel ?? "Training"} produced a meaningful personal progression.`;
}

function trainingCandidateDetail(item) {
  if (Number.isFinite(Number(item.load)) && Number(item.load) > 0) {
    return `The comparable work used ${format(Number(item.load))}${
      item.loadUnit ? ` ${item.loadUnit}` : ""}.`;
  }
  return "The observation is based on comparable personal Training history.";
}

function expectedDays(records) {
  return Math.max(0, ...records.map((item) => Number(item.expectedDays) || 0),
    records.length);
}

function summarizeEnergySegments(records) {
  const groups = new Map();
  for (const item of records) {
    if (!item.segment) continue;
    const values = groups.get(item.segment) ?? [];
    values.push(item.balance);
    groups.set(item.segment, values);
  }
  return [...groups.entries()].map(([segment, values]) => ({
    segment,
    days: values.length,
    averageBalance: round(average(values)),
    surplusDays: values.filter((value) => value > 0).length,
    deficitDays: values.filter((value) => value < 0).length,
  }));
}

function normalizeSession(value) {
  if (!value?.date) return null;
  return { id: value.id ?? `${value.date}|${(value.categories ?? []).join("|")}`,
    date: value.date, categories: unique(value.categories ?? []) };
}

function latestDate(records) {
  return records.map((item) => item.date ?? item.observedAt).filter(Boolean)
    .sort().at(-1) ?? null;
}

function longestConsecutiveDates(values) {
  const dates = unique(values.filter(Boolean)).sort();
  let longest = dates.length ? 1 : 0;
  let current = longest;
  for (let index = 1; index < dates.length; index += 1) {
    if (dayDifference(dates[index - 1], dates[index]) === 1) current += 1;
    else current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function weekStart(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayDifference(left, right) {
  return Math.round((Date.parse(`${right}T00:00:00.000Z`) -
    Date.parse(`${left}T00:00:00.000Z`)) / 86400000);
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) /
    usable.length : null;
}

function minimum(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.min(...usable) : null;
}

function maximum(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.max(...usable) : null;
}

function signed(value) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
}

function format(value, digits = 0) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function upperFirst(value) {
  const text = String(value ?? "");
  return `${text.charAt(0).toLocaleUpperCase("en-US")}${text.slice(1)}`;
}

function unique(values) {
  return [...new Set(values.filter((item) => item != null && item !== ""))];
}

function assertWindow(window) {
  if (!window?.startDate || !window?.endDate || !window?.cutoff) {
    throw new Error("Monthly evidence intelligence requires a bounded window and explicit cutoff.");
  }
}
