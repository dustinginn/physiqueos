import { validateForecastAssessment } from "../forecast/ForecastAssessmentModel";
import { deepFreeze, uniqueStrings } from "./narrativeRuntimeUtils";

export const FORECAST_NARRATIVE_ADAPTER_VERSION =
  "forecast_narrative_adapter_v1";

export function adaptForecastAssessmentToNarrativeContext(assessment = {}) {
  validateForecastAssessment(assessment);
  return deepFreeze(projectForecast(assessment, {
    sourceType: "canonical_forecast_assessment",
    missingSemantics: [],
  }));
}

export function adaptForecastLikeToNarrativeCompatibilityContext(value = {}) {
  const missingSemantics = [];
  const supportedStatus = [
    "ahead_of_forecast", "on_forecast", "forecast_uncertain",
    "forecast_at_risk", "forecast_unlikely",
  ].includes(value.goalForecastStatus);
  const supportedBand = [
    "very_low", "low", "developing", "moderate", "high", "very_high",
  ].includes(value.confidenceBand);
  const supportedMovement = [
    "increase", "decrease", "no_meaningful_change",
  ].includes(value.movement?.direction);
  if (!supportedStatus) missingSemantics.push("goal_forecast_status");
  if (!supportedBand) missingSemantics.push("confidence_band");
  if (!supportedMovement) missingSemantics.push("forecast_movement");
  return deepFreeze(projectForecast({
    ...value,
    goalForecastStatus: supportedStatus ? value.goalForecastStatus : "unknown",
    confidenceBand: supportedBand ? value.confidenceBand : "unknown",
    forecastDirection: value.forecastDirection ?? "unknown",
    movement: supportedMovement ? value.movement : {
      direction: "unknown", rationale: "forecast_movement_unknown",
      priorForecastRef: null,
    },
  }, {
    sourceType: "forecast_compatibility_context",
    missingSemantics,
  }));
}

function projectForecast(value, compatibility) {
  return {
    adapterVersion: FORECAST_NARRATIVE_ADAPTER_VERSION,
    sourceType: compatibility.sourceType,
    forecastRef: value.id ?? null,
    goalRef: structuredClone(value.goalRef ?? {}),
    strategyRef: structuredClone(value.strategyRef ?? {}),
    assessmentContext: structuredClone(value.assessmentContext ?? {}),
    goalForecastStatus: value.goalForecastStatus ?? "unknown",
    confidenceBand: value.confidenceBand ?? "unknown",
    forecastDirection: value.forecastDirection ?? "unknown",
    movement: structuredClone(value.movement ?? {
      direction: "unknown", rationale: "forecast_movement_unknown",
      priorForecastRef: null,
    }),
    timeline: structuredClone(value.timeline ?? {}),
    trajectoryForecast: structuredClone(value.trajectoryForecast ?? {}),
    objectiveForecasts: structuredClone(value.objectiveForecasts ?? []),
    guardrailForecasts: structuredClone(value.guardrailForecasts ?? []),
    milestoneForecasts: structuredClone(value.milestoneForecasts ?? []),
    forecastExplanation: structuredClone(value.forecastExplanation ?? {
      primarySupportingFactors: [],
      primaryLimitingFactors: [],
      remainingUncertaintyKinds: [],
      movementRationale: "unknown",
      confidenceBandRationale: "unknown",
      forecastStatusRationale: "unknown",
    }),
    remainingUncertainty: structuredClone(value.remainingUncertainty ?? {
      status: "unknown", items: [], summary: { state: "unknown" },
    }),
    nextDecisiveEvidence: structuredClone(value.nextDecisiveEvidence ?? {
      status: "unknown", evidenceCapability: null, expectedEventType: null,
      expectedWindow: null, uncertaintyRefs: [], decisionBoundary: null,
      whyDecisive: "unknown",
    }),
    sourceFingerprint: value.forecastMetadata?.inputFingerprint ?? null,
    missingSemantics: uniqueStrings(compatibility.missingSemantics),
    inferredSemantics: [],
  };
}
