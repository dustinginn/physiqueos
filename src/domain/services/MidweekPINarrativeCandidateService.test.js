import { describe, expect, it } from "vitest";
import {
  adaptMidweekPISelection,
  createMidweekPINarrativeCandidate,
} from "./MidweekPINarrativeCandidateService";

const ranking = {
  rank: 1,
  score: 72,
  candidate: {
    id: "pi_narrative|energy_trend|midweek.energy_calibration",
    sourceId: "midweek.energy_calibration",
    candidateType: "energy_trend",
    relationshipKind: "cadence_energy_trend",
    thesisDomain: "energy",
    direction: "falling",
    explanationData: {
      comparison: {
        intake: { direction: "stable" },
        estimatedExpenditure: { direction: "rising" },
        netBalance: { direction: "falling" },
      },
    },
    goalContext: { observationRole: "context" },
    confidence: { level: "moderate" },
    coverage: { state: "complete" },
    limitations: ["estimated_expenditure"],
    supportingEvidenceIds: ["a", "n", "d"],
  },
};

describe("MidweekPINarrativeCandidateService", () => {
  it("adapts shared selection without rescoring or prose", () => {
    expect(createMidweekPINarrativeCandidate(ranking)).toEqual({
      candidateId: ranking.candidate.id,
      sourceId: "midweek.energy_calibration",
      candidateType: "energy_trend",
      relationshipKind: "cadence_energy_trend",
      thesisDomain: "energy",
      measuredDirections: {
        training: null,
        weight: null,
        intake: "stable",
        expenditure: "rising",
        balance: "falling",
      },
      goalRole: "context",
      confidence: { level: "moderate" },
      coverage: { state: "complete" },
      limitations: ["estimated_expenditure"],
      evidenceReferences: ["a", "n", "d"],
      editorialTemplateKey: "midweek_energy_calibration",
      recommendationEligible: false,
      sundayHandoffEligible: false,
      provenance: {
        producer: "midweek_pi_narrative_candidate_service",
        sourceCandidateId: ranking.candidate.id,
        sharedRank: 1,
        sharedScore: 72,
      },
    });
  });

  it("preserves one primary and at most two supporting candidates", () => {
    const result = adaptMidweekPISelection({
      primary: [ranking],
      supporting: [ranking, ranking, ranking],
    });
    expect(result.primary.candidateId).toBe(ranking.candidate.id);
    expect(result.supporting).toHaveLength(2);
  });

  it("adds bounded structured rendering context only for Training Energy", () => {
    const result = createMidweekPINarrativeCandidate({
      ...ranking,
      candidate: {
        ...ranking.candidate,
        candidateType: "cross_domain_claim",
        relationshipKind: "training_energy_relationship",
        thesisDomain: "training",
        explanationData: {
          trainingStatus: "improving",
          energyDirection: "stable",
          relationshipState:
            "training_progress_with_positive_energy_support",
        },
      },
    });
    expect(result).toMatchObject({
      editorialTemplateKey: "midweek_cross_domain_relationship",
      renderingContext: {
        relationshipState: "progress_with_positive_support",
        source: "structured_claim_explanation",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/Training improved/);
  });

  it.each([
    ["training_progress_with_positive_energy_support", "progress_with_positive_support"],
    ["training_progress_with_neutral_energy_support", "progress_with_neutral_support"],
    ["training_progress_despite_negative_energy_balance", "progress_despite_negative_support"],
    ["training_stability_with_positive_energy_balance", "stable_with_positive_support"],
    ["training_stability_with_declining_energy_support", "stable_with_declining_support"],
    ["training_decline_with_negative_energy_balance", "decline_with_negative_support"],
    ["training_decline_despite_positive_energy_balance", "decline_despite_positive_support"],
    ["training_energy_relationship_insufficient", "insufficient"],
  ])("normalizes %s without prose parsing", (sourceState, expected) => {
    const result = createMidweekPINarrativeCandidate({
      ...ranking,
      candidate: {
        ...ranking.candidate,
        candidateType: "cross_domain_claim",
        relationshipKind: "training_energy_relationship",
        explanationData: { relationshipState: sourceState },
      },
    });
    expect(result.renderingContext.relationshipState).toBe(expected);
  });

  it("rejects an unbounded Training Energy rendering state", () => {
    expect(() => createMidweekPINarrativeCandidate({
      ...ranking,
      candidate: {
        ...ranking.candidate,
        candidateType: "cross_domain_claim",
        relationshipKind: "training_energy_relationship",
        explanationData: { relationshipState: "invented_state" },
      },
    })).toThrow("Unsupported Training Energy relationship state.");
  });
});
