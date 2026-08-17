import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BriefingConfidenceAnchor, { confidenceHeadline } from "./BriefingConfidenceAnchor";

const baseConfidence = {
  score: 60, band: "moderate", movementDirection: "increased", delta: 1,
  primaryReason: "Confidence increased slightly because Training progression support persisted across completed evidence periods and the current strategy is more consistently supported. Direct Goal confirmation remains pending.",
  presentationExplanation: null,
};

describe("BriefingConfidenceAnchor", () => {
  it("translates the internal 'Direct Goal confirmation remains pending' phrase in the weekly top-section headline", () => {
    expect(confidenceHeadline(baseConfidence)).not.toMatch(/Direct Goal confirmation remains pending/i);
    expect(confidenceHeadline(baseConfidence)).toMatch(/Training progression support persisted/);
  });

  it("renders the translated headline in the actual component output", () => {
    const html = renderToStaticMarkup(React.createElement(BriefingConfidenceAnchor, { confidence: baseConfidence }));
    expect(html).not.toMatch(/Direct Goal confirmation remains pending/i);
    expect(html).toContain("Training progression support persisted");
  });

  it("leaves ordinary explanations untouched", () => {
    const ordinary = { ...baseConfidence, primaryReason: "Confidence remained stable because the outlook did not materially change.", movementDirection: "held", delta: 0 };
    expect(confidenceHeadline(ordinary)).toBe("Confidence remained stable because the outlook did not materially change.");
  });
});
