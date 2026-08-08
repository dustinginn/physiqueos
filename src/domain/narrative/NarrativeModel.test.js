import { describe, expect, it } from "vitest";
import { createNarrativeV2Fixture } from "../../fixtures/narrativeV2Fixtures";
import { NarrativeEngine } from "./NarrativeEngine";
import {
  createNarrativeAssessment,
  validateNarrativeAssessment,
} from "./NarrativeModel";

describe("NarrativeModel", () => {
  it.each([
    ["presentation", { title: "screen" }],
    ["jsx", { type: "div" }],
    ["html", "<div>content</div>"],
    ["briefingCard", { title: "card" }],
    ["publicationMetadata", { artifactId: "artifact" }],
    ["renderingState", { ready: true }],
    ["score", 80],
    ["probability", 0.8],
    ["confidence", 80],
    ["formattedContent", "# Heading"],
  ])("rejects non-Narrative field %s", (field, value) => {
    const assessment = NarrativeEngine.explain(createNarrativeV2Fixture());
    expect(() => createNarrativeAssessment({
      ...assessment,
      [field]: value,
    })).toThrow(/cannot contain|cannot calculate/i);
  });

  it("rejects semantic mutation and identity drift", () => {
    const assessment = NarrativeEngine.explain(createNarrativeV2Fixture());
    const changed = structuredClone(assessment);
    changed.recommendedCoachingDirection.state = "monitor_closely";
    expect(() => validateNarrativeAssessment(changed))
      .toThrow("identity mismatch");
  });
});
