import { ForecastEngine } from "../domain/forecast/ForecastEngine";
import { createForecastV2Fixture } from "./forecastV2Fixtures";

export function createNarrativeV2Fixture(forecastOptions = {}) {
  const forecastInput = createForecastV2Fixture(forecastOptions);
  return {
    goalContract: structuredClone(forecastInput.goalContract),
    forecastAssessment: ForecastEngine.forecast(forecastInput),
  };
}
