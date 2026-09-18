import { deepFreeze, matchesCapability } from "./v3/V3Runtime.js";

export const EvidenceParticipationV3 = Object.freeze({
  DIRECT_CONFIDENCE_INPUT: "DIRECT_CONFIDENCE_INPUT",
  PERSISTENCE_CONFIRMATION_INPUT: "PERSISTENCE_CONFIRMATION_INPUT",
  NARRATIVE_CONTEXT_ONLY: "NARRATIVE_CONTEXT_ONLY",
  GUARDRAIL: "GUARDRAIL",
  NOT_CURRENTLY_STRATEGICALLY_ELIGIBLE: "NOT_CURRENTLY_STRATEGICALLY_ELIGIBLE",
});

export const EVIDENCE_DOMAIN_CLASSIFICATION_MATRIX_V3 = deepFreeze([
  boundary("weight", ["DIRECT_CONFIDENCE_INPUT", "PERSISTENCE_CONFIRMATION_INPUT", "GUARDRAIL", "NARRATIVE_CONTEXT_ONLY"], "Goal-relative body-mass capability; never a universal proxy for composition."),
  boundary("dexa", ["DIRECT_CONFIDENCE_INPUT", "PERSISTENCE_CONFIRMATION_INPUT", "GUARDRAIL", "NARRATIVE_CONTEXT_ONLY"], "Canonical measured composition capabilities only; raw report prose is not strategic authority."),
  boundary("progress_photos", ["PERSISTENCE_CONFIRMATION_INPUT", "NARRATIVE_CONTEXT_ONLY"], "Comparable structured qualitative observations only; existence and imagery never manufacture numeric composition."),
  boundary("nutrition", ["PERSISTENCE_CONFIRMATION_INPUT", "NARRATIVE_CONTEXT_ONLY", "GUARDRAIL"], "Behavioral/execution evidence unless a contract declares a directly measured nutrition objective."),
  boundary("activity", ["DIRECT_CONFIDENCE_INPUT", "PERSISTENCE_CONFIRMATION_INPUT", "NARRATIVE_CONTEXT_ONLY", "GUARDRAIL"], "Direct only for an activity-defined objective; otherwise execution or context."),
  boundary("training", ["DIRECT_CONFIDENCE_INPUT", "PERSISTENCE_CONFIRMATION_INPUT", "NARRATIVE_CONTEXT_ONLY", "GUARDRAIL"], "Direct for declared performance capabilities; proxy/context for unrelated outcomes."),
  boundary("recovery", ["PERSISTENCE_CONFIRMATION_INPUT", "NARRATIVE_CONTEXT_ONLY", "GUARDRAIL"], "A configured support or safety signal, never an implicit outcome."),
  boundary("execution_priorities", ["PERSISTENCE_CONFIRMATION_INPUT", "NARRATIVE_CONTEXT_ONLY"], "Can retire bounded execution risk; cannot substitute for a measured Goal result."),
  boundary("goal_transition", ["NARRATIVE_CONTEXT_ONLY"], "Defines historical/current Goal scope and accepted baselines; does not itself prove progress."),
  boundary("phase_transition", ["NARRATIVE_CONTEXT_ONLY"], "Defines Phase and strategy scope; does not itself prove effectiveness."),
]);

export function inferEvidenceParticipationV3({ usableFor = [], subjectType = null } = {}) {
  if (subjectType === "guardrail" || usableFor.includes("guardrail")) {
    return EvidenceParticipationV3.GUARDRAIL;
  }
  if (usableFor.some((value) => ["objective", "achievement", "trajectory"].includes(value))) {
    return EvidenceParticipationV3.DIRECT_CONFIDENCE_INPUT;
  }
  if (usableFor.some((value) => ["persistence", "execution"].includes(value))) {
    return EvidenceParticipationV3.PERSISTENCE_CONFIRMATION_INPUT;
  }
  if (usableFor.some((value) => ["narrative", "attribution", "feasibility"].includes(value))) {
    return EvidenceParticipationV3.NARRATIVE_CONTEXT_ONLY;
  }
  return EvidenceParticipationV3.NOT_CURRENTLY_STRATEGICALLY_ELIGIBLE;
}

export function classifyObservationParticipationV3({ goalContract, observation } = {}) {
  const classifications = [];
  for (const measurement of observation?.capabilities ?? []) {
    const policies = (goalContract?.evidencePolicies ?? []).filter((policy) =>
      matchesCapability(policy.capabilityPattern, measurement.capabilityId));
    if (!policies.length) {
      classifications.push({
        observationId: observation.observationId,
        capabilityId: measurement.capabilityId,
        participation: EvidenceParticipationV3.NOT_CURRENTLY_STRATEGICALLY_ELIGIBLE,
        policyId: null,
      });
      continue;
    }
    for (const policy of policies) {
      classifications.push({
        observationId: observation.observationId,
        capabilityId: measurement.capabilityId,
        participation: policy.participation ?? inferEvidenceParticipationV3(policy),
        policyId: policy.policyId,
        subjectType: policy.subjectType,
        subjectId: policy.subjectId,
      });
    }
  }
  return deepFreeze(classifications);
}

function boundary(domain, allowedParticipation, boundaryDescription) {
  return { domain, allowedParticipation, boundaryDescription };
}
