import { describe, expect, it } from "vitest";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import { ForecastEngine } from "./ForecastEngine";
import {
  createForecastAssessment,
  validateForecastAssessment,
} from "./ForecastAssessmentModel";

describe("ForecastAssessmentModel", () => {
  it.each([
    ["presentation", { headline: "screen copy" }],
    ["jsx", { type: "div" }],
    ["html", "<div>formatted</div>"],
    ["narrativeFormatting", "# User-facing heading"],
    ["publicationMetadata", { artifactId: "artifact" }],
    ["renderingState", { ready: true }],
    ["score", 80],
    ["probability", 0.8],
    ["confidence", 80],
  ])("rejects forbidden field %s", (field, value) => {
    const assessment = ForecastEngine.forecast(createForecastV2Fixture());
    expect(() => createForecastAssessment({
      ...assessment,
      [field]: value,
    })).toThrow(/cannot contain|cannot expose/i);
  });

  it("rejects semantic mutation and identity drift", () => {
    const assessment = ForecastEngine.forecast(createForecastV2Fixture());
    const changed = structuredClone(assessment);
    changed.confidenceBand = "very_high";
    expect(() => validateForecastAssessment(changed))
      .toThrow("identity mismatch");
  });
});
