import { describe, expect, it } from "vitest";

import {
  EVIDENCE_DOMAIN_CLASSIFICATION_MATRIX_V3,
  EvidenceParticipationV3,
  classifyObservationParticipationV3,
} from "./EvidenceDomainClassificationV3.js";
import { createEvidenceObservationV3 } from "./v3/EvidenceObservationV3.js";
import { createGoalContractV3 } from "./v3/GoalContractV3.js";

describe("V3 evidence-domain ownership matrix", () => {
  it("classifies every application evidence domain without assigning universal authority", () => {
    expect(EVIDENCE_DOMAIN_CLASSIFICATION_MATRIX_V3.map((item) => item.domain))
      .toEqual([
        "weight", "dexa", "progress_photos", "nutrition", "activity",
        "training", "recovery", "execution_priorities", "goal_transition",
        "phase_transition",
      ]);
    expect(EVIDENCE_DOMAIN_CLASSIFICATION_MATRIX_V3.every((item) =>
      item.allowedParticipation.length > 0 && item.boundaryDescription)).toBe(true);
  });

  it("classifies the same Training capability by its Goal-relative contract", () => {
    const observation = createEvidenceObservationV3({
      observationId: "training_1",
      sourceType: "canonical_training",
      observedAt: "2026-09-12T00:00:00.000Z",
      directness: "direct",
      quality: { status: "robust" },
      capabilities: [{ capabilityId: "performance.max_force", value: 125 }],
    });
    const direct = classifyObservationParticipationV3({
      goalContract: contract("DIRECT_CONFIDENCE_INPUT", ["objective"]),
      observation,
    });
    const contextual = classifyObservationParticipationV3({
      goalContract: contract("NARRATIVE_CONTEXT_ONLY", ["narrative"]),
      observation,
    });
    expect(direct[0].participation).toBe(EvidenceParticipationV3.DIRECT_CONFIDENCE_INPUT);
    expect(contextual[0].participation).toBe(EvidenceParticipationV3.NARRATIVE_CONTEXT_ONLY);
  });
});

function contract(participation, usableFor) {
  return createGoalContractV3({
    goalId: "goal",
    contractVersion: "v1",
    goalLabel: "Performance Goal",
    phase: { phaseId: "phase" },
    strategy: { strategyRevisionId: "strategy", feasibilityCriteria: [] },
    objectives: [{
      objectiveId: "objective",
      metricCapability: {
        namespace: "performance", key: "max_force", valueKind: "scalar",
      },
      evaluation: {
        mode: "increase", baselineValue: 100, meaningfulChangeThreshold: 1,
      },
    }],
    evidencePolicies: [{
      policyId: "policy",
      subjectType: "objective",
      subjectId: "objective",
      capabilityPattern: "performance.max_force",
      role: "decisive",
      minimumQuality: "adequate",
      participation,
      usableFor,
    }],
  });
}
