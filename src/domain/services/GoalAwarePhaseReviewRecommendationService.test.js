import { describe, expect, it } from "vitest";
import { evaluateGoalAwarePhaseReview } from "./GoalAwarePhaseReviewRecommendationService";

const base = { nextPhaseId: "next", phaseEvidenceConclusion: "unresolved",
  forecastStatus: "forecast_on_track", guardrailStatus: "below",
  guardrailDeviationMagnitude: "slight", evidenceTrend: "stable", uncertainty: "bounded",
  remainingGoalDays: 70, extensionDays: 14, nextPhaseMonitorable: true,
  nextPhaseAdjustable: true };

describe("Goal-aware Phase Review recommendation", () => {
  it("can proceed with bounded uncertainty when delay is meaningful", () => {
    const result = evaluateGoalAwarePhaseReview(base);
    expect(result).toMatchObject({ recommendation: "begin_next_phase",
      evidenceConclusion: "sufficiently_resolved_to_proceed",
      guardrail: { status: "below", deviationMagnitude: "slight",
        exactMembershipPreserved: true } });
  });
  it("continues for a material Guardrail concern despite deadline pressure", () => {
    expect(evaluateGoalAwarePhaseReview({ ...base, remainingGoalDays: 30,
      guardrailDeviationMagnitude: "material" }).recommendation).toBe("extend_current_phase");
  });
  it("continues when unstable evidence keeps information valuable", () => {
    expect(evaluateGoalAwarePhaseReview({ ...base, evidenceTrend: "unstable" })
      .recommendation).toBe("extend_current_phase");
  });
  it("begins when the objective is explicitly satisfied", () => {
    expect(evaluateGoalAwarePhaseReview({ ...base, phaseEvidenceConclusion: "conclusively_satisfied",
      guardrailStatus: "inside", guardrailDeviationMagnitude: "none", remainingGoalDays: 200 })
      .recommendation).toBe("begin_next_phase");
  });
  it("continues when extra information is valuable and delay cost is low", () => {
    expect(evaluateGoalAwarePhaseReview({ ...base, uncertainty: "material",
      remainingGoalDays: 300 }).recommendation).toBe("extend_current_phase");
  });
  it("never treats monitor-only ambiguity as implicit readiness", () => {
    expect(evaluateGoalAwarePhaseReview({ ...base, uncertainty: "unbounded",
      evidenceTrend: "stable" }).recommendation).toBe("extend_current_phase");
  });
});
