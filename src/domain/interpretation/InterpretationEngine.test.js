import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { InterpretationEngine } from "./InterpretationEngine";
import { validateStructuredInterpretation } from "./StructuredInterpretationModel";

const interpret = (overrides = {}) =>
  InterpretationEngine.interpret(createInterpretationV2Fixture(overrides));

describe("InterpretationEngine", () => {
  it("produces the complete score-free Structured Interpretation contract", () => {
    const result = interpret();

    expect(result.objectiveEvaluation.aggregateStatus).toBe("on_track");
    expect(result.guardrailEvaluation.aggregateStatus).toBe("clear");
    expect(result.strategyValidation.status).toBe("confirmed");
    expect(result.evidenceReconciliation.agreementStatus)
      .toBe("strong_convergence");
    expect(result.evidenceReconciliation.quality.status).toBe("robust");
    expect(result.remainingUncertainty.status).toBe("none_material");
    expect(result.nextDecisiveEvidence.status).toBe("not_required");
    expect(result.interpretationSummary).toEqual({
      outcome: "on_track",
      expectationMatch: "on_track",
      strategyResult: "confirmed",
      guardrailResult: "clear",
      evidenceResult: "strong_convergence",
      uncertaintyResult: "none_material",
    });
    expect(validateStructuredInterpretation(result)).toBe(true);
    expect(forbiddenKeys(result)).toEqual([]);
  });

  it.each([
    [4, "ahead"],
    [2, "on_track"],
    [0, "behind"],
    [-2, "contradicted"],
  ])("evaluates objective result %s as %s against trajectory", (value, status) => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors[0].measurements[0].value = value;
    expect(InterpretationEngine.interpret(fixture).objectiveEvaluation.aggregateStatus)
      .toBe(status);
  });

  it("returns uncertain when trajectory semantics are absent and never uses completion", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.goalContract.expectedTrajectory.segments = [];
    fixture.evidenceDescriptors[0].measurements[0].value = 20;
    const result = InterpretationEngine.interpret(fixture);

    expect(result.objectiveEvaluation.aggregateStatus).toBe("uncertain");
    expect(result.objectiveEvaluation.conclusions[0].rationale)
      .toBe("objective_trajectory_expectation_missing");
    expect(result.remainingUncertainty.items[0].kind).toBe("goal_semantics_missing");
  });

  it("evaluates Guardrails independently from a favorable Objective", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors[0].measurements[0].value = 4;
    fixture.evidenceDescriptors[0].measurements[1].value = 13;
    const result = InterpretationEngine.interpret(fixture);

    expect(result.objectiveEvaluation.aggregateStatus).toBe("ahead");
    expect(result.guardrailEvaluation.aggregateStatus).toBe("violated");
  });

  it("keeps an uncertain Objective independent from a clear Guardrail", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors[0].measurements =
      fixture.evidenceDescriptors[0].measurements.filter((item) =>
        item.metric !== "lean_mass_change_lb");
    const result = InterpretationEngine.interpret(fixture);

    expect(result.objectiveEvaluation.aggregateStatus).toBe("uncertain");
    expect(result.guardrailEvaluation.aggregateStatus).toBe("clear");
  });

  it("retains every Guardrail conclusion and aggregates the most severe state", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.goalContract.guardrails.push({
      guardrailId: "guardrail_weight_trend",
      monitoredMetricOrCapability: "weight_change_lb",
      warningThreshold: { operator: "gt", value: 3 },
      pressureThreshold: { operator: "gt", value: 5 },
      violationThreshold: { operator: "gt", value: 8 },
      required: true,
    });
    fixture.goalContract.relevantEvidence.entries.push({
      evidenceMapId: "map_weight_guardrail",
      evidenceCapability: "weight_trend",
      appliesTo: {
        objectiveRefs: [],
        guardrailRefs: ["guardrail_weight_trend"],
        hypothesisRefs: [],
        milestoneRefs: [],
      },
      role: "monitoring",
    });
    fixture.evidenceDescriptors.push({
      id: "evidence_weight_july",
      capability: "weight_trend",
      observedAt: "2026-07-31T12:00:00.000Z",
      strength: "high",
      agreement: "supports",
      temporalApplicability: "applicable",
      quality: {
        provenanceIntegrity: "high",
        temporalAdequacy: "adequate",
        comparisonAdequacy: "adequate",
      },
      measurements: [{ metric: "weight_change_lb", value: 6, unit: "lb" }],
    });
    const result = InterpretationEngine.interpret(fixture);

    expect(result.guardrailEvaluation.aggregateStatus).toBe("pressured");
    expect(result.guardrailEvaluation.conclusions).toHaveLength(2);
    expect(result.guardrailEvaluation.conclusions.map((item) => item.status).sort())
      .toEqual(["clear", "pressured"]);
  });

  it("supports every canonical Strategy validation state", () => {
    const directional = createInterpretationV2Fixture();
    directional.goalContract.relevantEvidence.entries[0]
      .appliesTo.hypothesisRefs = [];
    expect(InterpretationEngine.interpret(directional).strategyValidation.status)
      .toBe("directionally_supported");

    const calibrating = createInterpretationV2Fixture();
    calibrating.executionState.adequacy = "inadequate";
    expect(InterpretationEngine.interpret(calibrating).strategyValidation.status)
      .toBe("still_calibrating");

    const mixed = createInterpretationV2Fixture();
    mixed.evidenceDescriptors[1].agreement = "contradicts";
    expect(InterpretationEngine.interpret(mixed).strategyValidation.status)
      .toBe("mixed");

    const contradicted = createInterpretationV2Fixture();
    contradicted.evidenceDescriptors.forEach((item) => {
      item.agreement = "contradicts";
    });
    expect(InterpretationEngine.interpret(contradicted).strategyValidation.status)
      .toBe("contradicted");
  });

  it("separates insufficient elapsed time and progress without attribution", () => {
    const elapsed = createInterpretationV2Fixture();
    elapsed.executionState.elapsedTimeAdequacy = "insufficient";
    expect(InterpretationEngine.interpret(elapsed).strategyValidation).toMatchObject({
      status: "still_calibrating",
      rationale: "strategy_elapsed_time_insufficient",
    });

    const unattributed = createInterpretationV2Fixture();
    unattributed.goalContract.relevantEvidence.entries.forEach((entry) => {
      entry.appliesTo.hypothesisRefs = [];
    });
    const result = InterpretationEngine.interpret(unattributed);
    expect(result.objectiveEvaluation.aggregateStatus).toBe("on_track");
    expect(result.strategyValidation.status).toBe("still_calibrating");
  });

  it("keeps Evidence Strength, Goal Relevance, and Agreement independent", () => {
    const decisive = interpret();
    const decisiveItem = decisive.evidenceReconciliation.items.find((item) =>
      item.conclusionRef === "objective:objective_lean_mass_response" &&
      item.evidenceRef === "evidence_dexa_july_18");
    const fixture = createInterpretationV2Fixture();
    fixture.goalContract.relevantEvidence.entries[0].role = "informational";
    const contextual = InterpretationEngine.interpret(fixture);
    const contextualItem = contextual.evidenceReconciliation.items.find((item) =>
      item.conclusionRef === "objective:objective_lean_mass_response" &&
      item.evidenceRef === "evidence_dexa_july_18");

    expect(decisiveItem).toMatchObject({
      strength: "authoritative", relevance: "decisive", agreement: "supports",
    });
    expect(contextualItem).toMatchObject({
      strength: "authoritative",
      relevance: "supporting_context",
      agreement: "supports",
    });
  });

  it("does not let strong but Goal-irrelevant evidence drive an Objective", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.goalContract.relevantEvidence.entries[0].role = "not_relevant";
    const result = InterpretationEngine.interpret(fixture);
    const item = result.evidenceReconciliation.items.find((entry) =>
      entry.conclusionRef === "objective:objective_lean_mass_response");

    expect(item).toMatchObject({
      strength: "authoritative",
      relevance: "not_applicable",
      agreement: "supports",
    });
    expect(result.objectiveEvaluation.aggregateStatus).toBe("uncertain");
  });

  it("does not let weak evidence establish an Objective or Guardrail threshold", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors[0].strength = "low";
    fixture.evidenceDescriptors[1].strength = "low";
    fixture.evidenceDescriptors[0].measurements[0].value = -2;
    fixture.evidenceDescriptors[0].measurements[1].value = 13;
    const result = InterpretationEngine.interpret(fixture);

    expect(result.objectiveEvaluation.aggregateStatus).toBe("uncertain");
    expect(result.guardrailEvaluation).toMatchObject({
      aggregateStatus: "watch",
      conclusions: [{ evaluable: false, rationale: "guardrail_weak_signal" }],
    });
  });

  it.each([
    ["strong_convergence", ["supports", "supports"], ["group_a", "group_b"]],
    ["moderate_convergence", ["supports"], ["group_a"]],
    ["mixed", ["supports", "neutral"], ["group_a", "group_b"]],
    ["conflicting", ["supports", "contradicts"], ["group_a", "group_b"]],
    ["insufficient", ["neutral"], ["group_a"]],
  ])("classifies Evidence Agreement as %s", (expected, agreements, groups) => {
    const fixture = agreementFixture(agreements, groups);
    expect(InterpretationEngine.interpret(fixture)
      .evidenceReconciliation.agreementStatus).toBe(expected);
  });

  it("does not count shared lineage as independent convergence", () => {
    const fixture = agreementFixture(
      ["supports", "supports"], ["shared_lineage", "shared_lineage"]);
    expect(InterpretationEngine.interpret(fixture)
      .evidenceReconciliation.agreementStatus).toBe("moderate_convergence");
  });

  it("keeps low-quality material evidence explicit without collapsing dimensions", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors[1].strength = "low";
    fixture.evidenceDescriptors[1].quality.provenanceIntegrity = "limited";
    fixture.evidenceDescriptors[1].quality.limitations = ["manual_log_gap"];
    const result = InterpretationEngine.interpret(fixture);
    const item = result.evidenceReconciliation.items.find((entry) =>
      entry.evidenceRef === "evidence_training_july");

    expect(item).toMatchObject({
      strength: "low", relevance: "material", agreement: "supports",
    });
    expect(result.evidenceReconciliation.quality.limitations)
      .toContain("manual_log_gap");
    expect(result.evidenceReconciliation.quality.status).toBe("adequate");
  });

  it.each([
    ["robust", (fixture) => fixture],
    ["limited", (fixture) => {
      fixture.evidenceDescriptors[1].quality.provenanceIntegrity = "unknown";
      return fixture;
    }],
    ["insufficient", (fixture) => {
      fixture.evidenceDescriptors = [];
      return fixture;
    }],
  ])("classifies Evidence Quality as %s", (status, arrange) => {
    const fixture = arrange(createInterpretationV2Fixture());
    expect(InterpretationEngine.interpret(fixture)
      .evidenceReconciliation.quality.status).toBe(status);
  });

  it("preserves structured uncertainty and identifies the next decisive event", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors = fixture.evidenceDescriptors.filter((item) =>
      item.capability !== "dexa_body_composition");
    const result = InterpretationEngine.interpret(fixture);

    expect(result.objectiveEvaluation.aggregateStatus).toBe("uncertain");
    expect(result.remainingUncertainty.status).toBe("material");
    expect(result.remainingUncertainty.items.some((item) =>
      item.kind === "measurement_pending")).toBe(true);
    expect(result.nextDecisiveEvidence).toMatchObject({
      status: "identified",
      evidenceCapability: "dexa_body_composition",
      expectedEventType: "dexa_scan",
      expectedWindow: "next_scheduled_dexa_window",
    });
  });

  it("treats an authoritative DEXA baseline as evidence, not progress confirmation", () => {
    const fixture = createInterpretationV2Fixture();
    fixture.evidenceDescriptors[0].agreement = "indeterminate";
    fixture.evidenceDescriptors[0].quality.comparisonAdequacy = "missing";
    fixture.evidenceDescriptors[0].measurements =
      fixture.evidenceDescriptors[0].measurements.filter((item) =>
        item.metric !== "lean_mass_change_lb");
    const result = InterpretationEngine.interpret(fixture);
    const objectiveItem = result.evidenceReconciliation.items.find((entry) =>
      entry.conclusionRef === "objective:objective_lean_mass_response");

    expect(objectiveItem).toMatchObject({
      strength: "authoritative",
      relevance: "decisive",
      agreement: "indeterminate",
    });
    expect(result.objectiveEvaluation.aggregateStatus).toBe("uncertain");
    expect(result.remainingUncertainty.items.some((item) =>
      item.kind === "comparison_missing")).toBe(true);
    expect(result.nextDecisiveEvidence).toMatchObject({
      status: "identified",
      evidenceCapability: "dexa_body_composition",
      expectedEventType: "dexa_scan",
    });
  });

  it("is deterministic, order-independent, immutable, and does not mutate inputs", () => {
    const firstInput = createInterpretationV2Fixture();
    const before = structuredClone(firstInput);
    const first = InterpretationEngine.interpret(firstInput);
    const reordered = createInterpretationV2Fixture();
    reordered.evidenceDescriptors.reverse();
    reordered.evaluationContext.interpretedAt = "2026-08-01T14:00:00.000Z";
    const second = InterpretationEngine.interpret(reordered);

    expect(firstInput).toEqual(before);
    expect(first.id).toBe(second.id);
    expect(first.provenance.inputFingerprint)
      .toBe(second.provenance.inputFingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.evidenceReconciliation.items)).toBe(true);
  });
});

function forbiddenKeys(value, path = []) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const next = [...path, key];
    const forbidden = /(score|confidence|forecast|narrative|publication|presentation|coaching|recommendation)/i
      .test(key) ? [next.join(".")] : [];
    return [...forbidden, ...forbiddenKeys(child, next)];
  });
}

function agreementFixture(agreements, groups) {
  const fixture = createInterpretationV2Fixture();
  fixture.goalContract.guardrails = [];
  fixture.goalContract.strategyHypothesis.expectedResponses = [];
  fixture.strategyHypothesis.expectedResponses = [];
  fixture.goalContract.relevantEvidence.entries = [{
    evidenceMapId: "map_agreement",
    evidenceCapability: "agreement_signal",
    appliesTo: {
      objectiveRefs: ["objective_lean_mass_response"],
      guardrailRefs: [],
      hypothesisRefs: [],
      milestoneRefs: [],
    },
    role: "primary",
  }];
  fixture.evidenceDescriptors = agreements.map((agreement, index) => ({
    id: `evidence_agreement_${index}`,
    capability: "agreement_signal",
    observedAt: "2026-07-31T12:00:00.000Z",
    strength: "high",
    agreement,
    temporalApplicability: "applicable",
    independenceGroup: groups[index],
    quality: {
      provenanceIntegrity: "high",
      temporalAdequacy: "adequate",
      comparisonAdequacy: "adequate",
    },
    measurements: [{
      metric: "lean_mass_change_lb",
      value: 2,
      unit: "lb",
      observedAt: "2026-07-31T12:00:00.000Z",
    }],
  }));
  return fixture;
}
