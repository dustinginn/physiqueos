import { describe, expect, it, vi } from "vitest";
import { createNarrativeV2Fixture } from "../../fixtures/narrativeV2Fixtures";
import {
  createNarrativeShadowService,
  isNarrativeShadowDiagnosticsEnabled,
} from "./NarrativeShadowService";

describe("NarrativeShadowService", () => {
  it("runs explicitly and reports zero production side effects", () => {
    const canonicalInput = createNarrativeV2Fixture();
    const before = structuredClone(canonicalInput);
    const result = createNarrativeShadowService().run({ canonicalInput });

    expect(result.status).toBe("shadow_completed");
    expect(result.shadowOnly).toBe(true);
    expect(result.sideEffects).toEqual({
      persistenceAttempted: false,
      publicationAttempted: false,
      artifactMutationAttempted: false,
      homeMutationAttempted: false,
      briefingMutationAttempted: false,
      presentationMutationAttempted: false,
      renderingAttempted: false,
      notificationAttempted: false,
    });
    expect(canonicalInput).toEqual(before);
  });

  it("emits bounded Forecast-to-Narrative diagnostics in development", () => {
    const sink = vi.fn();
    const result = createNarrativeShadowService({
      diagnosticSink: sink,
      diagnosticsEnabled: true,
    }).run({ canonicalInput: createNarrativeV2Fixture() });

    expect(sink).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls[0][0]).length).toBeLessThanOrEqual(4096);
    expect(result.diagnostics.comparison).toMatchObject({
      goalForecastStatus: "on_forecast",
      confidenceBand: "high",
      movement: "no_meaningful_change",
      coachingDirection: "stay_the_course",
    });
  });

  it("cannot enable diagnostic emission in production", () => {
    expect(isNarrativeShadowDiagnosticsEnabled({
      NODE_ENV: "production",
      PI_V2_NARRATIVE_SHADOW_DIAGNOSTICS: "true",
    })).toBe(false);
    expect(isNarrativeShadowDiagnosticsEnabled({
      NODE_ENV: "development",
      PI_V2_NARRATIVE_SHADOW_DIAGNOSTICS: "true",
    })).toBe(true);
  });
});
