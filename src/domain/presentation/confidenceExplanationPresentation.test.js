import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildConfidenceExplanationDetail,
  translateConfidenceProse,
} from "./confidenceExplanationPresentation";
import { expectInternalDomainNamesNatural } from "./proseCapitalization";

function expectAllStrings(detail) {
  expect(typeof detail.uncertaintyStatement).toBe("string");
  for (const list of [detail.supportingFactors, detail.limitingFactors, detail.clarifyingFactors]) {
    expect(Array.isArray(list)).toBe(true);
    for (const item of list) expect(typeof item).toBe("string");
  }
  const flattened = JSON.stringify(detail);
  expect(flattened).not.toMatch(/\[object Object\]/);
}

function expectNoInternalVocabulary(strings) {
  const joined = strings.join(" ");
  // Confidence-engine/domain vocabulary that must never reach the user directly.
  expect(joined).not.toMatch(/\b(kind|materiality|reducibility|affectedConclusionRefs|candidateEvidenceMapRefs)\b/i);
  expect(joined).not.toMatch(/measurement_pending|energy_calibration_uncertain|goal_semantics_missing|recovery_evidence_missing/);
  expect(joined).not.toMatch(/interpretation_uncertainty\|/);
  expect(joined).not.toMatch(/\bobjective_measurement_missing\b/);
  expect(joined).not.toMatch(/threshold/i);
  expect(joined).not.toMatch(/calibrat(ed|ion)/i);
  expect(joined).not.toMatch(/\[object Object\]|\{".*":/);
}

describe("confidenceExplanationPresentation", () => {
  describe("supporting factors — semantic classification, not raw narrative echo", () => {
    it("classifies sustained training support without echoing the raw engine sentence", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence increased slightly because Training progression support persisted across completed evidence periods and the current strategy is more consistently supported. Direct Goal confirmation remains pending.",
        movement: "increase",
        movementRationaleCode: "proxy_support_sustained_increase",
      });
      expect(detail.supportingFactors).toEqual([
        "Training has continued moving forward, which supports confidence that the plan is working.",
      ]);
      expectNoInternalVocabulary(detail.supportingFactors);
      expectInternalDomainNamesNatural(detail.supportingFactors);
    });

    it("classifies a resolved uncertainty factor generically", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence increased slightly because a named material uncertainty was reduced.",
        movement: "increase",
        movementRationaleCode: "uncertainty_reduced_increase",
      });
      expect(detail.supportingFactors).toEqual(["A previously uncertain factor was resolved by recent evidence."]);
    });

    it("classifies an emerging/preliminary positive hold honestly, without overstating it", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence remained stable because the weight signal is still preliminary.",
        movement: "no_meaningful_change",
        movementRationaleCode: "proxy_support_emerging_hold",
      });
      expect(detail.supportingFactors).toEqual([
        "An early positive signal is showing, though it's still too soon to be fully confident in it.",
      ]);
    });

    it("falls back to a generic supportive sentence for an unrecognized capability keyword", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence increased slightly because something unexpected persisted.",
        movement: "increase",
        movementRationaleCode: "proxy_support_sustained_increase",
      });
      expect(detail.supportingFactors).toEqual(["Recent evidence has continued to support the current plan."]);
    });

    it("produces no support claim on a genuine hold with no recognized supportive rationale", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence remained stable because the same evidence was evaluated again.",
        movement: "no_meaningful_change",
        movementRationaleCode: "duplicate_evidence_no_change",
      });
      expect(detail.supportingFactors).toEqual([]);
    });

    it("produces no support claim on a decrease", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence decreased because evidence contradicted the plan.",
        movement: "decrease",
        movementRationaleCode: null,
      });
      expect(detail.supportingFactors).toEqual([]);
    });
  });

  describe("limiting factors — plain-English meaning, not internal kind/cause dumps", () => {
    it("translates body-composition measurement uncertainty", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [{ kind: "measurement_pending", materiality: "high" }],
      });
      expect(detail.limitingFactors).toEqual([
        "There hasn't yet been enough direct body-composition evidence to confirm the desired outcome.",
      ]);
    });

    it("translates energy/intake/activity calibration uncertainty as a time-under-plan statement", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [{ kind: "energy_calibration_uncertain", materiality: "moderate" }],
      });
      expect(detail.limitingFactors).toEqual([
        "There isn't yet enough time under the current calorie and activity targets to know how the body is responding.",
      ]);
    });

    it("translates recovery limitation", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [{ kind: "recovery_evidence_missing", materiality: "moderate" }],
      });
      expect(detail.limitingFactors).toEqual(["Recovery evidence is limited right now."]);
    });

    it("safely omits a Guardrail-configuration uncertainty rather than exposing internal object language", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [
          { kind: "goal_semantics_missing", materiality: "moderate", question: "goal_x_guardrail_recovery", cause: "guardrail_threshold_incomplete" },
        ],
      });
      expect(detail.limitingFactors).toEqual([]);
      expectNoInternalVocabulary(JSON.stringify(detail).split('"'));
    });

    it("ranks by materiality and deduplicates factors that share the same translated meaning", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [
          { kind: "measurement_pending", materiality: "moderate" },
          { kind: "measurement_pending", materiality: "high" },
          { kind: "measurement_pending", materiality: "low" },
        ],
      });
      expect(detail.limitingFactors).toHaveLength(1);
    });

    it("handles multiple distinct factors together", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [
          { kind: "measurement_pending", materiality: "high" },
          { kind: "energy_calibration_uncertain", materiality: "moderate" },
          { kind: "recovery_evidence_missing", materiality: "moderate" },
        ],
      });
      expect(detail.limitingFactors).toHaveLength(3);
      expectNoInternalVocabulary(detail.limitingFactors);
      expectInternalDomainNamesNatural(detail.limitingFactors);
    });

    it("returns an empty array — a legitimate state — when there is no remaining uncertainty", () => {
      const detail = buildConfidenceExplanationDetail({ narrativeText: "x", movement: "increase", remainingUncertaintyItems: [] });
      expect(detail.limitingFactors).toEqual([]);
    });

    it("safely handles an unrecognized/unknown uncertainty kind by omitting it, never stringifying it", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        remainingUncertaintyItems: [{ kind: "some_future_uncertainty_kind_v7", materiality: "high", weirdNestedObject: { a: 1 } }],
      });
      expect(detail.limitingFactors).toEqual([]);
      expectAllStrings(detail);
    });
  });

  describe("clarifying factors — what would make Confidence clearer", () => {
    it("recommends the next DEXA/body-composition measurement when identified", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        nextConfidenceBuildingEvidence: { status: "identified", evidenceCapability: "dexa_body_composition" },
      });
      expect(detail.clarifyingFactors).toEqual([
        "The next DEXA/body-composition measurement can directly confirm how this is progressing.",
      ]);
    });

    it("returns nothing when no next evidence has been identified", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        nextConfidenceBuildingEvidence: { status: "not_identified" },
      });
      expect(detail.clarifyingFactors).toEqual([]);
    });

    it("safely omits an unrecognized evidence capability rather than exposing its raw name", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "x", movement: "increase",
        nextConfidenceBuildingEvidence: { status: "identified", evidenceCapability: "some_future_capability_v3" },
      });
      expect(detail.clarifyingFactors).toEqual([]);
    });
  });

  describe("bottom summary — suppressed rather than duplicating supports/limits/clearer", () => {
    it("is empty for the real (V2) explanation path, regardless of narrative content", () => {
      const detail = buildConfidenceExplanationDetail({
        narrativeText: "Confidence increased slightly because Training progression support persisted.",
        movement: "increase", movementRationaleCode: "proxy_support_sustained_increase",
        remainingUncertaintyItems: [{ kind: "measurement_pending", materiality: "high" }],
      });
      expect(detail.uncertaintyStatement).toBe("");
    });

    it("stays empty even with no other content, rather than reintroducing a generic filler paragraph", () => {
      const detail = buildConfidenceExplanationDetail({ narrativeText: "", movement: null, remainingUncertaintyItems: [] });
      expect(detail.uncertaintyStatement).toBe("");
      expectAllStrings(detail);
    });
  });

  describe("legacy shape compatibility", () => {
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
  });

  it("translateConfidenceProse leaves ordinary prose untouched and only rewrites the known internal phrase", () => {
    expect(translateConfidenceProse("Weight trended down this week.")).toBe("Weight trended down this week.");
    expect(translateConfidenceProse("Confidence held. Direct Goal confirmation remains pending."))
      .not.toMatch(/Direct Goal confirmation remains pending/i);
    expect(translateConfidenceProse(null)).toBe("");
    expect(translateConfidenceProse(undefined)).toBe("");
  });

  it("preserves proper names and acronyms (DEXA) while normalizing ordinary noun capitalization", () => {
    const detail = buildConfidenceExplanationDetail({
      narrativeText: "x", movement: "increase",
      nextConfidenceBuildingEvidence: { status: "identified", evidenceCapability: "dexa_body_composition" },
      remainingUncertaintyItems: [{ kind: "measurement_pending", materiality: "high" }],
    });
    expect(detail.clarifyingFactors.join(" ")).toMatch(/\bDEXA\b/);
    expectInternalDomainNamesNatural([...detail.supportingFactors, ...detail.limitingFactors, ...detail.clarifyingFactors]);
  });

  it("against the real production assessment shape: renders cleanly, with no internal vocabulary, no [object Object]", () => {
    const store = JSON.parse(fs.readFileSync("private/founder/runtime-store.json", "utf8"));
    const record = store.goalConfidenceHistory.find((item) =>
      item.assessment?.remainingUncertainty?.items?.length > 0);
    expect(record).toBeDefined();
    const assessment = record.assessment;
    const detail = buildConfidenceExplanationDetail({
      qualitativeLevel: assessment.confidenceBand,
      narrativeText: assessment.narrativeExplanation?.text ?? "",
      movement: assessment.movement,
      movementRationaleCode: assessment.narrativeExplanation?.movementRationaleCode ?? null,
      uncertaintyReduction: assessment.narrativeExplanation?.uncertaintyReduction ?? null,
      remainingUncertaintyItems: assessment.remainingUncertainty?.items ?? [],
      nextConfidenceBuildingEvidence: assessment.nextConfidenceBuildingEvidence ?? null,
    });
    expectAllStrings(detail);
    expectNoInternalVocabulary([...detail.supportingFactors, ...detail.limitingFactors, ...detail.clarifyingFactors, detail.uncertaintyStatement]);
    expectInternalDomainNamesNatural([...detail.supportingFactors, ...detail.limitingFactors, ...detail.clarifyingFactors]);
    // The specific known regression examples must never appear again.
    const flattened = [...detail.supportingFactors, ...detail.limitingFactors, ...detail.clarifyingFactors].join(" ");
    expect(flattened).not.toMatch(/Training progression support persisted across completed evidence periods/);
    expect(flattened).not.toMatch(/doesn't have a complete threshold defined/);
  });

  it("works for an arbitrary future goal/phase — not hardcoded to the current 60% assessment", () => {
    const detail = buildConfidenceExplanationDetail({
      qualitativeLevel: "Building",
      narrativeText: "Confidence increased slightly because Nutrition intake support persisted across completed evidence periods.",
      movement: "increase",
      movementRationaleCode: "proxy_support_repeated_increase",
      remainingUncertaintyItems: [
        { kind: "measurement_pending", materiality: "high" },
        { kind: "recovery_evidence_missing", materiality: "low" },
      ],
      nextConfidenceBuildingEvidence: { status: "identified", evidenceCapability: "dexa_body_composition" },
    });
    expect(detail.supportingFactors[0]).toMatch(/Nutrition and intake trends have continued to hold up/);
    expect(detail.limitingFactors).toHaveLength(2);
    expect(detail.clarifyingFactors).toHaveLength(1);
    expectAllStrings(detail);
    expectNoInternalVocabulary([...detail.supportingFactors, ...detail.limitingFactors, ...detail.clarifyingFactors]);
  });
});
