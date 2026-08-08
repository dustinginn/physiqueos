import { describe, expect, it } from "vitest";
import { createSyntheticDexaV2Preview } from "./SyntheticDEXAV2PreviewService";
import { projectSyntheticDEXAV2Confidence } from "./SyntheticDEXAV2ConfidenceProjectionService";

describe("synthetic DEXA V2 confidence projection", () => {
  it("creates the authorized deterministic preview-only numeric projection", () => {
    const preview = createSyntheticDexaV2Preview();
    const input = {
      forecastAssessment: preview.diagnostics.forecastAssessment,
      narrativeAssessment: preview.diagnostics.narrativeAssessment,
      previousForecastContext: preview.diagnostics.previousForecastContext,
    };
    const first = projectSyntheticDEXAV2Confidence(input);
    const second = projectSyntheticDEXAV2Confidence(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      previewOnly: true, persisted: false, published: false,
      calibrationAuthority: false, score: 58, priorScore: 50, delta: 8,
      band: "moderate", movementDirection: "increased",
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects non-shadow and semantically changed inputs", () => {
    const preview = createSyntheticDexaV2Preview();
    const forecast = structuredClone(preview.diagnostics.forecastAssessment);
    forecast.forecastMetadata.shadowOnly = false;
    expect(() => projectSyntheticDEXAV2Confidence({
      forecastAssessment: forecast,
      narrativeAssessment: preview.diagnostics.narrativeAssessment,
      previousForecastContext: preview.diagnostics.previousForecastContext,
    })).toThrow(/preview-only/i);
  });
});
