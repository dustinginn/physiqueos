import { describe, expect, it } from "vitest";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import { createForecastEngine } from "../forecast/ForecastEngine";
import { createForecastAssessment } from "../forecast/ForecastAssessmentModel";
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

  it("applies proxy caps within the existing global cadence ceilings", () => {
    const forecast = withMovement(productionForecast(), {
      direction: "increase", kind: "proxy_durability_transition",
      reasonCode: "proxy_support_repeated_increase",
      rationale: "proxy_support_repeated_increase",
      triggeringCapabilities: ["training_progression"],
      currentPersistence: "repeated", independentPeriodCount: 2,
    });
    const previousCanonicalAssessment = { id: "prior", currentPercentage: 55,
      semanticContinuityFingerprint: "different" };
    expect(projectNumericConfidence({ forecastAssessment: forecast,
      previousCanonicalAssessment, publisherType: "weekly_briefing" }))
      .toMatchObject({ currentPercentage: 56, delta: 1,
        movementAudit: { proxyCap: 1, globalCadenceCap: 3,
          appliedCeiling: 1 } });
    expect(projectNumericConfidence({ forecastAssessment: forecast,
      previousCanonicalAssessment, publisherType: "monthly_briefing" }))
      .toMatchObject({ currentPercentage: 57, delta: 2,
        movementAudit: { proxyCap: 2, globalCadenceCap: 5,
          appliedCeiling: 2 } });
  });

  it("never forces a durability increase beyond the bounded target", () => {
    const forecast = withMovement(productionForecast(), {
      direction: "increase", kind: "proxy_durability_transition",
      reasonCode: "proxy_support_sustained_increase",
      rationale: "proxy_support_sustained_increase",
      triggeringCapabilities: ["training_progression"],
    });
    const result = projectNumericConfidence({ forecastAssessment: forecast,
      previousCanonicalAssessment: { id: "prior", currentPercentage: 82,
        semanticContinuityFingerprint: "different" },
      publisherType: "weekly_briefing" });
    expect(result).toMatchObject({ currentPercentage: 82, delta: 0,
      movement: "no_meaningful_change",
      rationale: "bounded_target_prevented_increase" });
  });

  it("keeps direct DEXA movement outside proxy caps", () => {
    const forecast = withMovement(productionForecast(), {
      direction: "increase", kind: "material_forecast_transition",
      reasonCode: "material_forecast_transition",
      rationale: "forecast_and_band_materially_strengthened",
    });
    expect(projectNumericConfidence({ forecastAssessment: forecast,
      previousCanonicalAssessment: { id: "prior", currentPercentage: 55,
        semanticContinuityFingerprint: "different" },
      publisherType: "dexa_event_briefing" })).toMatchObject({
      currentPercentage: 63, delta: 8,
      movementAudit: { proxyMovement: false, proxyCap: null,
        globalCadenceCap: 8, appliedCeiling: 8 },
    });
  });
});

function withMovement(forecast, movement) {
  const { id: _id, ...value } = structuredClone(forecast);
  return createForecastAssessment({ ...value, movement: {
    priorForecastRef: "prior", ...movement,
  } });
}

function productionForecast() {
  const fixture = createForecastV2Fixture();
  return createForecastEngine({ runtimeMode: "production" }).forecast(fixture);
}
