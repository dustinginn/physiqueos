import { describe, expect, it } from "vitest";
import {
  adaptDEXAEventToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
  isQualifyingPhotoEventInterpretation,
} from "./ProductionConfidenceContextAdapter";

describe("production Confidence V2 context adapters", () => {
  it("materializes a Goal Contract from accepted production Goal semantics", () => {
    const contract = adaptProductionGoalToCanonicalContract(goal(), {
      activePhase: goal().phases[0],
    });
    expect(contract).toMatchObject({
      contractVersion: "goal_contract_v2_production_adapter_v1",
      goal: { goalId: "goal-one" },
      objectives: [{ measurement: { metricOrCapability: "lean_mass_change_lb" },
        completionThreshold: { operator: "gte", value: 10 } }],
      guardrails: [{ monitoredMetricOrCapability: "body_fat_pct",
        warningThreshold: { operator: "gt", value: 9 },
        violationThreshold: { operator: "gt", value: 11 } }],
    });
    expect(contract.relevantEvidence.entries.every((item) =>
      item.appliesTo.objectiveRefs.length || item.appliesTo.guardrailRefs.length ||
      item.appliesTo.hypothesisRefs.length)).toBe(true);
  });

  it("normalizes a real DEXA comparison into Goal-readable measurements", () => {
    const descriptors = adaptDEXAEventToEvidenceDescriptors({
      priorScan: scan("prior", 150, 14, 8, 170),
      scan: scan("current", 152.5, 15.2, 8.4, 173),
    });
    expect(descriptors[0].measurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "lean_mass_change_lb", value: 2.5 }),
      expect.objectContaining({ metric: "fat_mass_change_lb", value: 1.2 }),
      expect.objectContaining({ metric: "body_fat_pct", value: 8.4 }),
    ]));
  });

  it("fails closed instead of fabricating an incomplete Goal Objective", () => {
    expect(() => adaptProductionGoalToCanonicalContract({ id: "goal" }))
      .toThrow(/canonical_goal_objective_incomplete/);
  });

  it("qualifies a Goal-relevant canonical visual interpretation, including no-change reads", () => {
    expect(isQualifyingPhotoEventInterpretation({ goalId: "goal-one", narrative: {
      poseInterpretations: [{ goalId: "goal-one", goalRelevance: "primary",
        confidence: "moderate", observations: ["Condition appears stable."] }],
    } })).toBe(true);
    expect(isQualifyingPhotoEventInterpretation({ goalId: "goal-one", narrative: {
      poseInterpretations: [{ goalId: "other", goalRelevance: "primary",
        confidence: "moderate", observations: ["Unrelated change."] }],
    } })).toBe(false);
  });
});

function goal() {
  return {
    id: "goal-one", type: "body_composition", updatedAt: "2026-07-20T00:00:00Z",
    purpose: "Build lean mass while controlling body fat",
    target: { type: "numeric_change", metric: "lean_mass", direction: "increase",
      amount: 10, unit: "lb", description: "Build 10 lb lean mass",
      targetDate: "2026-10-31" },
    timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" },
    openingApproach: { value: "calibration", known: [], unknown: [] },
    phases: [{ id: "phase-one", status: "active", name: "Calibration",
      purpose: "Establish maintenance", successCriteria: [] }],
    guardrails: [{ id: "body-fat", text: "Maintain approximately 8-9% body fat.",
      accepted: true }],
    progressMeasurement: { outcomeMeasures: [{ id: "dexa", evidenceType:
      "dexa_lean_mass", role: "outcome", accepted: true }],
    predictiveSignals: [{ id: "training", evidenceType: "training_trend",
      role: "predictive", accepted: true }], explanatorySignals: [] },
  };
}
function scan(id, lean, fat, bodyFat, weight) {
  return { id, measuredAt: "2026-08-01T08:00:00-07:00",
    leanMass: { value: lean }, fatMass: { value: fat },
    bodyFatPercentage: bodyFat, totalMass: { value: weight } };
}
