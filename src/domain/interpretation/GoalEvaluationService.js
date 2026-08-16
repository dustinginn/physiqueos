import {
  GuardrailStatus,
  ObjectiveStatus,
} from "./InterpretationRuntimeContract";
import {
  evaluatePredicate,
  latestMeasurement,
  relationRef,
  uniqueStrings,
} from "./interpretationRuntimeUtils";

const EVALUABLE_STRENGTHS = new Set(["authoritative", "high", "moderate"]);

export function evaluateInterpretationObjectives({
  goalContract,
  evidenceDescriptors,
  evidenceReconciliation,
  evaluationContext,
} = {}) {
  const objectives = goalContract?.objectives ?? [];
  const conclusions = objectives.map((objective) => evaluateObjective({
    objective, goalContract, evidenceDescriptors, evidenceReconciliation,
    evaluationContext,
  }));
  return {
    aggregateStatus: aggregateObjectives(conclusions, goalContract),
    conclusions,
  };
}

export function evaluateInterpretationGuardrails({
  goalContract,
  evidenceDescriptors,
  evidenceReconciliation,
} = {}) {
  const conclusions = (goalContract?.guardrails ?? []).map((guardrail) => {
    const conclusionRef = relationRef("guardrail", guardrail.guardrailId);
    const items = evidenceReconciliation.items.filter((item) =>
      item.conclusionRef === conclusionRef &&
      item.temporalApplicability === "applicable" &&
      ["decisive", "material"].includes(item.relevance));
    const evidenceRefs = uniqueStrings(items.map((item) => item.evidenceRef));
    const evaluableEvidenceRefs = uniqueStrings(items.filter((item) =>
      EVALUABLE_STRENGTHS.has(item.strength)).map((item) => item.evidenceRef));
    const metric = guardrail.monitoredMetricOrCapability ??
      guardrail.measurement?.metricOrCapability ?? null;
    const measurement = latestMeasurement(
      evidenceDescriptors, evaluableEvidenceRefs, metric);
    const weakMeasurement = measurement ?? latestMeasurement(
      evidenceDescriptors, evidenceRefs, metric);
    const violated = evaluatePredicate(measurement?.value, guardrail.violationThreshold);
    const pressured = evaluatePredicate(measurement?.value, guardrail.pressureThreshold);
    const warned = evaluatePredicate(measurement?.value, guardrail.warningThreshold);
    const status = violated === true ? GuardrailStatus.VIOLATED :
      pressured === true ? GuardrailStatus.PRESSURED :
        warned === true ? GuardrailStatus.WATCH :
          measurement ? GuardrailStatus.CLEAR : GuardrailStatus.WATCH;
    const rationale = !metric ? "guardrail_metric_missing" :
      !guardrail.warningThreshold || !guardrail.violationThreshold
        ? "guardrail_threshold_incomplete" :
        !measurement && weakMeasurement ? "guardrail_weak_signal" :
          !measurement ? "guardrail_measurement_missing" :
          `guardrail_${status}`;
    const boundary = evaluateGuardrailBoundary(measurement?.value, guardrail.constraint);
    return {
      guardrailId: guardrail.guardrailId,
      status,
      thresholdRef: guardrail.guardrailId,
      observedResult: weakMeasurement ? {
        metric: weakMeasurement.metric,
        value: weakMeasurement.value,
        unit: weakMeasurement.unit ?? null,
        observedAt: weakMeasurement.observedAt,
        rangeMembership: boundary.membership,
        deviation: boundary.deviation,
        deviationMagnitude: boundary.magnitude,
      } : null,
      evidenceRefs,
      rationale,
      evaluable: Boolean(metric && guardrail.warningThreshold &&
        guardrail.violationThreshold && measurement),
    };
  });
  const severity = { clear: 0, watch: 1, pressured: 2, violated: 3 };
  const aggregateStatus = conclusions.length
    ? [...conclusions].sort((left, right) =>
      severity[right.status] - severity[left.status])[0].status
    : GuardrailStatus.CLEAR;
  return { aggregateStatus, conclusions };
}

function evaluateGuardrailBoundary(value, constraint) {
  const number = Number(value);
  if (!Number.isFinite(number) || !constraint) {
    return { membership: "unknown", deviation: null, magnitude: "unknown" };
  }
  if (constraint.kind === "bounded_range" &&
      Number.isFinite(Number(constraint.min)) && Number.isFinite(Number(constraint.max))) {
    const min = Number(constraint.min);
    const max = Number(constraint.max);
    const deviation = number < min ? min - number : number > max ? number - max : 0;
    const span = Math.max(0.000001, max - min);
    return {
      membership: deviation === 0 ? "inside" : number < min ? "below" : "above",
      deviation: Number(deviation.toFixed(3)),
      magnitude: deviation === 0 ? "none" : deviation <= span ? "slight" : "material",
    };
  }
  const inside = evaluatePredicate(number, constraint);
  return {
    membership: inside === true ? "inside" : inside === false
      ? constraint.kind === "minimum" ? "below" :
        constraint.kind === "maximum" ? "above" : "outside" : "unknown",
    deviation: null,
    magnitude: inside === false ? "material" : inside === true ? "none" : "unknown",
  };
}

function evaluateObjective({
  objective,
  goalContract,
  evidenceDescriptors,
  evidenceReconciliation,
  evaluationContext,
}) {
  const conclusionRef = relationRef("objective", objective.objectiveId);
  const items = evidenceReconciliation.items.filter((item) =>
    item.conclusionRef === conclusionRef &&
    item.temporalApplicability === "applicable" &&
    ["decisive", "material"].includes(item.relevance));
  const evidenceRefs = uniqueStrings(items.map((item) => item.evidenceRef));
  const evaluableEvidenceRefs = uniqueStrings(items.filter((item) =>
    EVALUABLE_STRENGTHS.has(item.strength)).map((item) => item.evidenceRef));
  const metric = objective.measurement?.metricOrCapability ??
    objective.target?.metricOrCapability ?? null;
  const measurement = latestMeasurement(
    evidenceDescriptors, evaluableEvidenceRefs, metric);
  const segment = activeTrajectorySegment(goalContract, evaluationContext);
  const expectation = segment?.expectedObjectiveRanges?.find((item) =>
    item.objectiveRef === objective.objectiveId) ?? null;
  const elapsedTimeAdequacy = evaluationContext?.elapsedTimeAdequacy ??
    (segment?.measurableChangeExpectation === "not_expected" ? "insufficient" : "adequate");
  const contradiction = evaluatePredicate(measurement?.value,
    objective.contradictionThreshold);
  let status = ObjectiveStatus.UNCERTAIN;
  let rationale = "objective_measurement_missing";
  if (!metric) rationale = "objective_metric_missing";
  else if (elapsedTimeAdequacy !== "adequate") rationale = "objective_elapsed_time_insufficient";
  else if (measurement && contradiction === true) {
    status = ObjectiveStatus.CONTRADICTED;
    rationale = "objective_contradiction_threshold_met";
  } else if (measurement && expectation) {
    status = rangeStatus(measurement.value, expectation, objective.target?.desiredDirection);
    rationale = `objective_${status}_relative_to_trajectory`;
  } else if (measurement) {
    rationale = "objective_trajectory_expectation_missing";
  }
  return {
    objectiveId: objective.objectiveId,
    status,
    expectationRef: expectation?.expectationId ?? segment?.segmentId ?? null,
    observedResult: measurement ? {
      metric: measurement.metric,
      value: measurement.value,
      unit: measurement.unit ?? null,
      observedAt: measurement.observedAt,
    } : null,
    elapsedTimeAdequacy,
    evidenceRefs,
    rationale,
  };
}

function activeTrajectorySegment(goalContract, context) {
  const segments = goalContract?.expectedTrajectory?.segments ?? [];
  if (context?.trajectorySegmentId) {
    return segments.find((item) => item.segmentId === context.trajectorySegmentId) ?? null;
  }
  const at = String(context?.evidenceCutoff ?? "").slice(0, 10);
  return segments.find((item) => {
    const start = String(item.startBoundary ?? "").slice(0, 10);
    const end = String(item.endBoundary ?? "").slice(0, 10);
    return (!start || start <= at) && (!end || end >= at);
  }) ?? null;
}

function rangeStatus(value, expectation, direction) {
  if (!Number.isFinite(Number(value)) ||
      !Number.isFinite(Number(expectation.min)) ||
      !Number.isFinite(Number(expectation.max))) return ObjectiveStatus.UNCERTAIN;
  const number = Number(value);
  const min = Number(expectation.min);
  const max = Number(expectation.max);
  if (number >= min && number <= max) return ObjectiveStatus.ON_TRACK;
  if (direction === "increase") {
    return number > max ? ObjectiveStatus.AHEAD : ObjectiveStatus.BEHIND;
  }
  if (direction === "decrease") {
    return number < min ? ObjectiveStatus.AHEAD : ObjectiveStatus.BEHIND;
  }
  return ObjectiveStatus.BEHIND;
}

function aggregateObjectives(conclusions, goalContract) {
  if (!conclusions.length) return ObjectiveStatus.UNCERTAIN;
  if (conclusions.length === 1) return conclusions[0].status;
  const rule = goalContract?.objectiveEvaluationPolicy?.aggregateRule;
  if (!rule) return ObjectiveStatus.UNCERTAIN;
  if (!["most_conservative", "all_required"].includes(rule)) {
    return ObjectiveStatus.UNCERTAIN;
  }
  const rank = { ahead: 0, on_track: 1, uncertain: 2, behind: 3, contradicted: 4 };
  return [...conclusions].sort((left, right) =>
    rank[right.status] - rank[left.status])[0].status;
}
