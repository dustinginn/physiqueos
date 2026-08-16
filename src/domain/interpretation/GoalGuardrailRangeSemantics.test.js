import { describe, expect, it } from "vitest";
import { evaluateInterpretationGuardrails } from "./GoalEvaluationService";

describe("Goal Guardrail range semantics", () => {
  it.each([
    [7.6, "watch", "below", "slight"],
    [8, "clear", "inside", "none"],
    [9, "clear", "inside", "none"],
    [9.4, "watch", "above", "slight"],
    [10.5, "pressured", "above", "material"],
    [11.5, "violated", "above", "material"],
  ])("classifies bounded-range value %s as %s/%s/%s",
    (value, status, membership, magnitude) => {
      const result = evaluate(value, bounded());
      expect(result).toMatchObject({ aggregateStatus: status,
        conclusions: [{ status, observedResult: {
          rangeMembership: membership, deviationMagnitude: magnitude,
        } }] });
    });

  it("keeps minimum-only and maximum-only boundaries directional", () => {
    expect(evaluate(4.5, {
      ...base(), constraint: { kind: "minimum", operator: "gte", value: 5 },
      warningThreshold: { operator: "lt", value: 5 },
      pressureThreshold: { operator: "lt", value: 4 },
      violationThreshold: { operator: "lt", value: 3 },
    }).conclusions[0]).toMatchObject({ status: "watch",
      observedResult: { rangeMembership: "below" } });
    expect(evaluate(10.5, {
      ...base(), constraint: { kind: "maximum", operator: "lte", value: 10 },
      warningThreshold: { operator: "gt", value: 10 },
      pressureThreshold: { operator: "gt", value: 11 },
      violationThreshold: { operator: "gt", value: 12 },
    }).conclusions[0]).toMatchObject({ status: "watch",
      observedResult: { rangeMembership: "above" } });
  });
});

function bounded() { return { ...base(),
  constraint: { kind: "bounded_range", min: 8, max: 9, unit: "percent" },
  warningThreshold: { operator: "outside", min: 8, max: 9 },
  pressureThreshold: { operator: "outside", min: 7, max: 10 },
  violationThreshold: { operator: "outside", min: 6, max: 11 },
}; }
function base() { return { guardrailId: "guardrail-generic", required: true,
  monitoredMetricOrCapability: "metric-generic" }; }
function evaluate(value, guardrail) {
  return evaluateInterpretationGuardrails({
    goalContract: { guardrails: [guardrail] },
    evidenceDescriptors: [{ id: "evidence-generic", measurements: [{
      metric: "metric-generic", value, unit: "units", observedAt: "2026-08-01",
    }] }],
    evidenceReconciliation: { items: [{ conclusionRef: "guardrail:guardrail-generic",
      temporalApplicability: "applicable", relevance: "decisive",
      strength: "authoritative", evidenceRef: "evidence-generic" }] },
  });
}
