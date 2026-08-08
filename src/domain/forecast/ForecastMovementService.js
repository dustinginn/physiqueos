import { ForecastMovementDirection } from "./ForecastRuntimeContract";

const STATUS_RANK = {
  forecast_unlikely: 0,
  forecast_at_risk: 1,
  forecast_uncertain: 2,
  on_forecast: 3,
  ahead_of_forecast: 4,
};
const BAND_RANK = {
  very_low: 0, low: 1, developing: 2, moderate: 3, high: 4, very_high: 5,
};

export function determineForecastMovement({
  goalForecastStatus,
  confidenceBand,
  currentStrategyRevision,
  interpretationSemanticFingerprint,
  previousForecastContext,
} = {}) {
  const previousStatus = previousForecastContext?.goalForecastStatus;
  const previousBand = previousForecastContext?.confidenceBand;
  if (previousForecastContext?.interpretationSemanticFingerprint &&
      previousForecastContext.interpretationSemanticFingerprint ===
        interpretationSemanticFingerprint) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext.priorForecastRef,
      "interpretation_semantics_unchanged");
  }
  if (previousForecastContext?.strategyRevision && currentStrategyRevision &&
      previousForecastContext.strategyRevision !== currentStrategyRevision) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext.priorForecastRef,
      "prior_strategy_revision_changed");
  }
  if (!(previousStatus in STATUS_RANK) || !(previousBand in BAND_RANK)) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext?.priorForecastRef ?? null,
      "prior_forecast_semantics_unavailable");
  }
  const statusChange = STATUS_RANK[goalForecastStatus] - STATUS_RANK[previousStatus];
  const bandChange = BAND_RANK[confidenceBand] - BAND_RANK[previousBand];
  if (statusChange < 0 && bandChange <= 0 || bandChange < 0 && statusChange <= 0) {
    return movement(ForecastMovementDirection.DECREASE,
      previousForecastContext.priorForecastRef,
      "forecast_and_band_materially_weakened");
  }
  if (statusChange > 0 && bandChange > 0) {
    return movement(ForecastMovementDirection.INCREASE,
      previousForecastContext.priorForecastRef,
      "forecast_and_band_materially_strengthened");
  }
  return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
    previousForecastContext.priorForecastRef,
    "forecast_change_not_material");
}

function movement(direction, priorForecastRef, rationale) {
  return { direction, priorForecastRef, rationale };
}
