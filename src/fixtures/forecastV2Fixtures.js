import { InterpretationEngine } from "../domain/interpretation/InterpretationEngine";
import { createInterpretationV2Fixture } from "./interpretationV2Fixtures";

export function createForecastV2Fixture({
  arrangeInterpretationInput = null,
  arrangeGoalContract = null,
  previousForecastContext = null,
} = {}) {
  const interpretationInput = createInterpretationV2Fixture();
  interpretationInput.goalContract.timeline = {
    startDate: "2026-07-01",
    targetCompletionDate: "2026-12-31",
    constraintType: "firm",
  };
  interpretationInput.goalContract.milestones = [
    {
      milestoneId: "milestone_calibration_complete",
      timing: { expectedDateOrWindow: "2026-07-20" },
      purpose: "reduce_baseline_uncertainty",
      objectiveRefs: ["objective_lean_mass_response"],
      guardrailRefs: ["guardrail_body_fat"],
      hypothesisRefs: ["hypothesis_progressive_training"],
      uncertaintyExpectedToReduce: ["comparison_missing"],
      decisionBoundary: "baseline_calibration",
      required: true,
    },
    {
      milestoneId: "milestone_first_validation",
      timing: {
        expectedDateOrWindow: { start: "2026-09-10", end: "2026-09-20" },
      },
      purpose: "test_first_adaptation_window",
      objectiveRefs: ["objective_lean_mass_response"],
      guardrailRefs: ["guardrail_body_fat"],
      hypothesisRefs: ["hypothesis_progressive_training"],
      uncertaintyExpectedToReduce: ["attribution"],
      decisionBoundary: "first_validation",
      required: true,
    },
  ];
  interpretationInput.goalContract.relevantEvidence.entries[0]
    .appliesTo.milestoneRefs = ["milestone_calibration_complete"];
  arrangeGoalContract?.(interpretationInput.goalContract);
  arrangeInterpretationInput?.(interpretationInput);
  interpretationInput.strategyHypothesis = structuredClone(
    interpretationInput.goalContract.strategyHypothesis);
  const structuredInterpretation = InterpretationEngine.interpret(
    interpretationInput);
  return {
    goalContract: structuredClone(interpretationInput.goalContract),
    structuredInterpretation,
    previousForecastContext: previousForecastContext
      ? structuredClone(previousForecastContext) : null,
  };
}
