import { describe, expect, it } from "vitest";
import { projectDEXAEventNarrativePresentation } from "./DEXAEventNarrativePresentationService";

describe("DEXA Event narrative presentation", () => {
  it("uses the explicit Guardrail without rewriting the persisted narrative", () => {
    const source = { interpretation: { opening: "Measured lean tissue increased. Lean tissue moved up, but we cannot yet judge body fat against a clear target range. Uncertainty remains.",
      fatLoss: "Body fat is below your chosen 8–9% range." } };
    const result = projectDEXAEventNarrativePresentation(source);
    expect(result.interpretation.opening).toContain("below the exact 8–9% Guardrail");
    expect(result.interpretation.opening).not.toContain("cannot yet judge");
    expect(source.interpretation.opening).toContain("cannot yet judge");
  });
  it("does not invent a range when no canonical Guardrail appears", () => {
    const source = { interpretation: { opening: "Lean tissue moved up, but we cannot yet judge body fat against a clear target range.", fatLoss: "No Guardrail is available." } };
    expect(projectDEXAEventNarrativePresentation(source)).toEqual(source);
  });
});
