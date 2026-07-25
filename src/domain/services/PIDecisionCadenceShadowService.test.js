import { describe, expect, it } from "vitest";
import { createPIDecisionCadenceShadow } from "./PIDecisionCadenceShadowService";

const evidenceWindow = {
  startDate: "2026-07-19",
  endDate: "2026-07-25",
  briefingDate: "2026-07-25",
  timeZone: "America/Los_Angeles",
};

function input(overrides = {}) {
  return {
    cadence: "weekly",
    evaluationDate: "2026-07-25",
    cadenceEligible: true,
    evidenceWindow,
    activeGoal: {
      id: "goal",
      title: "Build Lean Mass",
      status: "active",
    },
    activePhase: { id: "phase", status: "active" },
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
      evidenceWindow,
      supportingEvidenceIds: ["training", "energy"],
      explanationData: {
        relationshipState: "training_progress_with_positive_energy_support",
      },
    }],
    claims: [{
      id: "claim",
      kind: "training_energy_relationship",
      participatingDomains: ["training", "energy"],
      participatingObservationIds: [
        "training_observation",
        "energy_observation",
      ],
      confidence: { level: "moderate" },
      materiality: { level: "moderate" },
      lifecycle: { state: "unchanged", totalObservationCount: 3 },
      evidenceWindow,
      explanationData: {
        relationshipState: "training_progress_with_positive_energy_support",
      },
      provenance: { sourceEvidenceIds: ["training", "energy"] },
    }],
    evidenceCompleteness: {
      overall: "complete",
      training: "complete",
      energy: "complete",
      recovery: "complete",
      bodyComposition: "complete",
    },
    eventAuthority: { state: "no_event" },
    recommendationMetadata: {
      id: "recommendation",
      kind: "keep_plan_steady",
      priority: 1,
      count: 1,
      compatibility: "compatible",
    },
    existingRecommendation: {
      id: "recommendation",
      kind: "keep_plan_steady",
      priority: 1,
    },
    existingNarrative: { title: "Existing evidence narrative" },
    sundayHandoff: { state: "unchanged" },
    memory: { schemaVersion: "pi_briefing_memory_v1", entries: [] },
    renderingCompatible: false,
    memoryCompatible: false,
    integrationEnabled: false,
    ...overrides,
  };
}

describe("PIDecisionCadenceShadowService", () => {
  it.each(["daily", "midweek", "weekly"])(
    "evaluates %s through a normalized, repository-free shadow boundary",
    (cadence) => {
      const source = input({ cadence });
      const before = structuredClone(source);
      const result = createPIDecisionCadenceShadow(source);

      expect(source).toEqual(before);
      expect(result).toMatchObject({
        cadence,
        contextStatus: "ready",
        presentationSeamAvailable: false,
        authorityReady: false,
        suppressionReason: "authoritative_integration_not_enabled",
        parity: {
          recommendationUnchanged: true,
          narrativeUnchanged: true,
          handoffUnchanged: true,
          artifactUnchanged: true,
          memoryUnchanged: true,
          scheduleUnchanged: true,
        },
        provenance: {
          repositoryReads: 0,
          runtimeClockReads: 0,
          persistenceWrites: 0,
        },
      });
      expect(result.primaryAssessment).not.toBeNull();
    }
  );

  it("preserves event ownership without granting routine authority", () => {
    const result = createPIDecisionCadenceShadow(input({
      eventAuthority: { state: "goal_completion", sourceId: "event" },
      renderingCompatible: true,
      memoryCompatible: true,
      integrationEnabled: true,
    }));

    expect(result).toMatchObject({
      eventAuthority: "goal_completion_owns_surface",
      authorityReady: false,
      overlap: { state: "event_owned" },
    });
  });

  it("returns a bounded fallback when cadence context cannot be normalized", () => {
    const result = createPIDecisionCadenceShadow(input({
      evidenceWindow: null,
    }));

    expect(result).toMatchObject({
      contextStatus: "blocked",
      contextBlockers: ["decision_cadence_context_blocked"],
      primaryAssessment: null,
      authorityReady: false,
      fallbackStatus: "fallback",
      parity: {
        recommendationUnchanged: true,
        narrativeUnchanged: true,
        handoffUnchanged: true,
        artifactUnchanged: true,
        memoryUnchanged: true,
        scheduleUnchanged: true,
      },
      provenance: {
        repositoryReads: 0,
        runtimeClockReads: 0,
        persistenceWrites: 0,
      },
    });
    expect(result.diagnostics).toHaveLength(1);
  });
});
