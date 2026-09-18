import {
  AUTHORITY_ORDER,
  SIGNIFICANCE_ORDER,
  allPredicates,
  deepFreeze,
  round,
} from "./V3Runtime.js";

const GUARDRAIL_RANK = { not_assessed: 0, clear: 1, watch: 2, pressured: 3, breached: 4 };

export function evaluateGoalContract({ goalContract, authorityBindings, priorInterpretation = null }) {
  const objectiveFindings = goalContract.objectives.map((objective) =>
    evaluateObjective(objective, authorityBindings, priorInterpretation, goalContract.strategy.strategyRevisionId));
  const goalAchievement = evaluateAchievement(goalContract, objectiveFindings, priorInterpretation);
  const guardrailFindings = goalContract.guardrails.map((guardrail) =>
    evaluateGuardrail(guardrail, authorityBindings, priorInterpretation));
  const aggregateGuardrailState = guardrailFindings.reduce((worst, item) =>
    GUARDRAIL_RANK[item.status] > GUARDRAIL_RANK[worst] ? item.status : worst,
  guardrailFindings.length ? "clear" : "not_assessed");
  return deepFreeze({ objectiveFindings, goalAchievement, guardrailFindings, aggregateGuardrailState });
}

function evaluateObjective(objective, bindings, priorInterpretation, strategyRevisionId) {
  const candidates = bindings.filter((binding) =>
    binding.subjectType === "objective" && binding.subjectId === objective.objectiveId &&
    binding.usableFor.includes("objective"));
  const binding = candidates[0] ?? null;
  const prior = priorInterpretation?.objectiveFindings?.find((item) =>
    item.objectiveId === objective.objectiveId);
  const durationBinding = bindings.find((item) => item.capabilityId === objective.forecast?.durationCapabilityId &&
    item.usableFor.includes("trajectory"));
  if (!binding) {
    if (prior && durationBinding) {
      const context = { current: prior.currentValue, baseline: prior.baselineValue, change: prior.change,
        goalChange: prior.goalChange, durationDays: numeric(durationBinding.measurement.value), absoluteChange: Math.abs(prior.change ?? 0) };
      return {
        ...structuredClone(prior), durationDays: context.durationDays,
        successSatisfied: objective.evaluation.successCriteria.length > 0 && allPredicates(context, objective.evaluation.successCriteria),
        exceededSatisfied: objective.evaluation.exceededCriteria.length > 0 && allPredicates(context, objective.evaluation.exceededCriteria),
        evidenceObservedAt: durationBinding.observedAt,
        evidenceIds: [...new Set([...prior.evidenceIds, durationBinding.observationId])],
        freshness: "duration_update", changedThisEvaluation: true,
      };
    }
    return prior ? {
      ...structuredClone(prior),
      freshness: "carried_forward",
      changedThisEvaluation: false,
    } : emptyObjective(objective);
  }

  const current = numeric(binding.measurement.value);
  const baseline = numeric(binding.measurement.comparisonValue ?? objective.evaluation.baselineValue);
  const change = current != null && baseline != null ? round(current - baseline, 3) :
    numeric(binding.measurement.change);
  const durationDays = numeric(durationBinding?.measurement.value);
  const goalChange = current != null && objective.evaluation.baselineValue != null ?
    round(current - objective.evaluation.baselineValue, 3) : null;
  const context = { current, baseline, change, goalChange, durationDays, absoluteChange: change == null ? null : Math.abs(change) };
  const state = objectiveState(objective.evaluation, context);
  const significance = significanceFor(objective.evaluation, change);
  const successSatisfied = objective.evaluation.successCriteria.length > 0 &&
    objective.evaluation.successCriteria.every((criterion) => allPredicates(context, [criterion]));
  const exceededSatisfied = objective.evaluation.exceededCriteria.length > 0 &&
    objective.evaluation.exceededCriteria.every((criterion) => allPredicates(context, [criterion]));
  const replayed = prior?.strategyRevisionId === strategyRevisionId &&
    prior.evidenceIds?.includes(binding.observationId);
  return {
    findingId: `objective_finding|${objective.objectiveId}|${binding.observationId}`,
    objectiveId: objective.objectiveId,
    strategyRevisionId,
    metricCapability: objective.metricCapability,
    priority: objective.priority,
    state,
    currentValue: current,
    baselineValue: baseline,
    comparisonAt: binding.measurement.comparisonAt,
    evidenceObservedAt: binding.observedAt,
    exposureDays: binding.exposureDays,
    goalChange,
    durationDays,
    change,
    unit: binding.measurement.unit ?? objective.metricCapability.canonicalUnit,
    significance,
    successSatisfied,
    exceededSatisfied,
    authority: binding.role,
    quality: binding.quality.status,
    directness: binding.directness,
    evidenceIds: [binding.observationId],
    sourceReferences: [...binding.sourceReferences],
    factualSummary: binding.measurement.factualSummary,
    freshness: replayed ? "carried_forward" : "new",
    changedThisEvaluation: !replayed,
  };
}

function emptyObjective(objective) {
  return {
    findingId: `objective_finding|${objective.objectiveId}|unassessed`,
    objectiveId: objective.objectiveId,
    metricCapability: objective.metricCapability,
    priority: objective.priority,
    state: "not_assessed",
    currentValue: null,
    baselineValue: objective.evaluation.baselineValue,
    comparisonAt: null,
    change: null,
    unit: objective.metricCapability.canonicalUnit,
    significance: "none",
    successSatisfied: false,
    exceededSatisfied: false,
    authority: null,
    quality: null,
    directness: null,
    evidenceIds: [],
    sourceReferences: [],
    factualSummary: null,
    freshness: "unavailable",
    changedThisEvaluation: false,
  };
}

function objectiveState(evaluation, context) {
  const { current, baseline, change } = context;
  if (current == null) return "not_assessed";
  if (evaluation.mode === "custom_declarative") {
    return allPredicates(context, [evaluation.predicate]) ? "satisfied" : "in_progress";
  }
  if (["target_range", "maintain_range"].includes(evaluation.mode)) {
    const inside = current >= evaluation.targetRange.min && current <= evaluation.targetRange.max;
    if (!inside) return "outside_target";
    if (evaluation.mode === "maintain_range") return "stable_success";
    return "satisfied";
  }
  if (evaluation.mode === "target_value") return current >= evaluation.targetValue ? "satisfied" : "in_progress";
  if (evaluation.mode === "minimum") return current >= evaluation.targetValue ? "satisfied" : "outside_target";
  if (evaluation.mode === "maximum") return current <= evaluation.targetValue ? "satisfied" : "outside_target";
  if (change == null && baseline == null) return "not_assessed";
  if (evaluation.mode === "increase") {
    if (change >= evaluation.meaningfulChangeThreshold) return "progressed";
    if (change <= -evaluation.meaningfulChangeThreshold) return "regressed";
    return "no_meaningful_change";
  }
  if (evaluation.mode === "decrease") {
    if (change <= -evaluation.meaningfulChangeThreshold) return "progressed";
    if (change >= evaluation.meaningfulChangeThreshold) return "regressed";
    return "no_meaningful_change";
  }
  if (evaluation.mode === "stability") {
    return Math.abs(change ?? 0) <= evaluation.meaningfulChangeThreshold ? "stable_success" : "outside_target";
  }
  return "not_assessed";
}

function significanceFor(evaluation, change) {
  if (change == null) return "none";
  return evaluation.significanceBands.find((band) =>
    Math.abs(change) >= band.minimumAbsoluteChange)?.significance ??
    (Math.abs(change) >= evaluation.meaningfulChangeThreshold ? "meaningful" : "minor");
}

function evaluateAchievement(goalContract, findings, priorInterpretation) {
  if (findings.every((item) => item.state === "not_assessed")) return "not_assessed";
  const primary = findings.filter((item) => item.priority === "primary");
  const satisfied = findings.filter((item) => item.successSatisfied);
  let achieved = false;
  if (goalContract.objectiveDecisionPolicy.mode === "all_required") achieved = satisfied.length === findings.length;
  if (goalContract.objectiveDecisionPolicy.mode === "primary_required") achieved = primary.every((item) => item.successSatisfied);
  if (goalContract.objectiveDecisionPolicy.mode === "threshold_count") achieved = satisfied.length >= goalContract.objectiveDecisionPolicy.thresholdCount;
  if (goalContract.objectiveDecisionPolicy.mode === "weighted") {
    const total = findings.reduce((sum, item) => sum + (goalContract.objectives.find((o) => o.objectiveId === item.objectiveId)?.importance ?? 1), 0);
    const earned = satisfied.reduce((sum, item) => sum + (goalContract.objectives.find((o) => o.objectiveId === item.objectiveId)?.importance ?? 1), 0);
    achieved = total > 0 && earned / total >= goalContract.objectiveDecisionPolicy.achievementThreshold;
  }
  const prior = priorInterpretation?.goalAchievement;
  if (prior && ["achieved", "exceeded"].includes(prior) && !achieved) return "regressed";
  if (!achieved) return "in_progress";
  const exceeded = primary.length > 0 && primary.every((item) => item.exceededSatisfied);
  return exceeded ? "exceeded" : "achieved";
}

function evaluateGuardrail(guardrail, bindings, priorInterpretation) {
  const prior = priorInterpretation?.guardrailFindings?.find((item) =>
    item.guardrailId === guardrail.guardrailId);
  const binding = bindings.find((item) => item.subjectType === "guardrail" &&
    item.subjectId === guardrail.guardrailId && item.usableFor.includes("guardrail"));
  if (!binding) {
    return prior ? { ...structuredClone(prior), freshness: "carried_forward", changedThisEvaluation: false } : {
      findingId: `guardrail_finding|${guardrail.guardrailId}|unassessed`,
      guardrailId: guardrail.guardrailId,
      metricCapability: guardrail.metricCapability,
      status: "not_assessed",
      currentValue: null,
      deviation: null,
      unit: guardrail.metricCapability.canonicalUnit,
      consequencePolicy: guardrail.consequencePolicy,
      evidenceIds: [],
      freshness: "unavailable",
      changedThisEvaluation: false,
    };
  }
  const current = numeric(binding.measurement.value);
  const change = numeric(binding.measurement.change);
  const context = { current, change, absoluteChange: change == null ? null : Math.abs(change) };
  const { satisfied, deviation } = guardrailResult(guardrail.evaluation, context);
  const status = satisfied ? "clear" : guardrail.severityBands.find((band) =>
    deviation >= band.minimumDeviation)?.status ?? "breached";
  const replayed = prior?.evidenceIds?.includes(binding.observationId);
  return {
    findingId: `guardrail_finding|${guardrail.guardrailId}|${binding.observationId}`,
    guardrailId: guardrail.guardrailId,
    metricCapability: guardrail.metricCapability,
    status,
    currentValue: current,
    deviation: round(deviation, 3),
    unit: binding.measurement.unit ?? guardrail.metricCapability.canonicalUnit,
    authority: binding.role,
    quality: binding.quality.status,
    consequencePolicy: guardrail.consequencePolicy,
    evidenceIds: [binding.observationId],
    factualSummary: binding.measurement.factualSummary,
    freshness: replayed ? "carried_forward" : "new",
    changedThisEvaluation: !replayed,
  };
}

function guardrailResult(evaluation, context) {
  const { current, change } = context;
  if (current == null) return { satisfied: false, deviation: Infinity };
  if (evaluation.mode === "custom_declarative") {
    return { satisfied: allPredicates(context, [evaluation.predicate]), deviation: 0 };
  }
  if (evaluation.mode === "allowed_range") {
    const { min, max } = evaluation.allowedRange;
    if (current >= min && current <= max) return { satisfied: true, deviation: 0 };
    return { satisfied: false, deviation: current < min ? min - current : current - max };
  }
  if (evaluation.mode === "minimum") return { satisfied: current >= evaluation.threshold, deviation: Math.max(0, evaluation.threshold - current) };
  if (evaluation.mode === "maximum") return { satisfied: current <= evaluation.threshold, deviation: Math.max(0, current - evaluation.threshold) };
  if (evaluation.mode === "maximum_change") return { satisfied: change != null && change <= evaluation.threshold, deviation: Math.max(0, (change ?? Infinity) - evaluation.threshold) };
  if (evaluation.mode === "minimum_change") return { satisfied: change != null && change >= evaluation.threshold, deviation: Math.max(0, evaluation.threshold - (change ?? -Infinity)) };
  return { satisfied: false, deviation: Infinity };
}

export function findingMeetsCriterion(finding, criterion) {
  return criterion.acceptedStates.includes(finding?.state ?? finding?.status) &&
    AUTHORITY_ORDER[finding?.authority ?? "contextual"] >= AUTHORITY_ORDER[criterion.minimumAuthority] &&
    SIGNIFICANCE_ORDER[finding?.significance ?? "none"] >= SIGNIFICANCE_ORDER[criterion.minimumSignificance];
}

function numeric(value) {
  if (value == null) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
