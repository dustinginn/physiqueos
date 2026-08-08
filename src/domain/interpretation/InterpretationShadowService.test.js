import { describe, expect, it, vi } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import {
  createInterpretationShadowService,
  isInterpretationShadowDiagnosticsEnabled,
} from "./InterpretationShadowService";

describe("InterpretationShadowService", () => {
  it("runs only when explicitly invoked and reports zero production side effects", () => {
    const canonicalInput = createInterpretationV2Fixture();
    const before = structuredClone(canonicalInput);
    const result = createInterpretationShadowService().run({ canonicalInput });

    expect(result.status).toBe("shadow_completed");
    expect(result.shadowOnly).toBe(true);
    expect(result.sideEffects).toEqual({
      persistenceAttempted: false,
      publicationAttempted: false,
      artifactMutationAttempted: false,
      presentationMutationAttempted: false,
    });
    expect(canonicalInput).toEqual(before);
  });

  it("emits bounded comparison diagnostics only when development enables them", () => {
    const sink = vi.fn();
    const result = createInterpretationShadowService({
      diagnosticSink: sink,
      diagnosticsEnabled: true,
    }).run({
      canonicalInput: createInterpretationV2Fixture(),
      v1: {
        assessment: {
          id: "pi_assessment|comparison",
          contributors: [{ direction: "supporting" }],
          reasoning: { limitations: ["comparison_window_limited"] },
        },
      },
    });

    expect(sink).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls[0][0]).length).toBeLessThanOrEqual(4096);
    expect(result.diagnostics.comparison).toMatchObject({
      v1Directions: ["supporting"],
      v2ObjectiveStatus: "on_track",
      v2StrategyStatus: "confirmed",
    });
  });

  it("cannot enable diagnostics in production", () => {
    expect(isInterpretationShadowDiagnosticsEnabled({
      NODE_ENV: "production",
      PI_V2_INTERPRETATION_SHADOW_DIAGNOSTICS: "true",
    })).toBe(false);
    expect(isInterpretationShadowDiagnosticsEnabled({
      NODE_ENV: "development",
      PI_V2_INTERPRETATION_SHADOW_DIAGNOSTICS: "true",
    })).toBe(true);
  });
});
