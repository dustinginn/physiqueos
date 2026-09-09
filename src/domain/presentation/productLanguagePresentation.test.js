import { describe, expect, it } from "vitest";
import {
  confidenceBandLabel,
  confidenceSemanticCode,
  findFounderPresentationLeaks,
  productLabel,
} from "./productLanguagePresentation";

describe("Founder product-language presentation boundary", () => {
  it("owns approved product casing", () => {
    expect(productLabel("build_lean_mass")).toBe("Build Lean Mass");
    expect(productLabel("goal")).toBe("Goal");
    expect(productLabel("phase")).toBe("Phase");
    expect(productLabel("training")).toBe("Training");
    expect(productLabel("energy")).toBe("Energy");
    expect(productLabel("recovery")).toBe("Recovery");
    expect(productLabel("dexa")).toBe("DEXA");
    expect(confidenceBandLabel("moderate")).toBe("Moderate");
  });

  it("normalizes separators and identity suffixes before presentation", () => {
    expect(confidenceSemanticCode("objective_feasible:goal|one|v2"))
      .toBe("objective_feasible");
    expect(confidenceSemanticCode("attainability_on_expected_trajectory:goal_1"))
      .toBe("attainability_on_expected_trajectory");
  });

  it("detects backend tokens without rejecting natural product prose", () => {
    expect(findFounderPresentationLeaks({
      summary: "The Goal remains feasible. Training and Energy remain in view.",
      supportingFactors: [], limitingFactors: [], nextDecisiveEvidence: [],
    })).toEqual([]);
    expect(findFounderPresentationLeaks({
      summary: "build_lean_mass uses energyCalibration and user_founder_001.",
      supportingFactors: [], limitingFactors: [], nextDecisiveEvidence: [],
    }).map((item) => item.token)).toEqual(expect.arrayContaining([
      "build_lean_mass", "energyCalibration", "user_founder_001",
    ]));
  });
});
