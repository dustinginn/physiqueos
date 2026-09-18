import { deepFreeze, round, semanticFingerprint, V3_SCHEMA } from "./V3Runtime.js";

// Versioned coaching heuristic, not a statistically calibrated probability model.
const POLICY = {
  version: "goal_completion_projection_v2",
  scoreFloor: 20,
  scoreSpan: 75,
  weights: { strategy: 0.35, progress: 0.20, trajectory: 0.25, execution: 0.10, guardrails: 0.10 },
  retention: { not_assessed: 0.40, emerging: 0.55, repeated: 0.70, sustained: 0.80, disrupted: 0.20 },
  trajectoryReserve: 0.35,
  executionRisk: { retentionPerReliableDay: 0.012, maximumRetentionCredit: 0.15, maximumPositiveMovement: 3 },
  ceilings: { not_assessed: 85, emerging: 88, repeated: 94, sustained: 97, disrupted: 55 },
};
const QUALITY = { insufficient: 0, limited: 0.35, adequate: 0.75, robust: 1 };
const AUTHORITY = { contextual: 0.15, supporting: 0.35, material: 0.70, decisive: 1 };
const SIGNIFICANCE = { none: 0.15, minor: 0.35, meaningful: 0.70, major: 1 };

export function projectConfidenceV3({ goalContract, interpretation, authorityBindings = [], priorConfidence, evaluationContext }) {
  const priorPercentage = clampPercentage(priorConfidence?.currentPercentage ?? priorConfidence?.percentage ?? 50);
  const assessedAt = evaluationContext.evaluatedAt;
  const goalSemanticsFingerprint = semanticFingerprint({
    objectives: goalContract.objectives.map((item) => ({ evaluation: item.evaluation, forecast: item.forecast })),
    decision: goalContract.objectiveDecisionPolicy,
    guardrails: goalContract.guardrails.map((item) => ({ evaluation: item.evaluation, consequences: item.consequencePolicy })),
  });
  const sameScope = priorConfidence?.strategyRevisionId === interpretation.strategyRevisionId &&
    priorConfidence?.goalSemanticsFingerprint === goalSemanticsFingerprint;
  const newBindings = authorityBindings.filter((item) =>
    !priorConfidence?.goalConfidence || (!priorConfidence.processedBindingFingerprints?.includes(bindingFingerprint(item)) && Date.parse(item.observedAt) > Date.parse(priorConfidence.evidenceCutoff)) ||
    ((item.measurement.metadata?.strategicEvent || item.measurement.metadata?.invalidatesEvidenceIds) &&
      !priorConfidence.processedBindingFingerprints?.includes(bindingFingerprint(item))));
  // Passage of time is never evidence. A deadline may be reconsidered only
  // when the caller supplies an explicit material semantic event (for
  // example, an authorized deadline or Goal-contract revision).
  const materialSemanticReassessment = evaluationContext.materialSemanticChange === true;
  const materialBindings = newBindings.filter((item) =>
    (item.usableFor.includes("execution") && item.signalDirection !== "indeterminate" && AUTHORITY[item.role] >= AUTHORITY.supporting) ||
    (["objective", "guardrail", "achievement"].includes(item.subjectType) && AUTHORITY[item.role] >= AUTHORITY.supporting && QUALITY[item.quality.status] >= QUALITY.adequate) ||
    (item.subjectType === "strategy" && item.signalDirection !== "indeterminate" && AUTHORITY[item.role] >= AUTHORITY.material && QUALITY[item.quality.status] >= QUALITY.adequate));
  let noMaterialChange = Boolean(priorConfidence?.goalConfidence && sameScope &&
    !materialBindings.length && !materialSemanticReassessment);
  const executionBindings = newBindings.filter((item) => item.usableFor.includes("execution"));
  const execution = noMaterialChange ? priorConfidence.execution : resolveExecution({
    bindings: executionBindings,
    prior: sameScope ? priorConfidence?.execution : null,
    configured: goalContract.evidencePolicies.some((item) => item.usableFor.includes("execution")),
    outcomeBoundary: latestOutcomeAt(interpretation, assessedAt),
    assessedAt,
  });
  if (sameScope && !materialSemanticReassessment && materialBindings.length &&
    materialBindings.every((item) => item.usableFor.includes("execution")) &&
    execution.health === priorConfidence.execution.health &&
    execution.reliableSupportDays === priorConfidence.execution.reliableSupportDays &&
    execution.reliableAdverseDays === priorConfidence.execution.reliableAdverseDays) noMaterialChange = true;
  const strategyConfidence = noMaterialChange ? priorConfidence.strategyConfidence : assessStrategy(interpretation);
  const authoritativeOutcome = newBindings.some((item) => item.subjectType === "objective" &&
    item.directness === "direct" && AUTHORITY[item.role] >= AUTHORITY.material && QUALITY[item.quality.status] >= QUALITY.adequate);
  const decisiveOutcome = newBindings.some((item) => item.subjectType === "objective" &&
    item.directness === "direct" && item.role === "decisive" && item.quality.status === "robust");
  const authoritativeBreach = newBindings.some((item) => item.subjectType === "guardrail" &&
    AUTHORITY[item.role] >= AUTHORITY.material && QUALITY[item.quality.status] >= QUALITY.adequate &&
    interpretation.guardrailFindings.some((finding) => finding.guardrailId === item.subjectId && finding.status === "breached"));
  const authoritativeAchievement = ["achieved", "exceeded"].includes(interpretation.goalAchievement) &&
    newBindings.some((item) => ["objective", "achievement"].includes(item.subjectType) &&
      AUTHORITY[item.role] >= AUTHORITY.material && QUALITY[item.quality.status] >= QUALITY.adequate);
  const outlook = noMaterialChange ? priorConfidence.goalAchievementOutlook : assessOutlook({
    goalContract, interpretation, strategyConfidence, execution,
    forecastAt: authoritativeOutcome ? latestOutcomeAt(interpretation, assessedAt) : assessedAt,
  });
  const anchoredPercentage = Math.round(outlook.score);
  const projectionMode = noMaterialChange ? "continuity_hold" : authoritativeBreach ? "authoritative_guardrail_anchor" : authoritativeAchievement ? "achieved_state_anchor" : decisiveOutcome ? "decisive_state_anchor" :
    authoritativeOutcome ? "material_state_anchor" : !sameScope && priorConfidence?.goalConfidence ? "scope_revision_blend" :
      executionBindings.length ? "execution_update" : materialSemanticReassessment ? "semantic_contract_update" : "limited_evidence_update";
  const gain = projectionMode === "decisive_state_anchor" ? 1 :
    projectionMode === "material_state_anchor" ? 0.75 : projectionMode === "scope_revision_blend" ? 0.5 : 1;
  const rawDelta = noMaterialChange ? 0 : (anchoredPercentage - priorPercentage) * gain;
  const executionAuthority = Math.max(0, ...executionBindings.map((item) => AUTHORITY[item.role] * QUALITY[item.quality.status] * SIGNIFICANCE[item.signalSignificance]));
  const movementBound = authoritativeOutcome || authoritativeBreach || authoritativeAchievement ? null : projectionMode === "scope_revision_blend" ? 15 :
    executionAuthority >= 0.5 ? 8 : executionAuthority >= 0.2 ? 4 : materialSemanticReassessment ? 3 : 2;
  const roundedDelta = Math.round(rawDelta);
  const positiveBound = executionBindings.length && !authoritativeOutcome && !authoritativeBreach && !authoritativeAchievement ?
    Math.min(movementBound, POLICY.executionRisk.maximumPositiveMovement) : movementBound;
  const appliedDelta = noMaterialChange ? 0 : movementBound == null ? roundedDelta :
    Math.max(-movementBound, Math.min(positiveBound, roundedDelta));
  const currentPercentage = clampPercentage(priorPercentage + appliedDelta);
  const delta = currentPercentage - priorPercentage;
  const movement = delta > 0 ? "increase" : delta < 0 ? "decrease" : "no_meaningful_change";
  const semantic = {
    schemaVersion: V3_SCHEMA.confidence,
    policyVersion: POLICY.version,
    goalId: interpretation.goalId,
    strategyRevisionId: interpretation.strategyRevisionId,
    goalSemanticsFingerprint,
    strategicInterpretationId: interpretation.id,
    priorAssessmentId: priorConfidence?.id ?? null,
    primaryDimension: "goal_completion",
    priorPercentage,
    currentPercentage,
    movement,
    delta,
    confidenceBand: currentPercentage >= 80 ? "high" : currentPercentage >= 55 ? "moderate" : "low",
    strategyConfidence,
    goalConfidence: { percentage: currentPercentage, anchoredPercentage, meaning: "active_goal_completion_given_appropriate_continued_execution" },
    execution,
    goalAchievementOutlook: outlook,
    movementReason: noMaterialChange ? "No new canonical evidence or material semantic event changed the accepted Goal-completion outlook." :
      `${projectionMode}: current Goal progress, discounted trajectory where supported, strategy support, execution and limits imply an anchored outlook of ${anchoredPercentage}%.`,
    newEvidenceIds: [...new Set(newBindings.map((item) => item.observationId))],
    newMaterialEvidenceIds: [...new Set(materialBindings.map((item) => item.observationId))],
    contributions: outlook.objectives.map((item) => ({ objectiveId: item.objectiveId, dimensions: item.dimensions, score: item.score })),
    projectionPolicy: {
      ...POLICY,
      mode: projectionMode,
      anchoredPercentage,
      continuityGain: gain,
      rawDelta: round(rawDelta, 2),
      roundedDelta,
      lowerBound: movementBound == null ? null : -movementBound,
      upperBound: positiveBound,
      boundApplied: appliedDelta !== roundedDelta,
      priorAnchorConstrainedResult: currentPercentage !== anchoredPercentage && !noMaterialChange,
    },
    whatCouldRaise: ["A further qualifying outcome that confirms the response continues", "Consistent execution supported by meaningful new evidence", "Progress reaching the Goal success criteria"],
    whatCouldLower: ["Meaningful departure from the plan, including persistent missed work or inadequate inputs", "A limit coming under pressure or being crossed", "New contradictory outcomes or insufficient progress as time runs short"],
    assessedAt,
    evidenceCutoff: evaluationContext.evidenceCutoff,
    processedBindingFingerprints: [...new Set([...(priorConfidence?.processedBindingFingerprints ?? []), ...authorityBindings.map(bindingFingerprint)])],
  };
  return deepFreeze({ ...semantic, id: `confidence_assessment_v3|${semanticFingerprint(semantic).slice(7)}`, semanticFingerprint: semanticFingerprint(semantic) });
}

function assessStrategy(interpretation) {
  const strategy = interpretation.strategyEffectiveness;
  const reliability = Math.max(0, ...interpretation.objectiveFindings.map((item) =>
    (QUALITY[item.quality] ?? 0) * (AUTHORITY[item.authority] ?? 0)));
  const base = { unknown: 0.30, testing: 0.45, demonstrated: 0.80, challenged: 0.35, refuted: 0.15 }[strategy.feasibility] ?? 0.30;
  const persistenceSupport = { emerging: 0, repeated: 0.06, sustained: 0.10 }[strategy.persistence] ?? 0;
  const strength = clamp(base + (strategy.adequateExposure ? 0.05 : 0) + reliability * 0.05 + persistenceSupport);
  return { percentage: Math.round(strength * 100), strength, evidenceReliability: reliability, feasibility: strategy.feasibility, persistence: strategy.persistence };
}

function resolveExecution({ bindings, prior, configured, outcomeBoundary, assessedAt }) {
  let result = prior ? structuredClone(prior) : { state: "not_assessed", health: 0.65, configured, evidenceIds: [] };
  // Day-level union prevents overlapping summaries, duplicate policies and extra
  // capabilities from manufacturing additional execution exposure. A new direct
  // outcome consumes the old provisional support; it never becomes measured gain.
  const coverage = Object.fromEntries(Object.entries(result.coverageByDay ?? {}).filter(([day]) => day > outcomeBoundary.slice(0, 10)));
  let strongestSupport = 0;
  let strongestContradiction = 0;
  for (const item of bindings) {
    if (!["supports", "contradicts"].includes(item.signalDirection)) continue;
    const reliability = AUTHORITY[item.role] * QUALITY[item.quality.status] * SIGNIFICANCE[item.signalSignificance] * clamp(item.quality.coverageRatio ?? 1);
    const windowDays = executionWindowDays(item, outcomeBoundary, assessedAt);
    let changedCoverage = !windowDays.length && !item.evidenceWindow;
    for (const day of windowDays) {
      const old = coverage[day] ?? { supports: 0, contradicts: 0 };
      if (reliability > old[item.signalDirection]) changedCoverage = true;
      coverage[day] = { ...old, [item.signalDirection]: Math.max(old[item.signalDirection], reliability) };
    }
    // An initial same-boundary execution observation can establish health, but
    // cannot retire future exposure that has not actually happened yet.
    if (changedCoverage || !prior) {
      if (item.signalDirection === "contradicts") strongestContradiction = Math.max(strongestContradiction, reliability);
      else strongestSupport = Math.max(strongestSupport, reliability);
    }
    result.evidenceIds = [...new Set([...result.evidenceIds, item.observationId])];
  }
  if (strongestContradiction > 0) {
    result.state = "deteriorating";
    result.health = Math.min(result.health - 0.35 * strongestContradiction, clamp(0.65 - 0.60 * strongestContradiction, 0.05, 0.65));
  } else if (strongestSupport > 0) {
    result.state = "supportive";
    result.health = prior ? clamp(result.health + 0.025 * strongestSupport, 0.05, 0.95) : 0.65 + 0.15 * clamp(strongestSupport / 0.18);
  }
  result.health = clamp(result.health, 0.05, 0.95);
  result.coverageByDay = coverage;
  result.reliableSupportDays = round(Object.values(coverage).reduce((sum, day) => sum + Math.max(0, day.supports - day.contradicts), 0), 3);
  result.reliableAdverseDays = round(Object.values(coverage).reduce((sum, day) => sum + day.contradicts, 0), 3);
  result.retiredExecutionRiskCredit = Math.min(POLICY.executionRisk.maximumRetentionCredit, result.reliableSupportDays * POLICY.executionRisk.retentionPerReliableDay);
  result.outcomeBoundary = outcomeBoundary;
  result.configured = configured;
  result.rateMultiplier = clamp(result.health / 0.80, 0.10, 1);
  return result;
}

function executionWindowDays(item, boundary, assessedAt) {
  // No inferred cadence or exposure from publication date. Only explicit,
  // completed canonical windows can retire execution risk.
  const start = item.evidenceWindow?.startDate;
  const end = item.evidenceWindow?.endDate;
  if (QUALITY[item.quality.status] < QUALITY.adequate || AUTHORITY[item.role] < AUTHORITY.supporting) return [];
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return [];
  const lower = Math.max(Date.parse(start.slice(0, 10)), Date.parse(boundary.slice(0, 10)) + 86400000);
  const upper = Math.min(Date.parse(end.slice(0, 10)), Date.parse(item.observedAt.slice(0, 10)), Date.parse(assessedAt.slice(0, 10)));
  const days = [];
  for (let timestamp = lower; timestamp <= upper; timestamp += 86400000) days.push(new Date(timestamp).toISOString().slice(0, 10));
  return days;
}

function assessOutlook({ goalContract, interpretation, strategyConfidence, execution, forecastAt }) {
  const guardrailHealth = guardrailScore(interpretation.guardrailFindings);
  const objectives = goalContract.objectives.map((objective) => {
    const finding = interpretation.objectiveFindings.find((item) => item.objectiveId === objective.objectiveId);
    const trajectory = evaluateTrajectory({ objective, finding, strategy: interpretation.strategyEffectiveness, execution, forecastAt });
    const dimensions = {
      strategy: strategyConfidence.strength,
      progress: trajectory.fractionAchieved,
      trajectory: trajectory.deadlineContributionApplicable ? trajectory.scheduleStrength : null,
      execution: execution.configured ? execution.health : null,
      guardrails: guardrailHealth,
    };
    // Limits are constraints, not a bonus for having configured them.
    // Zero limits and assessed acceptable limits have identical score impact.
    const applicable = Object.entries(dimensions).filter(([key, value]) => key !== "guardrails" && value != null);
    const totalWeight = applicable.reduce((sum, [key]) => sum + POLICY.weights[key], 0);
    const normalizedStrength = applicable.reduce((sum, [key, value]) => sum + POLICY.weights[key] * value, 0) / totalWeight;
    const ceiling = interpretation.aggregateGuardrailState === "breached" ? 45 :
      ["challenged", "refuted"].includes(interpretation.strategyEffectiveness.feasibility) ? 55 :
        POLICY.ceilings[interpretation.strategyEffectiveness.persistence] ?? 85;
    const configuredLimitImpact = Math.max(0, ...interpretation.guardrailFindings
      .filter((item) => ["watch", "pressured", "breached"].includes(item.status))
      .map((item) => Math.max(0, -(item.consequencePolicy.confidenceImpact ?? 0))));
    const guardrailPenalty = guardrailHealth == null ? 0 : (1 - guardrailHealth) * POLICY.weights.guardrails * POLICY.scoreSpan + configuredLimitImpact;
    let score = Math.min(ceiling, POLICY.scoreFloor + POLICY.scoreSpan * normalizedStrength - guardrailPenalty);
    if (finding?.successSatisfied && ["achieved", "exceeded"].includes(interpretation.goalAchievement)) score = Math.min(interpretation.aggregateGuardrailState === "breached" ? 45 : 98, strategyConfidence.evidenceReliability >= 0.70 ? 98 : 92);
    return { objectiveId: objective.objectiveId, priority: objective.priority, importance: objective.importance, dimensions, guardrailPenalty: round(guardrailPenalty, 2), normalizedStrength: round(normalizedStrength, 4), ceiling, score: round(score, 2), trajectory };
  });
  const policy = goalContract.objectiveDecisionPolicy;
  const required = policy.mode === "primary_required" ? objectives.filter((item) => item.priority === "primary") : objectives;
  const ordered = [...required].sort((a, b) => b.score - a.score);
  const score = policy.mode === "weighted" ? required.reduce((sum, item) => sum + item.score * item.importance, 0) / required.reduce((sum, item) => sum + item.importance, 0) :
    policy.mode === "threshold_count" ? ordered[Math.max(0, Number(policy.thresholdCount) - 1)]?.score ?? 20 : Math.min(...required.map((item) => item.score));
  return {
    version: POLICY.version, score: round(score, 2), asOf: forecastAt,
    assessment: score >= 75 ? "favorable" : score >= 55 ? "uncertain" : "at_risk",
    achievement: interpretation.goalAchievement, objectives,
    uncertainty: [
      ...(interpretation.strategyEffectiveness.persistence === "emerging" ? ["recent_response_not_yet_confirmed_across_another_period"] : []),
      "conditional_on_appropriate_continued_execution",
      "coaching_heuristic_not_statistical_probability",
    ],
  };
}

function evaluateTrajectory({ objective, finding, strategy, execution, forecastAt }) {
  const forecast = objective.forecast;
  const unavailable = { supported: false, kind: forecast?.kind ?? null, fractionAchieved: null, deadlineContributionApplicable: false, scheduleStrength: null, uncertainty: ["trajectory_not_declared_by_contract"] };
  if (!forecast || !finding || finding.currentValue == null) return unavailable;
  const direction = forecast.direction === "decrease" ? -1 : 1;
  const sameStrategyBasis = finding.strategyRevisionId === strategy.strategyRevisionId;
  let requirement;
  let completed;
  let observedRate;
  let intervalDays;
  if (forecast.kind === "scalar_target") {
    requirement = (forecast.targetValue - forecast.baselineValue) * direction;
    completed = (finding.currentValue - forecast.baselineValue) * direction;
    intervalDays = finding.comparisonAt && finding.evidenceObservedAt ? daysBetween(finding.comparisonAt, finding.evidenceObservedAt) : finding.exposureDays;
    observedRate = sameStrategyBasis && intervalDays > 0 && finding.change != null ? finding.change * direction / intervalDays : null;
  } else if (forecast.kind === "range_duration") {
    requirement = forecast.requiredDurationDays;
    completed = finding.durationDays;
    intervalDays = forecast.startedAt ? daysBetween(forecast.startedAt, finding.evidenceObservedAt ?? forecastAt) : null;
    observedRate = sameStrategyBasis && intervalDays > 0 && completed != null ? completed / intervalDays : null;
  } else {
    return { ...unavailable, supported: true, kind: "state", fractionAchieved: finding.successSatisfied ? 1 : null, uncertainty: ["non_directional_success_has_no_scalar_rate"] };
  }
  if (completed == null) return unavailable;
  const fractionAchieved = clamp(completed / requirement);
  const remainingRequirement = Math.max(0, requirement - completed);
  const timeRemainingDays = forecast.deadlineAt ? daysBetween(forecastAt, forecast.deadlineAt) : null;
  const requiredRate = timeRemainingDays > 0 ? remainingRequirement / timeRemainingDays : null;
  const reliability = (QUALITY[finding.quality] ?? 0) * (AUTHORITY[finding.authority] ?? 0);
  const executionCredit = strategy.feasibility === "demonstrated" && sameStrategyBasis ? execution.retiredExecutionRiskCredit ?? 0 : 0;
  const retentionFactor = Math.min(0.95, (forecast.kind === "range_duration" ? 0.85 : POLICY.retention[strategy.persistence] ?? 0.40) + executionCredit) *
    reliability * (strategy.adequateExposure ? 1 : 0.50);
  const discountedRate = observedRate == null ? null : Math.max(0, observedRate) * retentionFactor * execution.rateMultiplier;
  const supportedElapsedDays = executionCredit > 0 ? execution.reliableSupportDays : 0;
  const conditionalUnmeasuredProgress = discountedRate == null ? 0 : Math.min(remainingRequirement * 0.50, discountedRate * supportedElapsedDays);
  const forecastRemainingRequirement = Math.max(0, remainingRequirement - conditionalUnmeasuredProgress);
  const forecastRequiredRate = timeRemainingDays > 0 ? forecastRemainingRequirement / timeRemainingDays : null;
  const rateRatio = forecastRequiredRate > 0 && discountedRate != null ? discountedRate / forecastRequiredRate : remainingRequirement === 0 ? null : timeRemainingDays != null && timeRemainingDays <= 0 ? 0 : null;
  const applicable = forecast.deadlineAt != null && (rateRatio != null || remainingRequirement === 0);
  const scheduleStrength = applicable ? remainingRequirement === 0 ? 1 : rateRatio / (rateRatio + POLICY.trajectoryReserve) : null;
  return {
    supported: true, kind: forecast.kind, baseline: forecast.baselineValue, current: finding.currentValue,
    target: forecast.targetValue, completedRequirement: round(completed, 3), totalRequirement: requirement,
    fractionAchieved: round(fractionAchieved, 4), remainingRequirement: round(remainingRequirement, 3),
    startedAt: forecast.startedAt, deadlineAt: forecast.deadlineAt, strategyRevisionId: strategy.strategyRevisionId,
    intervalDays, timeElapsedDays: forecast.startedAt ? daysBetween(forecast.startedAt, forecastAt) : null,
    timeRemainingDays, observedRate: optionalRound(observedRate), requiredRate: optionalRound(requiredRate),
    retentionFactor: round(retentionFactor, 4), executionRateMultiplier: execution.rateMultiplier,
    retiredExecutionRiskCredit: round(executionCredit, 4), supportedElapsedDays,
    conditionalUnmeasuredProgress: round(conditionalUnmeasuredProgress, 3), forecastRemainingRequirement: round(forecastRemainingRequirement, 3), forecastRequiredRate: optionalRound(forecastRequiredRate),
    discountedRate: optionalRound(discountedRate), rateRatio: optionalRound(rateRatio),
    projectedDaysToCompletion: discountedRate > 0 ? round(forecastRemainingRequirement / discountedRate, 1) : null,
    deadlineContributionApplicable: applicable, scheduleStrength: optionalRound(scheduleStrength),
    scheduleState: !applicable ? "not_applicable" : rateRatio >= 1 ? "ahead_with_reserve" : remainingRequirement === 0 ? "complete" : "at_risk",
    uncertainty: ["observed_rate_is_not_a_promise", ...(conditionalUnmeasuredProgress > 0 ? ["execution_supported_progress_is_provisional_not_measured"] : []), ...(!sameStrategyBasis ? ["response_belongs_to_prior_strategy_scope"] : []), ...(strategy.persistence === "emerging" ? ["single_qualifying_response_discounted"] : [])],
  };
}

function guardrailScore(findings) {
  if (!findings.length) return null;
  const assessed = findings.filter((item) => item.status !== "not_assessed");
  if (!assessed.length) return null;
  return Math.min(...assessed.map((item) => ({ clear: 1, watch: 0.70, pressured: 0.40, breached: 0 }[item.status])));
}

function latestOutcomeAt(interpretation, fallback) {
  return interpretation.objectiveFindings.map((item) => item.evidenceObservedAt).filter(Boolean).sort().at(-1) ?? fallback;
}

function daysBetween(start, end) {
  return Math.round((Date.parse(String(end).slice(0, 10)) - Date.parse(String(start).slice(0, 10))) / 86400000);
}

function optionalRound(value) { return value == null ? null : round(value, 4); }
function bindingFingerprint(item) { return semanticFingerprint({ observationId: item.observationId, capabilityId: item.capabilityId, observedAt: item.observedAt, measurement: item.measurement, quality: item.quality }); }
function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }
function clampPercentage(value) {
  if (!Number.isFinite(Number(value))) throw new Error("Confidence percentage is invalid.");
  return Math.round(clamp(Number(value), 0, 100));
}
