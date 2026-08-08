import { describe, expect, it } from "vitest";
import { createNarrativeV2Fixture } from "../../fixtures/narrativeV2Fixtures";
import {
  adaptForecastAssessmentToNarrativeContext,
  adaptForecastLikeToNarrativeCompatibilityContext,
} from "./ForecastNarrativeCompatibilityAdapter";

describe("ForecastNarrativeCompatibilityAdapter", () => {
  it("projects a canonical Forecast without changing its semantics", () => {
    const forecast = createNarrativeV2Fixture().forecastAssessment;
    const context = adaptForecastAssessmentToNarrativeContext(forecast);

    expect(context).toMatchObject({
      sourceType: "canonical_forecast_assessment",
      forecastRef: forecast.id,
      goalForecastStatus: forecast.goalForecastStatus,
      confidenceBand: forecast.confidenceBand,
      movement: forecast.movement,
      missingSemantics: [],
      inferredSemantics: [],
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("keeps missing Forecast semantics unknown", () => {
    const context = adaptForecastLikeToNarrativeCompatibilityContext({
      id: "legacy_forecast_like",
      score: 88,
      primaryReason: "legacy prose",
    });

    expect(context).toMatchObject({
      goalForecastStatus: "unknown",
      confidenceBand: "unknown",
      movement: { direction: "unknown" },
      missingSemantics: [
        "confidence_band", "forecast_movement", "goal_forecast_status",
      ],
      inferredSemantics: [],
    });
    expect(JSON.stringify(context)).not.toContain("88");
    expect(JSON.stringify(context)).not.toContain("legacy prose");
  });

  it("is deterministic for incomplete compatibility input", () => {
    const input = { id: "forecast_like", confidenceBand: "moderate" };
    expect(adaptForecastLikeToNarrativeCompatibilityContext(input))
      .toEqual(adaptForecastLikeToNarrativeCompatibilityContext(
        structuredClone(input)));
  });
});
