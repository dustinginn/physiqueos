import { describe, expect, it, vi } from "vitest";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import {
  createForecastShadowService,
  isForecastShadowDiagnosticsEnabled,
} from "./ForecastShadowService";

describe("ForecastShadowService", () => {
  it("runs only when invoked and reports zero production side effects", () => {
    const canonicalInput = createForecastV2Fixture();
    const before = structuredClone(canonicalInput);
    const result = createForecastShadowService().run({ canonicalInput });

    expect(result.status).toBe("shadow_completed");
    expect(result.shadowOnly).toBe(true);
    expect(result.sideEffects).toEqual({
      persistenceAttempted: false,
      publicationAttempted: false,
      artifactMutationAttempted: false,
      homeMutationAttempted: false,
      briefingMutationAttempted: false,
      presentationMutationAttempted: false,
      notificationAttempted: false,
    });
    expect(canonicalInput).toEqual(before);
  });

  it("emits bounded Interpretation-to-Forecast diagnostics in development", () => {
    const sink = vi.fn();
    const result = createForecastShadowService({
      diagnosticSink: sink,
      diagnosticsEnabled: true,
    }).run({ canonicalInput: createForecastV2Fixture() });

    expect(sink).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls[0][0]).length).toBeLessThanOrEqual(4096);
    expect(result.diagnostics.comparison).toMatchObject({
      objectiveStatus: "on_track",
      goalForecastStatus: "on_forecast",
      confidenceBand: "high",
      forecastMovement: "no_meaningful_change",
    });
  });

  it("cannot enable diagnostic emission in production", () => {
    expect(isForecastShadowDiagnosticsEnabled({
      NODE_ENV: "production",
      PI_V2_FORECAST_SHADOW_DIAGNOSTICS: "true",
    })).toBe(false);
    expect(isForecastShadowDiagnosticsEnabled({
      NODE_ENV: "development",
      PI_V2_FORECAST_SHADOW_DIAGNOSTICS: "true",
    })).toBe(true);
  });
});
