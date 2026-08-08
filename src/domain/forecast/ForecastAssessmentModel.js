import {
  ForecastConfidenceBand,
  ForecastDirection,
  ForecastMilestoneStatus,
  ForecastMovementDirection,
  GoalForecastStatus,
  GuardrailForecastState,
  ObjectiveForecastState,
  FORECAST_ASSESSMENT_VERSION,
  enumSet,
} from "./ForecastRuntimeContract";
import {
  assertEnum,
  deepFreeze,
  requiredText,
  requiredTimestamp,
  semanticHash,
  stableSerialize,
} from "./forecastRuntimeUtils";

const GOAL_STATUSES = enumSet(GoalForecastStatus);
const BANDS = enumSet(ForecastConfidenceBand);
const DIRECTIONS = enumSet(ForecastDirection);
const MOVEMENTS = enumSet(ForecastMovementDirection);
const OBJECTIVES = enumSet(ObjectiveForecastState);
const GUARDRAILS = enumSet(GuardrailForecastState);
const MILESTONES = enumSet(ForecastMilestoneStatus);
const FORBIDDEN_KEY = /(presentation|jsx|html|narrative|publication|render|component|markup|className|style|copy|probability|percentage|score)/i;
const RAW_INPUT_KEY = /^(rawEvidence|evidenceDescriptors|sourceObservations|sourceClaims)$/i;
const FORMATTED_TEXT = /<\/?[a-z][^>]*>|(^|\n)\s*(#{1,6}|[-*]\s|\d+\.\s)/i;
const TOP_LEVEL_KEYS = new Set([
  "contractVersion", "id", "goalRef", "strategyRef", "assessmentContext",
  "goalForecastStatus", "confidenceBand", "forecastDirection", "movement",
  "timeline", "trajectoryForecast", "objectiveForecasts",
  "guardrailForecasts", "milestoneForecasts", "forecastExplanation",
  "remainingUncertainty", "nextDecisiveEvidence", "interpretationRef",
  "forecastMetadata",
]);

export function createForecastAssessment(input = {}) {
  rejectNonCanonicalOutput(input);
  const unexpected = Object.keys(input).filter((key) => !TOP_LEVEL_KEYS.has(key));
  if (unexpected.length) {
    throw new Error(`Forecast Assessment cannot contain ${unexpected.sort()[0]}.`);
  }
  const contractVersion = input.contractVersion ?? FORECAST_ASSESSMENT_VERSION;
  if (contractVersion !== FORECAST_ASSESSMENT_VERSION) {
    throw new Error("Unsupported Forecast Assessment version.");
  }
  assertEnum(input.goalForecastStatus, GOAL_STATUSES, "Goal Forecast Status");
  assertEnum(input.confidenceBand, BANDS, "Forecast Confidence Band");
  assertEnum(input.forecastDirection, DIRECTIONS, "Forecast Direction");
  assertEnum(input.movement?.direction, MOVEMENTS, "Forecast Movement");
  input.objectiveForecasts?.forEach((item) =>
    assertEnum(item.forecastState, OBJECTIVES, "Objective Forecast state"));
  input.guardrailForecasts?.forEach((item) =>
    assertEnum(item.forecastState, GUARDRAILS, "Guardrail Forecast state"));
  input.milestoneForecasts?.forEach((item) =>
    assertEnum(item.status, MILESTONES, "Forecast Milestone status"));
  const goalRef = {
    goalId: requiredText(input.goalRef?.goalId, "goalRef.goalId"),
    goalContractVersion: requiredText(
      input.goalRef?.goalContractVersion, "goalRef.goalContractVersion"),
    goalContractId: input.goalRef?.goalContractId ?? null,
  };
  const strategyRef = {
    strategyId: input.strategyRef?.strategyId ?? null,
    strategyVersion: input.strategyRef?.strategyVersion ?? null,
    hypothesisId: input.strategyRef?.hypothesisId ?? null,
  };
  const assessmentContext = {
    evidenceCutoff: requiredTimestamp(
      input.assessmentContext?.evidenceCutoff,
      "assessmentContext.evidenceCutoff"),
    assessedAt: requiredTimestamp(
      input.assessmentContext?.assessedAt, "assessmentContext.assessedAt"),
    timelinePhase: requiredText(
      input.assessmentContext?.timelinePhase,
      "assessmentContext.timelinePhase"),
  };
  const forecastMetadata = {
    engineVersion: requiredText(
      input.forecastMetadata?.engineVersion, "forecastMetadata.engineVersion"),
    shadowOnly: input.forecastMetadata?.shadowOnly === true,
    goalContractFingerprint: requiredText(
      input.forecastMetadata?.goalContractFingerprint,
      "forecastMetadata.goalContractFingerprint"),
    interpretationFingerprint: requiredText(
      input.forecastMetadata?.interpretationFingerprint,
      "forecastMetadata.interpretationFingerprint"),
    interpretationSemanticFingerprint: requiredText(
      input.forecastMetadata?.interpretationSemanticFingerprint,
      "forecastMetadata.interpretationSemanticFingerprint"),
    previousForecastRef: input.forecastMetadata?.previousForecastRef ?? null,
    previousContextAdapterVersion:
      input.forecastMetadata?.previousContextAdapterVersion ?? null,
    previousContextMissingSemantics:
      structuredClone(input.forecastMetadata?.previousContextMissingSemantics ?? []),
    inputFingerprint: requiredText(
      input.forecastMetadata?.inputFingerprint,
      "forecastMetadata.inputFingerprint"),
  };
  const canonical = {
    contractVersion,
    goalRef,
    strategyRef,
    assessmentContext,
    goalForecastStatus: input.goalForecastStatus,
    confidenceBand: input.confidenceBand,
    forecastDirection: input.forecastDirection,
    movement: structuredClone(input.movement),
    timeline: structuredClone(input.timeline),
    trajectoryForecast: structuredClone(input.trajectoryForecast),
    objectiveForecasts: structuredClone(input.objectiveForecasts ?? []),
    guardrailForecasts: structuredClone(input.guardrailForecasts ?? []),
    milestoneForecasts: structuredClone(input.milestoneForecasts ?? []),
    forecastExplanation: structuredClone(input.forecastExplanation),
    remainingUncertainty: structuredClone(input.remainingUncertainty),
    nextDecisiveEvidence: structuredClone(input.nextDecisiveEvidence),
    interpretationRef: requiredText(
      input.interpretationRef, "interpretationRef"),
    forecastMetadata,
  };
  const expectedId = `forecast_assessment|${semanticHash({
    ...canonical,
    assessmentContext: {
      ...canonical.assessmentContext,
      assessedAt: undefined,
    },
  })}`;
  if (input.id && input.id !== expectedId) {
    throw new Error("Forecast Assessment identity mismatch.");
  }
  return deepFreeze({ contractVersion, id: expectedId, ...canonical });
}

export function validateForecastAssessment(value) {
  const rebuilt = createForecastAssessment(value);
  if (stableSerialize(rebuilt) !== stableSerialize(value)) {
    throw new Error("Forecast Assessment is not canonical.");
  }
  return true;
}

function rejectNonCanonicalOutput(value) {
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORMATTED_TEXT.test(value)) {
      throw new Error("Forecast Assessment cannot contain formatted prose.");
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key) || RAW_INPUT_KEY.test(key) ||
        ["$$typeof", "props", "children"].includes(key)) {
      throw new Error(`Forecast Assessment cannot contain ${key}.`);
    }
    if (key.toLowerCase() === "confidence" ||
        key.toLowerCase() === "numericconfidence") {
      throw new Error("Forecast Assessment cannot expose numeric confidence.");
    }
    rejectNonCanonicalOutput(child);
  }
}
