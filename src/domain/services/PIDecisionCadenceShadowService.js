import {
  safelyCreatePIDecisionCadenceContext,
} from "./PIDecisionCadenceContextService";
import { createPIDecisionShadow } from "./PIDecisionShadowService";

export const PI_DECISION_CADENCE_SHADOW_VERSION =
  "pi_decision_cadence_shadow_v1";

export function createPIDecisionCadenceShadow(input = {}) {
  const normalized = safelyCreatePIDecisionCadenceContext({
    cadence: input.cadence,
    evidenceWindow: input.evidenceWindow,
    activeGoal: input.activeGoal,
    activePhase: input.activePhase,
    normalizedGoalContext: input.normalizedGoalContext,
    normalizedPhaseContext: input.normalizedPhaseContext,
    eventGoalContext: input.eventGoalContext,
    eventPhaseContext: input.eventPhaseContext,
    rankedCandidates: input.rankedCandidates,
    claims: input.claims,
    lifecycle: input.lifecycle,
    evidenceCompleteness: input.evidenceCompleteness,
    eventAuthority: input.eventAuthority,
    recommendationMetadata: input.recommendationMetadata,
    priorDecisionMemory: input.priorDecisionMemory,
    limitations: input.limitations,
  });
  if (normalized.status !== "ready" || normalized.context.readiness !== "ready") {
    return fallback(input.cadence, "decision_cadence_context_blocked", normalized.diagnostics);
  }
  const context = normalized.context;
  const shadow = createPIDecisionShadow({
    cadence: context.cadence,
    evaluationDate: input.evaluationDate,
    cadenceEligible: input.cadenceEligible,
    goalContext: context.goalContext,
    phaseContext: context.phaseContext,
    rankedCandidates: context.candidateInputs,
    claims: context.claimInputs,
    evidenceCompleteness: context.completenessInputs,
    eventAuthority: context.eventAuthority,
    existingRecommendationMetadata:
      context.recommendationCompatibilityInputs.available
        ? context.recommendationCompatibilityInputs
        : null,
    existingRecommendation: input.existingRecommendation,
    existingNarrative: input.existingNarrative,
    sundayHandoff: input.sundayHandoff,
    memory: input.memory,
    evidenceWindow: context.evidenceWindow,
    priorDecisionSnapshots: input.priorDecisionSnapshots ?? [],
    conflicts: input.conflicts,
    existingUncertaintyState: input.existingUncertaintyState,
    renderingCompatible: input.renderingCompatible,
    memoryCompatible: input.memoryCompatible,
    integrationEnabled: input.integrationEnabled,
  });
  return Object.freeze({
    schemaVersion: PI_DECISION_CADENCE_SHADOW_VERSION,
    cadence: context.cadence,
    contextStatus: "ready",
    contextBlockers: [],
    primaryAssessment: shadow.primary,
    supportingAssessment: shadow.supporting,
    assessmentStatuses: [shadow.primary, shadow.supporting]
      .filter(Boolean).map((item) => item.status),
    confidence: shadow.primary?.confidence?.level ?? "unevaluated",
    lifecycle: shadow.primary?.lifecycle?.state ?? "unavailable",
    eventAuthority: shadow.eventAuthority,
    recommendationCompatibility: shadow.recommendationCompatibility,
    overlap: shadow.overlap,
    presentationSeamAvailable: input.renderingCompatible === true,
    authorityReady: shadow.authorityReady,
    suppressionReason: shadow.blocker,
    fallbackStatus: shadow.blocker === "decision_shadow_failure"
      ? "fallback" : "not_required",
    parity: {
      recommendationUnchanged:
        JSON.stringify(shadow.recommendationBefore) ===
        JSON.stringify(shadow.recommendationAfter),
      narrativeUnchanged:
        JSON.stringify(shadow.narrativeBefore) ===
        JSON.stringify(shadow.narrativeAfter),
      handoffUnchanged:
        JSON.stringify(shadow.handoffBefore) ===
        JSON.stringify(shadow.handoffAfter),
      artifactUnchanged: shadow.wouldAlterArtifact === false,
      memoryUnchanged: shadow.wouldAlterMemory === false,
      scheduleUnchanged: true,
    },
    context,
    shadow,
    provenance: {
      producer: "pi_decision_cadence_shadow_service",
      producerVersion: PI_DECISION_CADENCE_SHADOW_VERSION,
      repositoryReads: 0,
      runtimeClockReads: 0,
      persistenceWrites: 0,
    },
  });
}

function fallback(cadence, reason, diagnostics = []) {
  return Object.freeze({
    schemaVersion: PI_DECISION_CADENCE_SHADOW_VERSION,
    cadence: cadence ?? "unknown",
    contextStatus: "blocked",
    contextBlockers: [reason],
    primaryAssessment: null,
    supportingAssessment: null,
    assessmentStatuses: [],
    confidence: "unevaluated",
    lifecycle: "unavailable",
    eventAuthority: "no_event",
    recommendationCompatibility: "unknown",
    overlap: { state: "unsupported", reasons: [reason] },
    presentationSeamAvailable: false,
    authorityReady: false,
    suppressionReason: reason,
    fallbackStatus: "fallback",
    parity: {
      recommendationUnchanged: true,
      narrativeUnchanged: true,
      handoffUnchanged: true,
      artifactUnchanged: true,
      memoryUnchanged: true,
      scheduleUnchanged: true,
    },
    context: null,
    shadow: null,
    diagnostics,
    provenance: {
      producer: "pi_decision_cadence_shadow_service",
      producerVersion: PI_DECISION_CADENCE_SHADOW_VERSION,
      repositoryReads: 0,
      runtimeClockReads: 0,
      persistenceWrites: 0,
    },
  });
}
