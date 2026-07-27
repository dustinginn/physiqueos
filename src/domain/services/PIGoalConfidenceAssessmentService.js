import {
  createPIGoalConfidenceAssessment,
  createPIGoalConfidenceInputFingerprint,
} from "./PIGoalConfidenceAssessmentModel";

export const PI_GOAL_CONFIDENCE_ASSESSMENT_SERVICE_VERSION =
  "pi_goal_confidence_assessment_service_v1";

export function createPIGoalConfidenceAssessmentService() {
  return Object.freeze({
    assess(input = {}) {
      const normalizedInputFingerprint =
        input.inputFingerprint ?? createPIGoalConfidenceInputFingerprint({
          goalId: input.goalId,
          phaseId: input.phaseId,
          operatingState: input.operatingState,
          context: input.context,
          contributors: input.contributors,
          reasoning: input.reasoning,
          provenance: input.provenance,
        });
      return createPIGoalConfidenceAssessment({
        ...input,
        inputFingerprint: normalizedInputFingerprint,
      });
    },
  });
}

export const PIGoalConfidenceAssessmentService =
  createPIGoalConfidenceAssessmentService();
