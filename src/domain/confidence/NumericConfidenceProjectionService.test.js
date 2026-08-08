import { describe, expect, it } from "vitest";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import { createForecastEngine } from "../forecast/ForecastEngine";
import { projectNumericConfidence } from "./NumericConfidenceProjectionService";

describe("canonical numeric confidence projection", () => {
  it("is deterministic and conservative for cadence publishers", () => {
    const forecast = productionForecast();
    const input = { forecastAssessment: forecast,
      previousCanonicalAssessment: { id: "prior", currentPercentage: 55,
        semanticContinuityFingerprint: "different" },
      publisherType: "weekly_briefing" };
    const first = projectNumericConfidence(input);
    const second = projectNumericConfidence(input);
    expect(second).toEqual(first);
    expect(Math.abs(first.delta)).toBeLessThanOrEqual(3);
  });

  it("uses context rather than a universal 50 percent Starting Forecast", () => {
    const forecast = productionForecast();
    const result = projectNumericConfidence({
      forecastAssessment: forecast,
      publisherType: "goal_initialization",
      startingForecastContext: {
        experience: "new_user", goalAmbition: "high",
        timelineFeasibility: "compressed", baselineQuality: "missing",
        priorGoalHistory: "unavailable", historicalExecution: "unavailable",
        strategyQuality: "incomplete", missingInformationCount: 3,
      },
    });
    expect(result.currentPercentage).toBeGreaterThanOrEqual(45);
    expect(result.currentPercentage).not.toBe(50);
  });

  it("holds the exact prior value under semantic continuity", () => {
    const forecast = productionForecast();
    const result = projectNumericConfidence({
      forecastAssessment: forecast,
      previousCanonicalAssessment: { id: "prior", currentPercentage: 61,
        semanticContinuityFingerprint:
          forecast.forecastMetadata.interpretationSemanticFingerprint },
      publisherType: "dexa_event_briefing",
    });
    expect(result).toMatchObject({ currentPercentage: 61, delta: 0,
      movement: "no_meaningful_change" });
  });
});

function productionForecast() {
  const fixture = createForecastV2Fixture();
  return createForecastEngine({ runtimeMode: "production" }).forecast(fixture);
}
