export const FORECAST_ASSESSMENT_VERSION =
  "forecast_assessment_v2_shadow_v1";
export const FORECAST_ENGINE_VERSION = "forecast_engine_v2_shadow_v2";
export const FORECAST_PRODUCTION_ENGINE_VERSION = "forecast_engine_v2_production_v2";

export const GoalForecastStatus = enumValues([
  "ahead_of_forecast",
  "on_forecast",
  "forecast_uncertain",
  "forecast_at_risk",
  "forecast_unlikely",
]);

export const ForecastConfidenceBand = enumValues([
  "very_low", "low", "developing", "moderate", "high", "very_high",
]);

export const ForecastMovementDirection = enumValues([
  "increase", "decrease", "no_meaningful_change",
]);

export const ForecastDirection = enumValues([
  "favorable", "stable", "unfavorable", "indeterminate",
]);

export const ObjectiveForecastState = enumValues([
  "ahead", "feasible", "uncertain", "at_risk", "unlikely",
]);

export const GuardrailForecastState = enumValues([
  "likely_respected", "uncertain", "at_risk", "unlikely_respected",
]);

export const ForecastTimelinePhase = enumValues([
  "not_started", "active", "overdue", "unknown",
]);

export const ForecastMilestoneStatus = enumValues([
  "supported", "contradicted", "pending", "due_unresolved",
  "overdue_unresolved", "timing_unknown",
]);

function enumValues(values) {
  return Object.freeze(Object.fromEntries(values.map((value) => [
    value.toUpperCase(), value,
  ])));
}

export function enumSet(value) {
  return new Set(Object.values(value));
}
