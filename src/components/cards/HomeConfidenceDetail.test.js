import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeConfidenceDetailBody } from "./HomeConfidenceDetail";
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
    // Bottom summary paragraph is suppressed — nothing left over to duplicate supports/limits/clearer.
    expect(html).not.toMatch(/rounded-xl bg-\[var\(--surface-muted\)\] p-3/);
  });

  it("omits the bottom paragraph entirely (no empty wrapper) when uncertaintyStatement is empty", () => {
    const html = renderToStaticMarkup(React.createElement(HomeConfidenceDetailBody, {
      detail: { qualitativeLevel: "Moderate", supportingFactors: [], limitingFactors: [], clarifyingFactors: [], uncertaintyStatement: "" },
    }));
    expect(html).not.toMatch(/rounded-xl bg-\[var\(--surface-muted\)\]/);
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
