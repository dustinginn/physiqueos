import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildConfidenceExplanationDetail,
  translateConfidenceProse,
} from "./confidenceExplanationPresentation";

function expectAllStrings(detail) {
  expect(typeof detail.uncertaintyStatement).toBe("string");
  for (const list of [detail.supportingFactors, detail.limitingFactors, detail.clarifyingFactors]) {
    expect(Array.isArray(list)).toBe(true);
    for (const item of list) expect(typeof item).toBe("string");
  }
  const flattened = JSON.stringify(detail);
  expect(flattened).not.toMatch(/\[object Object\]/);
}

describe("confidenceExplanationPresentation", () => {
  it("never renders [object Object] for a structured remainingUncertainty array of objects", () => {
    const detail = buildConfidenceExplanationDetail({
      qualitativeLevel: "Moderate",
      narrativeText: "Confidence increased slightly because training support persisted.",
      movement: "increase",
      uncertaintyReduction: { status: "not_identified_by_forecast", factorCodes: [] },
      remainingUncertaintyItems: [
        { kind: "measurement_pending", materiality: "high" },
        { kind: "energy_calibration_uncertain", materiality: "moderate" },
        { kind: "recovery_evidence_missing", materiality: "moderate" },
      ],
      nextConfidenceBuildingEvidence: {
        status: "identified", evidenceCapability: "dexa_body_composition",
      },
    });
    expectAllStrings(detail);
    expect(detail.limitingFactors.length).toBeGreaterThan(0);
    expect(detail.clarifyingFactors).toEqual(["The next DEXA scan will help confirm this directly."]);
  });

  it("deduplicates limiting factors that share the same uncertainty kind", () => {
    const detail = buildConfidenceExplanationDetail({
      narrativeText: "Confidence held steady.",
      movement: "no_meaningful_change",
      remainingUncertaintyItems: [
        { kind: "goal_semantics_missing", materiality: "moderate" },
        { kind: "goal_semantics_missing", materiality: "moderate" },
        { kind: "goal_semantics_missing", materiality: "moderate" },
      ],
    });
    expect(detail.limitingFactors).toHaveLength(1);
  });

  it("translates the internal 'Direct Goal confirmation remains pending' phrase into natural language", () => {
    const detail = buildConfidenceExplanationDetail({
      narrativeText: "Confidence increased slightly because Training progression support persisted across completed evidence periods and the current strategy is more consistently supported. Direct Goal confirmation remains pending.",
      movement: "increase",
    });
    expect(detail.uncertaintyStatement).not.toMatch(/Direct Goal confirmation remains pending/i);
    expect(detail.supportingFactors.join(" ")).not.toMatch(/Direct Goal confirmation remains pending/i);
    expectAllStrings(detail);
  });

  it("supports a legacy pre-built string-array explanation shape unchanged", () => {
    const detail = buildConfidenceExplanationDetail({
      qualitativeLevel: "Developing",
      legacySupportingFactors: ["Weight trend matched the projection."],
      legacyLimitingFactors: ["Training data is still limited."],
      legacyClarifyingFactors: ["Another week of data will help."],
      legacyUncertaintyStatement: "Confidence remained stable because the outlook did not materially change.",
    });
    expect(detail).toEqual({
      qualitativeLevel: "Developing",
      supportingFactors: ["Weight trend matched the projection."],
      limitingFactors: ["Training data is still limited."],
      clarifyingFactors: ["Another week of data will help."],
      uncertaintyStatement: "Confidence remained stable because the outlook did not materially change.",
    });
    expectAllStrings(detail);
  });

  it("never lets a non-string legacy item leak through", () => {
    const detail = buildConfidenceExplanationDetail({
      legacySupportingFactors: [{ reason: "not a string" }, "a real reason"],
      legacyUncertaintyStatement: "fine",
    });
    expect(detail.supportingFactors).toEqual(["a real reason"]);
  });

  it("handles an empty/unavailable structured explanation without throwing or leaking objects", () => {
    const detail = buildConfidenceExplanationDetail({ narrativeText: "", remainingUncertaintyItems: [] });
    expectAllStrings(detail);
    expect(detail.uncertaintyStatement).toBe("Confidence reflects the latest evidence reviewed.");
  });

  it("translateConfidenceProse leaves ordinary prose untouched and only rewrites the known internal phrase", () => {
    expect(translateConfidenceProse("Weight trended down this week.")).toBe("Weight trended down this week.");
    expect(translateConfidenceProse("Confidence held. Direct Goal confirmation remains pending."))
      .not.toMatch(/Direct Goal confirmation remains pending/i);
    expect(translateConfidenceProse(null)).toBe("");
    expect(translateConfidenceProse(undefined)).toBe("");
  });

  it("against the real production assessment shape: renders cleanly with no [object Object]", () => {
    const store = JSON.parse(fs.readFileSync("private/founder/runtime-store.json", "utf8"));
    const record = store.goalConfidenceHistory.find((item) =>
      item.assessment?.remainingUncertainty?.items?.length > 0);
    expect(record).toBeDefined();
    const assessment = record.assessment;
    const detail = buildConfidenceExplanationDetail({
      qualitativeLevel: assessment.confidenceBand,
      narrativeText: assessment.narrativeExplanation?.text ?? "",
      movement: assessment.movement,
      uncertaintyReduction: assessment.narrativeExplanation?.uncertaintyReduction ?? null,
      remainingUncertaintyItems: assessment.remainingUncertainty?.items ?? [],
      nextConfidenceBuildingEvidence: assessment.nextConfidenceBuildingEvidence ?? null,
    });
    expectAllStrings(detail);
  });
});
