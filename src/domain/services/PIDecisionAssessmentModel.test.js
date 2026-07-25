import { describe, expect, it } from "vitest";
import {
  createPIDecisionAssessment,
  createPIDecisionAssessmentId,
  PI_DECISION_KINDS,
  PI_DECISION_STATUSES,
  validatePIDecisionAssessment,
} from "./PIDecisionAssessmentModel";

function valid(overrides = {}) {
  return {
    decisionKind: "continue_observing",
    status: "provisional",
    cadence: "weekly",
    semanticHorizon: "weekly",
    goalContext: {
      activeGoalId: "goal_build_lean_mass",
      semanticGoalType: "lean_mass_gain",
    },
    phaseContext: { phaseAgeBand: "week_1_to_4" },
    decisionScope: "goal_phase",
    domain: "cross_domain",
    confidence: { level: "low", method: "decision_evidence_threshold" },
    materiality: { level: "low" },
    lifecycle: { state: "new", observationCount: 1 },
    evidenceWindow: { startDate: "2026-07-19", endDate: "2026-07-25" },
    supportingCandidateIds: ["candidate_a"],
    supportingClaimIds: ["claim_a"],
    supportingObservationIds: [],
    supportingEvidenceIds: ["evidence_a"],
    contradictingCandidateIds: [],
    contradictingClaimIds: [],
    evidenceCompleteness: "partial",
    limitations: ["coverage_partial"],
    rationaleData: {
      relationshipKind: "training_energy_relationship",
      completenessState: "partial",
      evidenceCountSummary: { candidates: 1, claims: 1 },
    },
    recommendationCompatibility: "unknown",
    eventAuthority: "no_event",
    createdFrom: "pi_decision_intelligence_service",
    provenance: {
      producer: "pi_decision_intelligence_service",
      producerVersion: "pi_decision_intelligence_v1",
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
    ...overrides,
  };
}

describe("PIDecisionAssessmentModel", () => {
  it.each(PI_DECISION_KINDS)("supports decision kind %s", (decisionKind) => {
    const review = decisionKind.startsWith("review_");
    const domain = decisionKind === "review_energy_support" ? "energy"
      : decisionKind === "review_training_status" ? "training"
        : decisionKind === "review_recovery_status" ? "recovery"
          : decisionKind === "review_body_fat_guardrail" ? "body_fat_guardrail"
            : decisionKind === "maintain_current_plan" ? "plan"
              : decisionKind.includes("conflicting") ? "cross_domain" : "evidence";
    const assessment = createPIDecisionAssessment(valid({
      decisionKind,
      domain,
      status: decisionKind === "insufficient_evidence_for_change"
        ? "insufficient" : review || decisionKind === "maintain_current_plan"
          ? "supported" : "provisional",
      evidenceCompleteness: decisionKind === "maintain_current_plan" || review
        ? "complete" : "partial",
    }));
    expect(validatePIDecisionAssessment(assessment)).toBe(true);
  });

  it.each(PI_DECISION_STATUSES)("supports status %s", (status) => {
    expect(createPIDecisionAssessment(valid({ status })).status).toBe(status);
  });

  it("keeps identity stable across confidence, dates, lifecycle, and evidence", () => {
    const first = createPIDecisionAssessment(valid());
    const second = createPIDecisionAssessment(valid({
      confidence: { level: "moderate", method: "other" },
      lifecycle: { state: "strengthened", observationCount: 4 },
      evidenceWindow: { startDate: "2026-07-26", endDate: "2026-08-01" },
      supportingEvidenceIds: ["different"],
    }));
    expect(first.id).toBe(second.id);
  });

  it("changes identity across operational decision families", () => {
    const observe = createPIDecisionAssessment(valid());
    const review = createPIDecisionAssessment(valid({
      decisionKind: "review_energy_support",
      domain: "energy",
      status: "supported",
      evidenceCompleteness: "complete",
    }));
    expect(observe.id).not.toBe(review.id);
  });

  it("rejects supported maintain with incomplete evidence", () => {
    expect(() => createPIDecisionAssessment(valid({
      decisionKind: "maintain_current_plan",
      domain: "plan",
      status: "supported",
    }))).toThrow(/complete evidence/);
  });

  it("rejects reviews without a domain or Goal", () => {
    expect(() => createPIDecisionAssessment(valid({
      decisionKind: "review_energy_support",
      domain: "plan",
      status: "supported",
      evidenceCompleteness: "complete",
    }))).toThrow(/target domain/);
    expect(() => createPIDecisionAssessment(valid({
      decisionKind: "review_energy_support",
      domain: "energy",
      status: "supported",
      evidenceCompleteness: "complete",
      goalContext: {},
    }))).toThrow(/Goal context/);
  });

  it("rejects prescriptions, actions, causal rationale, prose, and raw evidence", () => {
    for (const extra of [
      { action: { type: "change_calories", amount: 200 } },
      { rationaleData: { causalInference: true } },
      { finalProse: "Increase calories." },
      { rawEvidence: [{ value: 1 }] },
    ]) expect(() => createPIDecisionAssessment(valid(extra))).toThrow();
  });

  it("bounds references and rejects self-reference", () => {
    expect(() => createPIDecisionAssessment(valid({
      supportingEvidenceIds: Array.from({ length: 25 }, (_, index) => `e${index}`),
    }))).toThrow(/bounded/);
    const id = createPIDecisionAssessmentId({
      decisionKind: "continue_observing",
      domain: "cross_domain",
      goalSemanticType: "lean_mass_gain",
      phaseBand: "week_1_to_4",
      semanticHorizon: "weekly",
    });
    expect(() => createPIDecisionAssessment(valid({
      supportingCandidateIds: [id],
    }))).toThrow(/itself/);
  });

  it("is deterministic, immutable, repository-free, and clock-free", () => {
    const input = valid();
    const before = structuredClone(input);
    const first = createPIDecisionAssessment(input);
    expect(input).toEqual(before);
    expect(createPIDecisionAssessment(input)).toEqual(first);
    expect(first.provenance).toMatchObject({
      repositoryReads: 0,
      runtimeClockReads: 0,
    });
  });
});
