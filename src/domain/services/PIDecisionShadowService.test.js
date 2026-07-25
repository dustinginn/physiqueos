import { describe, expect, it } from "vitest";
import { createPIDecisionShadow } from "./PIDecisionShadowService";

const window = { startDate: "2026-07-19", endDate: "2026-07-25" };
function source(overrides = {}) {
  const recommendation = {
    id: "existing_recommendation",
    kind: "keep_plan_steady",
    priority: 1,
  };
  return {
    cadence: "weekly",
    evaluationDate: "2026-07-25",
    cadenceEligible: true,
    goalContext: {
      activeGoalId: "goal",
      semanticGoalType: "lean_mass_gain",
      phaseId: "phase",
      phaseAgeBand: "week_1_to_4",
    },
    phaseContext: { phaseId: "phase", phaseAgeBand: "week_1_to_4" },
    rankedCandidates: [{
      id: "candidate",
      candidateType: "cross_domain_claim",
      relationshipKind: "training_energy_relationship",
      participatingDomains: ["training", "energy"],
      status: "improving",
      direction: "positive",
      confidence: { level: "moderate" },
      materiality: { level: "moderate", score: 60 },
      lifecycle: { state: "unchanged", totalObservationCount: 3 },
      evidenceWindow: window,
      supportingEvidenceIds: ["training", "energy"],
      explanationData: {
        relationshipState: "training_progress_with_positive_energy_support",
      },
    }],
    claims: [{
      id: "claim",
      kind: "training_energy_relationship",
      participatingDomains: ["training", "energy"],
      participatingObservationIds: ["training_observation", "energy_observation"],
      confidence: { level: "moderate" },
      materiality: { level: "moderate" },
      lifecycle: { state: "unchanged", totalObservationCount: 3 },
      evidenceWindow: window,
      explanationData: {
        relationshipState: "training_progress_with_positive_energy_support",
      },
      provenance: { sourceEvidenceIds: ["training", "energy"] },
    }],
    evidenceCompleteness: {
      overall: "complete", training: "complete", energy: "complete",
      recovery: "complete", bodyComposition: "complete",
    },
    eventAuthority: { state: "no_event" },
    existingRecommendationMetadata: { compatibility: "compatible" },
    existingRecommendation: recommendation,
    existingNarrative: { title: "Existing evidence narrative" },
    sundayHandoff: { state: "unchanged" },
    memory: { schemaVersion: "pi_briefing_memory_v1", entries: [] },
    evidenceWindow: window,
    renderingCompatible: true,
    memoryCompatible: true,
    integrationEnabled: false,
    ...overrides,
  };
}

describe("PIDecisionShadowService", () => {
  it.each(["daily", "midweek", "weekly"])(
    "evaluates %s without changing recommendations, narrative, handoff, artifacts, or memory",
    (cadence) => {
      const input = source({ cadence });
      const result = createPIDecisionShadow(input);
      expect(result.primary).not.toBeNull();
      expect(result.recommendationAfter).toEqual(input.existingRecommendation);
      expect(result.narrativeAfter).toEqual(input.existingNarrative);
      expect(result.handoffAfter).toEqual(input.sundayHandoff);
      expect(result.memoryAfter).toEqual(input.memory);
      expect(result).toMatchObject({
        wouldAlterRecommendation: false,
        wouldAlterNarrative: false,
        wouldAlterHandoff: false,
        wouldAlterArtifact: false,
        wouldAlterMemory: false,
        authorityReady: false,
        blocker: "authoritative_integration_not_enabled",
      });
    }
  );

  it("does not enable Daily for a Goal without Daily cadence", () => {
    const result = createPIDecisionShadow(source({
      cadence: "daily",
      cadenceEligible: false,
    }));
    expect(result.primary).toMatchObject({
      decisionKind: "insufficient_evidence_for_change",
      status: "not_applicable",
    });
  });

  it("preserves event ownership and suppresses routine authority", () => {
    const result = createPIDecisionShadow(source({
      eventAuthority: { state: "goal_completion" },
      integrationEnabled: true,
    }));
    expect(result.eventAuthority).toBe("goal_completion_owns_surface");
    expect(result.overlap.state).toBe("event_owned");
    expect(result.authorityReady).toBe(false);
  });

  it("classifies structured recommendation conflict without parsing prose", () => {
    const result = createPIDecisionShadow(source({
      existingRecommendationMetadata: { compatibility: "conflicts" },
      integrationEnabled: true,
    }));
    expect(result.recommendationCompatibility).toBe("conflicts");
    expect(result.overlap.state).toBe("conflicts");
    expect(result.recommendationAfter).toEqual(source().existingRecommendation);
  });

  it("isolates synthesis failures and preserves all existing output", () => {
    const input = source({ evidenceWindow: null });
    const result = createPIDecisionShadow(input);
    expect(result).toMatchObject({
      authorityReady: false,
      blocker: "decision_shadow_failure",
      wouldAlterRecommendation: false,
      wouldAlterNarrative: false,
      wouldAlterHandoff: false,
      wouldAlterArtifact: false,
      wouldAlterMemory: false,
    });
    expect(result.recommendationAfter).toEqual(input.existingRecommendation);
  });
});
