import { validatePIDecisionAssessment } from "./PIDecisionAssessmentModel";

export const PI_DECISION_RENDERING_ADAPTER_VERSION =
  "pi_decision_rendering_adapter_v1";

const CONCEPTS = Object.freeze({
  maintain_current_plan: {
    conceptKey: "maintain_current_approach",
    text: "Current evidence supports keeping the current approach unchanged.",
  },
  continue_observing: {
    conceptKey: "continue_observing",
    text: "The evidence is still developing, so continued observation is more appropriate than changing the plan.",
  },
  insufficient_evidence_for_change: {
    conceptKey: "insufficient_evidence_for_change",
    text: "The current evidence is not complete enough to justify a change.",
  },
  review_energy_support: {
    conceptKey: "review_energy_support",
    text: "Energy support deserves review before the next calibration decision.",
  },
  review_training_status: {
    conceptKey: "review_training_status",
    text: "Training status deserves review because performance has weakened without a clear support-domain explanation.",
  },
  review_recovery_status: {
    conceptKey: "review_recovery_status",
    text: "Recovery deserves review as part of the current Training interpretation.",
  },
  review_body_fat_guardrail: {
    conceptKey: "review_body_fat_guardrail",
    text: "Body-fat guardrails deserve review based on measured or repeated evidence.",
  },
  conflicting_evidence_continue_observing: {
    conceptKey: "conflicting_evidence_observe",
    text: "Conflicting signals make continued observation more appropriate than changing the plan.",
  },
});

export function createPIDecisionRenderingConcept(assessment) {
  validatePIDecisionAssessment(assessment);
  if (assessment.status === "suppressed" ||
      assessment.eventAuthority !== "no_event") return null;
  const concept = CONCEPTS[assessment.decisionKind];
  if (!concept) return null;
  return Object.freeze({
    schemaVersion: PI_DECISION_RENDERING_ADAPTER_VERSION,
    decisionId: assessment.id,
    decisionKind: assessment.decisionKind,
    status: assessment.status,
    confidence: assessment.confidence.level,
    domain: assessment.domain,
    conceptKey: concept.conceptKey,
    text: concept.text,
    executableAction: null,
    recommendationObject: null,
    provenance: {
      producer: "pi_decision_rendering_adapter",
      producerVersion: PI_DECISION_RENDERING_ADAPTER_VERSION,
    },
  });
}
