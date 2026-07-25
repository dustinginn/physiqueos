import { createDecisionAssessments } from "./PIDecisionIntelligenceService";
import { evaluatePIDecisionSetLifecycle } from "./PIDecisionLifecycleService";

export const PI_DECISION_SHADOW_VERSION = "pi_decision_shadow_v1";

export function createPIDecisionShadow(input = {}) {
  const recommendationBefore = structuredClone(
    input.existingRecommendation ?? null
  );
  const narrativeBefore = structuredClone(input.existingNarrative ?? null);
  const handoffBefore = structuredClone(input.sundayHandoff ?? null);
  const memoryBefore = structuredClone(input.memory ?? null);
  try {
    const result = createDecisionAssessments({
      cadence: input.cadence,
      goalContext: input.goalContext,
      phaseContext: input.phaseContext,
      rankedCandidates: input.rankedCandidates,
      claims: input.claims,
      evidenceCompleteness: input.evidenceCompleteness,
      eventAuthority: input.eventAuthority,
      existingRecommendationMetadata: input.existingRecommendationMetadata,
      evidenceWindow: input.evidenceWindow,
      cadenceEligible: input.cadenceEligible,
      conflicts: input.conflicts,
    });
    const lifecycle = evaluatePIDecisionSetLifecycle(
      result.assessments,
      input.priorDecisionSnapshots ?? [],
      { evaluationDate: input.evaluationDate }
    );
    const primary = lifecycle.currentAssessments.find(
      (item) => item.id === result.primary?.id
    ) ?? null;
    const overlap = decisionOverlap(
      primary,
      result.recommendationCompatibility,
      result.eventAuthority,
      input.existingUncertaintyState
    );
    const blocker = authorityBlocker({
      primary,
      overlap,
      renderingCompatible: input.renderingCompatible === true,
      memoryCompatible: input.memoryCompatible === true,
      integrationEnabled: input.integrationEnabled === true,
    });
    return Object.freeze({
      schemaVersion: PI_DECISION_SHADOW_VERSION,
      cadence: input.cadence,
      primary,
      supporting: lifecycle.currentAssessments.find(
        (item) => item.id === result.supporting?.id
      ) ?? null,
      lifecycle,
      supportingCandidateIds: primary?.supportingCandidateIds ?? [],
      conflicts: primary?.contradictingCandidateIds ?? [],
      eventAuthority: result.eventAuthority,
      recommendationCompatibility: result.recommendationCompatibility,
      overlap,
      wouldAlterRecommendation: false,
      wouldAlterNarrative: false,
      wouldAlterHandoff: false,
      wouldAlterArtifact: false,
      wouldAlterMemory: false,
      renderingSupport: input.renderingCompatible === true,
      memoryCompatible: input.memoryCompatible === true,
      authorityReady: blocker == null,
      blocker,
      recommendationBefore,
      recommendationAfter: structuredClone(recommendationBefore),
      narrativeBefore,
      narrativeAfter: structuredClone(narrativeBefore),
      handoffBefore,
      handoffAfter: structuredClone(handoffBefore),
      memoryBefore,
      memoryAfter: structuredClone(memoryBefore),
      provenance: {
        producer: "pi_decision_shadow_service",
        producerVersion: PI_DECISION_SHADOW_VERSION,
        repositoryReads: 0,
        persistenceWrites: 0,
        runtimeClockReads: 0,
      },
    });
  } catch (error) {
    return Object.freeze({
      schemaVersion: PI_DECISION_SHADOW_VERSION,
      cadence: input.cadence ?? "unknown",
      primary: null,
      supporting: null,
      lifecycle: null,
      supportingCandidateIds: [],
      conflicts: [],
      eventAuthority: "no_event",
      recommendationCompatibility: "unknown",
      overlap: { state: "unsupported", reasons: ["decision_shadow_failure"] },
      wouldAlterRecommendation: false,
      wouldAlterNarrative: false,
      wouldAlterHandoff: false,
      wouldAlterArtifact: false,
      wouldAlterMemory: false,
      renderingSupport: false,
      memoryCompatible: false,
      authorityReady: false,
      blocker: "decision_shadow_failure",
      recommendationBefore,
      recommendationAfter: structuredClone(recommendationBefore),
      narrativeBefore,
      narrativeAfter: structuredClone(narrativeBefore),
      handoffBefore,
      handoffAfter: structuredClone(handoffBefore),
      memoryBefore,
      memoryAfter: structuredClone(memoryBefore),
      diagnostics: [{
        code: "decision_shadow_failure",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }],
      provenance: {
        producer: "pi_decision_shadow_service",
        producerVersion: PI_DECISION_SHADOW_VERSION,
        repositoryReads: 0,
        persistenceWrites: 0,
        runtimeClockReads: 0,
      },
    });
  }
}

function decisionOverlap(primary, compatibility, eventAuthority, uncertainty) {
  if (!primary) return { state: "unsupported", reasons: ["decision_unavailable"] };
  if ([
    "event_owns_decision", "event_suppresses_routine_decision",
    "goal_completion_owns_surface", "goal_transition_owns_surface",
  ].includes(eventAuthority)) {
    return { state: "event_owned", reasons: ["authoritative_event_owns_surface"] };
  }
  if (compatibility === "conflicts") {
    return { state: "conflicts", reasons: ["structured_recommendation_conflict"] };
  }
  if (
    uncertainty === "insufficient" &&
    primary.decisionKind === "insufficient_evidence_for_change"
  ) return { state: "redundant", reasons: ["existing_uncertainty_owns_meaning"] };
  return {
    state: compatibility === "compatible" ? "complementary" : "independent",
    reasons: [],
  };
}
function authorityBlocker({
  primary, overlap, renderingCompatible, memoryCompatible, integrationEnabled,
}) {
  if (!primary) return "decision_unavailable";
  if (!integrationEnabled) return "authoritative_integration_not_enabled";
  if (!renderingCompatible) return "decision_rendering_not_supported";
  if (!memoryCompatible) return "decision_memory_not_compatible";
  if (["event_owned", "conflicts", "redundant", "unsupported"].includes(overlap.state)) {
    return `decision_overlap_${overlap.state}`;
  }
  if (!["supported", "provisional", "conflicted"].includes(primary.status)) {
    return "decision_status_not_authority_ready";
  }
  return null;
}
