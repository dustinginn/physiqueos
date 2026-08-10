import { describe, expect, it } from "vitest";
import { ForecastEngine } from "../forecast/ForecastEngine";
import { createForecastAssessment } from "../forecast/ForecastAssessmentModel";
import { adaptForecastAssessmentToPreviousContext } from "../forecast/PIV1ForecastCompatibilityAdapter";
import { createForecastV2Fixture } from "../../fixtures/forecastV2Fixtures";
import { createNarrativeV2Fixture } from "../../fixtures/narrativeV2Fixtures";
import { NarrativeEngine } from "./NarrativeEngine";
import { validateNarrativeAssessment } from "./NarrativeModel";

const explain = (options = {}) =>
  NarrativeEngine.explain(createNarrativeV2Fixture(options));

describe("NarrativeEngine", () => {
  it("creates the complete structured coaching explanation", () => {
    const result = explain();

    expect(result.forecastSummary).toMatchObject({
      goalForecastStatus: "on_forecast",
      confidenceBand: "high",
      forecastDirection: "stable",
    });
    expect(result.confidenceExplanation).toMatchObject({
      confidenceBand: "high",
      movement: "no_meaningful_change",
      remainingUncertaintyStatus: "none_material",
    });
    expect(result.primarySupportingFactors.length).toBeGreaterThan(0);
    expect(result.primaryLimitingFactors).toEqual([]);
    expect(result.remainingUncertaintyExplanation.items).toEqual([]);
    expect(result.nextDecisiveEvidenceExplanation.status).toBe("not_required");
    expect(result.recommendedCoachingDirection.state).toBe("stay_the_course");
    expect(validateNarrativeAssessment(result)).toBe(true);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it("preserves complete Goal to Interpretation to Forecast to Narrative lineage", () => {
    const forecastInput = createForecastV2Fixture();
    const forecastAssessment = ForecastEngine.forecast(forecastInput);
    const narrative = NarrativeEngine.explain({
      goalContract: forecastInput.goalContract,
      forecastAssessment,
    });

    expect(forecastAssessment.interpretationRef)
      .toBe(forecastInput.structuredInterpretation.id);
    expect(narrative.forecastRef).toBe(forecastAssessment.id);
    expect(narrative.goalRef.goalId)
      .toBe(forecastInput.structuredInterpretation.goalRef.goalId);
  });

  it.each([
    ["stay_the_course", () => {}],
    ["continue_calibration", (input) => {
      input.evidenceDescriptors[0].measurements =
        input.evidenceDescriptors[0].measurements.filter((item) =>
          item.metric !== "lean_mass_change_lb");
    }],
    ["monitor_closely", (input) => {
      input.evidenceDescriptors[0].measurements[1].value = 10.5;
    }],
    ["prepare_adjustment", (input) => {
      input.evidenceDescriptors[0].measurements[1].value = 11.5;
    }],
    ["strategy_review_recommended", (input) => {
      input.evidenceDescriptors[0].measurements[1].value = 13;
    }],
  ])("classifies coaching direction as %s", (state, arrange) => {
    const result = explain({ arrangeInterpretationInput: arrange });
    expect(result.recommendedCoachingDirection.state).toBe(state);
    expect(result.recommendedCoachingDirection.text).toEqual(expect.any(String));
  });

  it("explains increased, decreased, and stable Forecast movement verbatim", () => {
    const baseForecast = ForecastEngine.forecast(createForecastV2Fixture());
    const baseContext = adaptForecastAssessmentToPreviousContext(baseForecast);
    const increased = explain({
      previousForecastContext: baseContext,
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].measurements[0].value = 4;
      },
    });
    expect(increased.confidenceExplanation).toMatchObject({
      movement: "increase",
      movementRationaleCode: "forecast_and_band_materially_strengthened",
    });
    expect(increased.confidenceExplanation.uncertaintyReduction.factorCodes)
      .toEqual(expect.arrayContaining([
        "agreement_strong_convergence", "quality_robust",
      ]));

    const aheadForecast = createNarrativeV2Fixture({
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].measurements[0].value = 4;
      },
    }).forecastAssessment;
    const decreased = explain({
      previousForecastContext:
        adaptForecastAssessmentToPreviousContext(aheadForecast),
    });
    expect(decreased.confidenceExplanation).toMatchObject({
      movement: "decrease",
      movementRationaleCode: "forecast_and_band_materially_weakened",
      uncertaintyReduction: {
        status: "not_identified_by_forecast",
        factorCodes: [],
      },
    });

    const stable = explain();
    expect(stable.confidenceExplanation).toMatchObject({
      movement: "no_meaningful_change",
      movementRationaleCode: "prior_forecast_semantics_unavailable",
    });
  });

  it("explains remaining uncertainty and Next Decisive Evidence", () => {
    const result = explain({
      arrangeInterpretationInput(input) {
        input.evidenceDescriptors[0].measurements =
          input.evidenceDescriptors[0].measurements.filter((item) =>
            item.metric !== "lean_mass_change_lb");
        input.evidenceDescriptors[0].quality.comparisonAdequacy = "missing";
      },
    });

    expect(result.remainingUncertaintyExplanation.items)
      .toContainEqual(expect.objectContaining({
        kind: "comparison_missing",
        translationStatus: "translated",
        text: "A valid comparison remains unavailable.",
      }));
    expect(result.nextDecisiveEvidenceExplanation).toMatchObject({
      status: "identified",
      evidenceCapability: "dexa_body_composition",
      expectedEventType: "dexa_scan",
      sourceReasonCode: "resolves_comparison_missing",
    });
  });

  it("explains stronger cadence evidence without implying Forecast movement", () => {
    const fixture = createNarrativeV2Fixture();
    const forecastAssessment = createForecastAssessment({
      ...fixture.forecastAssessment,
      id: undefined,
      goalForecastStatus: "forecast_uncertain",
      confidenceBand: "moderate",
      forecastDirection: "indeterminate",
      movement: { direction: "no_meaningful_change",
        priorForecastRef: "prior",
        rationale: "forecast_change_not_material" },
      forecastExplanation: {
        ...fixture.forecastAssessment.forecastExplanation,
        primarySupportingFactors: [
          "strategy_directionally_supported", "quality_adequate",
        ],
        primaryLimitingFactors: ["objective_uncertain", "agreement_mixed"],
        movementRationale: "forecast_change_not_material",
      },
      remainingUncertainty: {
        ...fixture.forecastAssessment.remainingUncertainty,
        status: "material",
      },
    });
    const result = NarrativeEngine.explain({
      goalContract: fixture.goalContract,
      forecastAssessment,
    });
    expect(result.confidenceExplanation).toMatchObject({
      movement: "no_meaningful_change",
      movementRationaleCode: "forecast_change_not_material",
      text: "Confidence remained stable. The available assessment quality is adequate. The current strategy is directionally supported but not fully confirmed. The primary outcome remains uncertain. Material questions remain unresolved.",
    });
  });

  it("never invents an explanation for an unknown Forecast factor", () => {
    const fixture = createNarrativeV2Fixture();
    const forecastAssessment = createForecastAssessment({
      ...fixture.forecastAssessment,
      id: undefined,
      forecastExplanation: {
        ...fixture.forecastAssessment.forecastExplanation,
        primarySupportingFactors: [
          ...fixture.forecastAssessment.forecastExplanation
            .primarySupportingFactors,
          "future_factor_without_template",
        ],
      },
    });
    const result = NarrativeEngine.explain({
      goalContract: fixture.goalContract,
      forecastAssessment,
    });

    expect(result.primarySupportingFactors).toContainEqual({
      code: "future_factor_without_template",
      text: null,
      translationStatus: "unknown",
    });
    expect(result.confidenceExplanation.confidenceBand)
      .toBe(forecastAssessment.confidenceBand);
    expect(result.confidenceExplanation.movement)
      .toBe(forecastAssessment.movement.direction);
  });

  it("uses Goal metadata but never branches on the Goal display name", () => {
    const fixture = createNarrativeV2Fixture();
    fixture.goalContract.goal.name = "A Display Name";
    const first = NarrativeEngine.explain(fixture);
    fixture.goalContract.goal.name = "A Completely Different Display Name";
    const second = NarrativeEngine.explain(fixture);

    expect(first.id).toBe(second.id);
    expect(first.goalContext).toMatchObject({ category: "body_composition" });
    expect(JSON.stringify(first)).not.toContain("Display Name");
  });

  it("rejects raw evidence, direct domain inputs, and identity mismatches", () => {
    const fixture = createNarrativeV2Fixture();
    expect(() => NarrativeEngine.explain({
      ...fixture,
      evidenceDescriptors: [],
    })).toThrow("Narrative accepts no input field: evidenceDescriptors");
    expect(() => NarrativeEngine.explain({
      ...fixture,
      dexa: { value: 1 },
    })).toThrow("Narrative accepts no input field: dexa");
    const mismatch = structuredClone(fixture);
    mismatch.goalContract.goal.goalId = "another_goal";
    expect(() => NarrativeEngine.explain(mismatch))
      .toThrow("Narrative Goal Contract and Forecast identity mismatch");
  });

  it("does not read Goal evidence, trajectory, Strategy, or execution records", () => {
    const fixture = createNarrativeV2Fixture();
    for (const field of [
      "relevantEvidence", "expectedTrajectory", "strategyHypothesis",
      "executionState",
    ]) {
      Object.defineProperty(fixture.goalContract, field, {
        configurable: true,
        get() {
          throw new Error(`Narrative attempted to read ${field}.`);
        },
      });
    }
    expect(() => NarrativeEngine.explain(fixture)).not.toThrow();
  });

  it("is deterministic, immutable, and does not mutate inputs", () => {
    const input = createNarrativeV2Fixture();
    const before = structuredClone(input);
    const first = NarrativeEngine.explain(input);
    const second = NarrativeEngine.explain(structuredClone(input));

    expect(input).toEqual(before);
    expect(first.id).toBe(second.id);
    expect(first.provenance.inputFingerprint).toBe(second.provenance.inputFingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.primarySupportingFactors)).toBe(true);
  });
});

function forbiddenKeys(value, path = []) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const next = [...path, key];
    const forbidden = /(presentation|jsx|html|publication|render|component|markup|className|style|card|layout|probability|percentage|score)/i
      .test(key) || ["confidence", "numericconfidence"]
        .includes(key.toLowerCase())
      ? [next.join(".")] : [];
    return [...forbidden, ...forbiddenKeys(child, next)];
  });
}
