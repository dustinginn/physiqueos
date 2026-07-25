import { describe, expect, it } from "vitest";
import { createDecisionAssessments } from "./PIDecisionIntelligenceService";

const window = { startDate: "2026-07-19", endDate: "2026-07-25" };
function candidate(overrides = {}) {
  return {
    id: "candidate_training_energy",
    candidateType: "cross_domain_claim",
    relationshipKind: "training_energy_relationship",
    participatingDomains: ["training", "energy"],
    status: "improving",
    direction: "positive",
    confidence: { level: "moderate" },
    materiality: { level: "moderate", score: 60 },
    lifecycle: { state: "unchanged", totalObservationCount: 3 },
    evidenceWindow: window,
    supportingEvidenceIds: ["training_evidence", "energy_evidence"],
    explanationData: {
      relationshipState: "training_progress_with_positive_energy_support",
      trainingStatus: "improving",
    },
    ...overrides,
  };
}
function claim(overrides = {}) {
  return {
    id: "claim_training_energy",
    kind: "training_energy_relationship",
    participatingDomains: ["training", "energy"],
    participatingObservationIds: ["training_observation", "energy_observation"],
    confidence: { level: "moderate" },
    materiality: { level: "moderate", score: 60 },
    lifecycle: { state: "unchanged", totalObservationCount: 3 },
    evidenceWindow: window,
    explanationData: {
      relationshipState: "training_progress_with_positive_energy_support",
    },
    provenance: { sourceEvidenceIds: ["training_evidence", "energy_evidence"] },
    ...overrides,
  };
}
function input(overrides = {}) {
  return {
    cadence: "weekly",
    goalContext: {
      activeGoalId: "goal_build_lean_mass",
      semanticGoalType: "lean_mass_gain",
      phaseId: "phase_maintenance",
      phaseAgeBand: "week_1_to_4",
    },
    phaseContext: {
      phaseId: "phase_maintenance",
      phaseAgeBand: "week_1_to_4",
    },
    rankedCandidates: [candidate()],
    claims: [claim()],
    evidenceCompleteness: {
      overall: "complete",
      training: "complete",
      energy: "complete",
      recovery: "complete",
      bodyComposition: "complete",
    },
    eventAuthority: { state: "no_event" },
    existingRecommendationMetadata: { compatibility: "compatible" },
    evidenceWindow: window,
    cadenceEligible: true,
    ...overrides,
  };
}
function primary(overrides) {
  return createDecisionAssessments(input(overrides)).primary;
}

describe("PIDecisionIntelligenceService", () => {
  it("supports maintain only from complete multi-domain positive evidence", () => {
    expect(primary().decisionKind).toBe("maintain_current_plan");
    expect(primary().status).toBe("supported");
    expect(primary({
      rankedCandidates: [candidate({
        participatingDomains: ["training"],
      })],
      claims: [],
    }).decisionKind).not.toBe("maintain_current_plan");
  });

  it("blocks maintain for missing evidence, events, guardrails, and unknown Goals", () => {
    expect(primary({ evidenceCompleteness: {
      overall: "missing", training: "missing", energy: "missing",
      recovery: "missing", bodyComposition: "missing",
    }}).decisionKind).toBe("insufficient_evidence_for_change");
    expect(primary({ eventAuthority: { state: "dexa_event" } }).status).toBe("suppressed");
    expect(primary({ goalContext: { semanticGoalType: "unknown" } }).decisionKind)
      .toBe("continue_observing");
    expect(primary({ rankedCandidates: [candidate({
      id: "guardrail",
      candidateType: "body_fat_guardrail",
      relationshipKind: "early_phase_body_fat_guardrail",
      participatingDomains: ["dexa"],
      status: "concern",
      lifecycle: { state: "strengthened", totalObservationCount: 2 },
    })] }).decisionKind).toBe("review_body_fat_guardrail");
  });

  it("keeps a single Photo concern provisional", () => {
    expect(primary({ rankedCandidates: [candidate({
      id: "photo_guardrail",
      candidateType: "body_fat_guardrail",
      relationshipKind: "early_phase_body_fat_guardrail",
      participatingDomains: ["photos"],
      status: "concern",
      lifecycle: { state: "new", totalObservationCount: 1 },
    })] })).toMatchObject({
      decisionKind: "continue_observing",
      status: "provisional",
    });
  });

  it("reviews Energy only for complete material exact-window support", () => {
    const energyClaim = claim({
      lifecycle: { state: "strengthened", totalObservationCount: 2 },
      explanationData: {
        relationshipState: "training_decline_with_negative_energy_balance",
      },
    });
    expect(primary({ claims: [energyClaim] }).decisionKind).toBe("review_energy_support");
    expect(primary({
      claims: [energyClaim],
      evidenceCompleteness: {
        overall: "partial", training: "complete", energy: "partial",
        recovery: "complete", bodyComposition: "complete",
      },
    }).decisionKind).toBe("continue_observing");
    expect(primary({ claims: [claim({
      lifecycle: { state: "strengthened", totalObservationCount: 2 },
      explanationData: {
        relationshipState: "training_decline_despite_positive_energy_balance",
      },
    })] }).decisionKind).not.toBe("review_energy_support");
  });

  it("reviews persistent Training decline without a supported Energy or Recovery explanation", () => {
    const training = candidate({
      id: "training_decline",
      candidateType: "direct_training",
      relationshipKind: "training_performance",
      participatingDomains: ["training"],
      status: "regressing",
      direction: "negative",
      lifecycle: { state: "strengthened", totalObservationCount: 3 },
      explanationData: { trainingStatus: "regressing" },
    });
    expect(primary({ rankedCandidates: [training], claims: [] }).decisionKind)
      .toBe("review_training_status");
  });

  it("reviews only repeated, complete, aligned Recovery strain", () => {
    const recoveryClaim = claim({
      id: "claim_recovery_training",
      kind: "recovery_training_relationship",
      participatingDomains: ["recovery", "training"],
      lifecycle: { state: "strengthened", totalObservationCount: 2 },
      explanationData: {
        relationshipState: "training_stability_with_strained_recovery",
      },
    });
    expect(primary({ claims: [recoveryClaim] }).decisionKind)
      .toBe("review_recovery_status");
    expect(primary({ claims: [recoveryClaim], evidenceCompleteness: {
      overall: "partial", training: "complete", energy: "complete",
      recovery: "partial", bodyComposition: "complete",
    }}).decisionKind).toBe("continue_observing");
    expect(primary({ claims: [recoveryClaim], evidenceCompleteness: {
      overall: "complete", training: "complete", energy: "complete",
      recovery: "complete", bodyComposition: "complete",
    }, rankedCandidates: [], conflicts: ["recovery_metrics_conflict"] }).decisionKind)
      .toBe("conflicting_evidence_continue_observing");
  });

  it("preserves conflicts and structured recommendation incompatibility", () => {
    expect(primary({ conflicts: ["training_recovery_divergence"] })).toMatchObject({
      decisionKind: "conflicting_evidence_continue_observing",
      status: "conflicted",
    });
    expect(primary({
      existingRecommendationMetadata: { compatibility: "conflicts" },
    }).decisionKind).toBe("conflicting_evidence_continue_observing");
  });

  it("keeps current-Goal Daily ineligible without enabling cadence", () => {
    expect(primary({ cadence: "daily", cadenceEligible: false })).toMatchObject({
      decisionKind: "insufficient_evidence_for_change",
      status: "not_applicable",
    });
  });

  it("returns at most two assessments with stable identity and bounded rationale", () => {
    const first = createDecisionAssessments(input());
    const second = createDecisionAssessments(input({
      evidenceWindow: { startDate: "2026-07-26", endDate: "2026-08-01" },
      rankedCandidates: [candidate({
        evidenceWindow: { startDate: "2026-07-26", endDate: "2026-08-01" },
      })],
      claims: [claim({
        evidenceWindow: { startDate: "2026-07-26", endDate: "2026-08-01" },
      })],
    }));
    expect(first.assessments.length).toBeLessThanOrEqual(2);
    expect(first.primary.id).toBe(second.primary.id);
    expect(JSON.stringify(first.primary.rationaleData)).not.toMatch(
      /rawEvidence|finalProse|sets|meals|photos|calorieChange/i
    );
  });

  it("is pure, deterministic, non-prescriptive, non-diagnostic, and non-causal", () => {
    const source = input();
    const before = structuredClone(source);
    const result = createDecisionAssessments(source);
    expect(source).toEqual(before);
    expect(createDecisionAssessments(source)).toEqual(result);
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      runtimeClockReads: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /increase calories|decrease calories|deload|overtrain|under.?recover|diagnos|causalInference/i
    );
  });
});
