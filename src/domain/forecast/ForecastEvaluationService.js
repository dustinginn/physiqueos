import {
  ForecastConfidenceBand,
  ForecastDirection,
  GoalForecastStatus,
  GuardrailForecastState,
  ObjectiveForecastState,
} from "./ForecastRuntimeContract";
import { uniqueStrings } from "./forecastRuntimeUtils";

export function evaluateGoalForecast({
  goalContract,
  structuredInterpretation,
  timeline,
  milestoneForecasts,
} = {}) {
  const objectiveForecasts = createObjectiveForecasts({
    goalContract, structuredInterpretation, timeline, milestoneForecasts,
  });
  const guardrailForecasts = createGuardrailForecasts({
    goalContract, structuredInterpretation, milestoneForecasts,
  });
  const goalForecastStatus = selectGoalForecastStatus({
    structuredInterpretation,
    timeline,
    objectiveForecasts,
    guardrailForecasts,
    milestoneForecasts,
  });
  const confidenceBand = selectConfidenceBand({
    structuredInterpretation,
    goalForecastStatus,
    timeline,
    milestoneForecasts,
  });
  return {
    goalForecastStatus,
    forecastDirection: directionFor(goalForecastStatus),
    confidenceBand,
    objectiveForecasts,
    guardrailForecasts,
    trajectoryForecast: {
      status: trajectoryStatus(
        structuredInterpretation.objectiveEvaluation.aggregateStatus),
      expectationRefs: uniqueStrings(structuredInterpretation.objectiveEvaluation
        .conclusions.map((item) => item.expectationRef)),
      timelinePhase: timeline.phase,
      rationale: `trajectory_${structuredInterpretation.objectiveEvaluation.aggregateStatus}`,
    },
  };
}

export function createForecastExplanation({
  structuredInterpretation,
  evaluation,
  timeline,
  milestoneForecasts,
  movement,
} = {}) {
  const supportingFactors = [];
  const limitingFactors = [];
  if (["ahead", "on_track"].includes(
    structuredInterpretation.objectiveEvaluation.aggregateStatus)) {
    supportingFactors.push(
      `objective_${structuredInterpretation.objectiveEvaluation.aggregateStatus}`);
  } else {
    limitingFactors.push(
      `objective_${structuredInterpretation.objectiveEvaluation.aggregateStatus}`);
  }
  if (structuredInterpretation.guardrailEvaluation.aggregateStatus === "clear") {
    supportingFactors.push("guardrails_clear");
  } else {
    limitingFactors.push(
      `guardrails_${structuredInterpretation.guardrailEvaluation.aggregateStatus}`);
  }
  if (["confirmed", "directionally_supported"].includes(
    structuredInterpretation.strategyValidation.status)) {
    supportingFactors.push(
      `strategy_${structuredInterpretation.strategyValidation.status}`);
  } else {
    limitingFactors.push(
      `strategy_${structuredInterpretation.strategyValidation.status}`);
  }
  if (["strong_convergence", "moderate_convergence"].includes(
    structuredInterpretation.evidenceReconciliation.agreementStatus)) {
    supportingFactors.push(
      `agreement_${structuredInterpretation.evidenceReconciliation.agreementStatus}`);
  } else {
    limitingFactors.push(
      `agreement_${structuredInterpretation.evidenceReconciliation.agreementStatus}`);
  }
  if (["robust", "adequate"].includes(
    structuredInterpretation.evidenceReconciliation.quality.status)) {
    supportingFactors.push(
      `quality_${structuredInterpretation.evidenceReconciliation.quality.status}`);
  } else {
    limitingFactors.push(
      `quality_${structuredInterpretation.evidenceReconciliation.quality.status}`);
  }
  milestoneForecasts.forEach((item) => {
    const target = item.status === "supported" ? supportingFactors :
      item.required && ["contradicted", "overdue_unresolved"]
        .includes(item.status) ? limitingFactors : null;
    target?.push(`milestone_${item.status}:${item.milestoneId}`);
  });
  if (["overdue", "unknown", "not_started"].includes(timeline.phase)) {
    limitingFactors.push(`timeline_${timeline.phase}`);
  }
  return {
    primarySupportingFactors: uniqueStrings(supportingFactors),
    primaryLimitingFactors: uniqueStrings(limitingFactors),
    remainingUncertaintyKinds: uniqueStrings(
      structuredInterpretation.remainingUncertainty.items.map((item) => item.kind)),
    movementRationale: movement.rationale,
    confidenceBandRationale: bandRationale(evaluation.confidenceBand),
    forecastStatusRationale: `goal_${evaluation.goalForecastStatus}`,
  };
}

function createObjectiveForecasts({
  goalContract, structuredInterpretation, timeline, milestoneForecasts,
}) {
  const definitions = new Map((goalContract.objectives ?? [])
    .map((item) => [item.objectiveId, item]));
  return structuredInterpretation.objectiveEvaluation.conclusions.map((item) => ({
    objectiveId: item.objectiveId,
    required: definitions.get(item.objectiveId)?.required !== false,
    interpretationStatus: item.status,
    observedResult: structuredClone(item.observedResult ?? null),
    forecastState: ({
      ahead: ObjectiveForecastState.AHEAD,
      on_track: ObjectiveForecastState.FEASIBLE,
      uncertain: ObjectiveForecastState.UNCERTAIN,
      behind: ObjectiveForecastState.AT_RISK,
      contradicted: ObjectiveForecastState.UNLIKELY,
    })[item.status],
    expectationRef: item.expectationRef,
    timelinePhase: timeline.phase,
    milestoneRefs: milestoneForecasts.filter((milestone) =>
      milestone.objectiveRefs.includes(item.objectiveId))
      .map((milestone) => milestone.milestoneId),
    rationale: `objective_forecast_${item.status}`,
  })).sort((left, right) => left.objectiveId.localeCompare(right.objectiveId));
}

function createGuardrailForecasts({
  goalContract, structuredInterpretation, milestoneForecasts,
}) {
  const definitions = new Map((goalContract.guardrails ?? [])
    .map((item) => [item.guardrailId, item]));
  return structuredInterpretation.guardrailEvaluation.conclusions.map((item) => ({
    guardrailId: item.guardrailId,
    required: definitions.get(item.guardrailId)?.required !== false,
    interpretationStatus: item.status,
    observedResult: structuredClone(item.observedResult ?? null),
    forecastState: ({
      clear: GuardrailForecastState.LIKELY_RESPECTED,
      watch: GuardrailForecastState.UNCERTAIN,
      pressured: GuardrailForecastState.AT_RISK,
      violated: GuardrailForecastState.UNLIKELY_RESPECTED,
    })[item.status],
    milestoneRefs: milestoneForecasts.filter((milestone) =>
      milestone.guardrailRefs.includes(item.guardrailId))
      .map((milestone) => milestone.milestoneId),
    rationale: `guardrail_forecast_${item.status}`,
  })).sort((left, right) => left.guardrailId.localeCompare(right.guardrailId));
}

function selectGoalForecastStatus({
  structuredInterpretation,
  timeline,
  objectiveForecasts,
  guardrailForecasts,
  milestoneForecasts,
}) {
  if (timeline.phase === "overdue" ||
      objectiveForecasts.some((item) => item.required && item.forecastState === "unlikely") ||
      guardrailForecasts.some((item) => item.required &&
        item.forecastState === "unlikely_respected")) {
    return GoalForecastStatus.FORECAST_UNLIKELY;
  }
  if (objectiveForecasts.some((item) => item.required && item.forecastState === "at_risk") ||
      guardrailForecasts.some((item) => item.required && item.forecastState === "at_risk") ||
      ["mixed", "contradicted"].includes(
        structuredInterpretation.strategyValidation.status) ||
      milestoneForecasts.some((item) => item.required &&
        ["contradicted", "overdue_unresolved"].includes(item.status))) {
    return GoalForecastStatus.FORECAST_AT_RISK;
  }
  if (objectiveForecasts.some((item) => item.required &&
      item.forecastState === "uncertain") ||
      ["unknown", "not_started"].includes(timeline.phase) ||
      structuredInterpretation.remainingUncertainty.status === "material" ||
      ["limited", "insufficient"].includes(
        structuredInterpretation.evidenceReconciliation.quality.status) ||
      structuredInterpretation.strategyValidation.status === "still_calibrating") {
    return GoalForecastStatus.FORECAST_UNCERTAIN;
  }
  if (objectiveForecasts.length && objectiveForecasts.every((item) =>
      item.forecastState === "ahead") &&
      guardrailForecasts.every((item) =>
        item.forecastState === "likely_respected")) {
    return GoalForecastStatus.AHEAD_OF_FORECAST;
  }
  return GoalForecastStatus.ON_FORECAST;
}

function selectConfidenceBand({ structuredInterpretation, goalForecastStatus }) {
  const bestEvidence = structuredInterpretation.evidenceReconciliation
    .agreementStatus === "strong_convergence" &&
    structuredInterpretation.evidenceReconciliation.quality.status === "robust";
  const bestStrategy = structuredInterpretation.strategyValidation.status === "confirmed";
  const noMaterialUncertainty = structuredInterpretation.remainingUncertainty.status ===
    "none_material";
  if (goalForecastStatus === "forecast_unlikely") {
    return ForecastConfidenceBand.VERY_LOW;
  }
  if (goalForecastStatus === "forecast_at_risk") {
    return ForecastConfidenceBand.LOW;
  }
  if (goalForecastStatus === "forecast_uncertain") {
    return ["limited", "insufficient"].includes(
      structuredInterpretation.evidenceReconciliation.quality.status)
      ? ForecastConfidenceBand.DEVELOPING : ForecastConfidenceBand.MODERATE;
  }
  if (goalForecastStatus === "ahead_of_forecast") {
    return bestEvidence && bestStrategy && noMaterialUncertainty
      ? ForecastConfidenceBand.VERY_HIGH : ForecastConfidenceBand.HIGH;
  }
  return bestEvidence && bestStrategy && noMaterialUncertainty
    ? ForecastConfidenceBand.HIGH : ForecastConfidenceBand.MODERATE;
}

function directionFor(status) {
  if (status === "ahead_of_forecast") return ForecastDirection.FAVORABLE;
  if (status === "on_forecast") return ForecastDirection.STABLE;
  if (status === "forecast_uncertain") return ForecastDirection.INDETERMINATE;
  return ForecastDirection.UNFAVORABLE;
}

function trajectoryStatus(status) {
  return ({
    ahead: "ahead_of_expected_trajectory",
    on_track: "matching_expected_trajectory",
    uncertain: "trajectory_unresolved",
    behind: "below_expected_trajectory",
    contradicted: "trajectory_contradicted",
  })[status];
}

function bandRationale(band) {
  return `confidence_band_${band}`;
}
