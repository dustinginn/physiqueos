import { describe, expect, it } from "vitest";
import { assertCanonicalConfidencePresentation, canonicalConfidenceExplanation } from "./CanonicalConfidencePresentationInvariant";

const confidence = (overrides = {}) => ({
  score: 59, band: "developing", priorScore: 59, delta: 0,
  movementDirection: "held",
  primaryReason: "Confidence remained stable because the outlook did not materially change.",
  presentationExplanation: "Confidence remained stable because the outlook did not materially change.",
  assessmentId: "confidence-assessment-59",
  source: "canonical_confidence_v2_snapshot",
  ...overrides,
});

describe("canonical confidence presentation invariant", () => {
  it("returns the exact published object and explanation without mutation", () => {
    const published = Object.freeze(confidence());
    expect(assertCanonicalConfidencePresentation(published)).toBe(published);
    expect(canonicalConfidenceExplanation(published)).toBe(published.primaryReason);
  });

  it("fails mixed-source explanation replacement", () => {
    expect(() => assertCanonicalConfidencePresentation(confidence({
      presentationExplanation: "Confidence improved this week because training looked better.",
    }))).toThrow(/MIXED_SOURCE/);
  });

  it.each([
    [{ movementDirection: "held", delta: 0, primaryReason: "Confidence increased this week.", presentationExplanation: null }, "HELD_DIRECTION"],
    [{ movementDirection: "held", delta: 0, primaryReason: "Confidence decreased this week.", presentationExplanation: null }, "HELD_DIRECTION"],
    [{ movementDirection: "increased", delta: 2, primaryReason: "Confidence remained stable.", presentationExplanation: null }, "INCREASE_DIRECTION"],
    [{ movementDirection: "decreased", delta: -2, primaryReason: "Confidence remained stable.", presentationExplanation: null }, "DECREASE_DIRECTION"],
  ])("fails directionally contradictory published wording %#", (overrides, code) => {
    expect(() => assertCanonicalConfidencePresentation(confidence(overrides))).toThrow(code);
  });

  it.each([
    { movementDirection: "increased", delta: 2, primaryReason: "Confidence increased as the outlook strengthened.", presentationExplanation: null },
    { movementDirection: "decreased", delta: -2, primaryReason: "Confidence decreased as the outlook weakened.", presentationExplanation: null },
  ])("accepts matching directional wording %#", (overrides) => {
    expect(assertCanonicalConfidencePresentation(confidence(overrides))).toMatchObject(overrides);
  });
});
