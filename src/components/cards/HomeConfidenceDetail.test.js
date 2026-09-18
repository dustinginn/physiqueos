import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeConfidenceDetail, { HomeConfidenceDetailBody } from "./HomeConfidenceDetail";
import { buildConfidenceExplanationDetail } from "../../domain/presentation/confidenceExplanationPresentation";
import { expectInternalDomainNamesNatural } from "../../domain/presentation/proseCapitalization";

describe("HomeConfidenceDetailBody — final rendered explanation output", () => {
  it("renders the real production-shaped assessment with clean coaching language, no internal vocabulary, no duplicate bottom paragraph", () => {
    const detail = buildConfidenceExplanationDetail({
      qualitativeLevel: "Moderate",
      narrativeText: "Confidence increased slightly because Training progression support persisted across completed evidence periods and the current strategy is more consistently supported. Direct Goal confirmation remains pending.",
      movement: "increase",
      movementRationaleCode: "proxy_support_sustained_increase",
      remainingUncertaintyItems: [
        { kind: "measurement_pending", materiality: "high" },
        { kind: "energy_calibration_uncertain", materiality: "moderate" },
        { kind: "goal_semantics_missing", materiality: "moderate" },
        { kind: "recovery_evidence_missing", materiality: "moderate" },
      ],
      nextConfidenceBuildingEvidence: { status: "identified", evidenceCapability: "dexa_body_composition" },
    });
    const html = renderToStaticMarkup(React.createElement(HomeConfidenceDetailBody, { detail }));

    expect(html).not.toMatch(/\[object Object\]/);
    expect(html).not.toMatch(/Training progression support persisted across completed evidence periods/);
    expect(html).not.toMatch(/Direct Goal confirmation remains pending/i);
    expect(html).not.toMatch(/doesn't have a complete threshold/i);
    expect(html).not.toMatch(/\bkind\b|\bmateriality\b|interpretation_uncertainty\|/);
    expect(html).toContain("Training has continued moving forward");
    expect(html).toContain("There hasn&#x27;t yet been enough direct body-composition evidence");
    expect(html).toContain("DEXA");
    expect(html).toContain("What we need next");
    expect(html).not.toContain("What PI needs next");
    // Bottom summary paragraph is suppressed — nothing left over to duplicate supports/limits/clearer.
    expect(html).not.toMatch(/rounded-xl bg-\[var\(--surface-muted\)\] p-3/);
  });

  it("omits the bottom paragraph entirely (no empty wrapper) when uncertaintyStatement is empty", () => {
    const html = renderToStaticMarkup(React.createElement(HomeConfidenceDetailBody, {
      detail: { qualitativeLevel: "Moderate", supportingFactors: [], limitingFactors: [], clarifyingFactors: [], uncertaintyStatement: "" },
    }));
    expect(html).not.toMatch(/rounded-xl bg-\[var\(--surface-muted\)\]/);
    expect(html).not.toContain("What changed");
    expect(html).not.toContain("What we need next");
  });

  it("renders the rich V3 coaching taxonomy and suppresses empty semantic sections", () => {
    const detail = richV3Detail();
    const html = renderToStaticMarkup(React.createElement(
      HomeConfidenceDetailBody, { detail }));
    for (const text of ["What moved Confidence", "What supports the outlook",
      "What still limits the outlook", "What could raise Confidence",
      "What could lower Confidence", "What happens next", "Coach’s Take"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("The build plan is clearly working");
    expect(html).toContain("The next DEXA");
    expect(html).not.toContain("What changed");
    expect(html).not.toContain("What we need next");
    expect(html).not.toMatch(/support index|repricing|No items/iu);
  });

  it("shows the current publication movement without converting a later hold into another increase", () => {
    const increase = renderToStaticMarkup(React.createElement(
      HomeConfidenceDetail, { confidence: 79, detail: richV3Detail() }));
    expect(increase).toContain("↑ Up 17 points");
    const hold = renderToStaticMarkup(React.createElement(
      HomeConfidenceDetail, { confidence: 79, detail: {
        ...richV3Detail(), movement: "held", delta: 0,
        latestMeaningfulMovement: { percentage: 79, delta: 17,
          movement: "increase" },
      } }));
    expect(hold).toContain("— Held");
    expect(hold).not.toContain("Up 17 points");
  });

  it("still renders a legacy explanation's summary paragraph when one is genuinely supplied", () => {
    const detail = buildConfidenceExplanationDetail({
      legacyUncertaintyStatement: "Confidence remained stable because the outlook did not materially change.",
    });
    const html = renderToStaticMarkup(React.createElement(HomeConfidenceDetailBody, { detail }));
    expect(html).toContain("Confidence remained stable because the outlook did not materially change.");
  });

  it("reads with natural prose capitalization for an arbitrary future assessment", () => {
    const detail = buildConfidenceExplanationDetail({
      narrativeText: "Confidence increased slightly because Nutrition intake support persisted.",
      movement: "increase", movementRationaleCode: "proxy_support_repeated_increase",
      remainingUncertaintyItems: [{ kind: "recovery_evidence_missing", materiality: "high" }],
    });
    expectInternalDomainNamesNatural([...detail.supportingFactors, ...detail.limitingFactors, ...detail.clarifyingFactors]);
    const html = renderToStaticMarkup(React.createElement(HomeConfidenceDetailBody, { detail }));
    expect(html).not.toMatch(/\[object Object\]/);
  });
});

function richV3Detail() {
  return {
    schemaVersion: "home_confidence_presentation_v3",
    currentPercentage: 79,
    qualitativeLevel: "Moderate",
    movement: "increased",
    delta: 17,
    whyConfidence: "The build plan is clearly working.",
    whatIncreasedIt: ["You added meaningful lean tissue."],
    whatSupportsItNow: ["There is enough time left."],
    whatIsHoldingItBack: ["One result does not promise an identical repeat."],
    whatCouldRaiseIt: ["Consistent execution before the next DEXA."],
    whatCouldLowerIt: ["Training performance materially declining."],
    nextEvidence: "The next DEXA tests whether this progress continues.",
    coachTake: "Stay the course and keep executing.",
    goal: { id: "goal", label: "the goal" },
    phase: { id: "phase", label: "Current phase" },
  };
}
