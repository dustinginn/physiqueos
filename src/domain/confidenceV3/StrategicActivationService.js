import { createHash } from "node:crypto";
import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import { buildProductionConfidenceNarrativeV3Input } from
  "../intelligence/ProductionConfidenceNarrativeV3Adapter";
import { createStrategicInterpretationPublicationServiceV3 } from
  "../services/StrategicInterpretationPublicationServiceV3";

export const STRATEGIC_ACTIVATION_VERSION = "strategic_activation_v2";

export function createStrategicActivationService({ publicationService,
  buildInterpretationInput = buildProductionConfidenceNarrativeV3Input,
  now = () => new Date() } = {}) {
  if (typeof publicationService?.publish !== "function") {
    throw new Error("StrategicActivationService requires a publicationService with publish().");
  }
  const shared = createStrategicInterpretationPublicationServiceV3({
    publicationService, buildInput: buildInterpretationInput, now,
  });

  async function execute({ goal, phase, store,
    evidenceCutoff = now().toISOString() } = {}, publish) {
    if (!goal?.id) throw new Error("Activation requires a resolved active Goal.");
    if (!phase?.id) throw new Error("Activation requires a resolved active Phase.");
    const cutoff = new Date(evidenceCutoff).toISOString();
    const identity = activationIdentity(goal.id, phase.id, cutoff);
    const existing = (store?.goalConfidenceHistory ?? []).find((item) =>
      item.assessment?.idempotencyKey === identity.idempotencyKey);
    if (existing && publish) {
      return Object.freeze({ status: "matched", committed: false,
        assessmentId: existing.assessmentId,
        currentPercentage: existing.assessment?.currentPercentage ?? null,
        previousPercentage: existing.assessment?.priorPercentage ?? null,
        movement: existing.assessment?.movement ?? null });
    }
    const current = createCanonicalConfidenceReadService({ store }).getCurrent({
      goalId: goal.id, phaseId: phase.id,
    });
    if (!current.assessment) {
      return Object.freeze({ status: "refused_no_prior_assessment",
        committed: false,
        reason: current.reason ?? "canonical_series_unavailable" });
    }
    const request = {
      publisherType: "v3_strategic_activation",
      userId: goal.userId ?? store?.user?.id ?? "founder",
      occurrenceId: identity.occurrenceId,
      artifactId: identity.artifactId,
      evidenceWindowId: identity.evidenceWindowId,
      idempotencyKey: identity.idempotencyKey,
      goal, phase, store,
      previousCanonicalAssessment: current.assessment,
      evidenceCutoff: cutoff,
      finalizedAt: now().toISOString(),
      evaluationType: "v3_activation_baseline",
      surface: "current",
      sourceLineage: { reason: "confidence_v3_activation" },
      composeArtifact: ({ confidenceAssessment, confidenceProjection,
        narrativePlan }) => ({
        id: identity.artifactId,
        schemaVersion: STRATEGIC_ACTIVATION_VERSION,
        goalId: goal.id, phaseId: phase.id, evidenceCutoff: cutoff,
        currentPercentage: confidenceProjection.currentPercentage,
        confidenceBand: confidenceProjection.confidenceBand,
        narrativeSummary: narrativePlan.composition.headline,
        narrativeDetail: narrativePlan.composition.finalNarrative,
        confidencePublication: { assessmentId: confidenceAssessment.id },
      }),
    };
    const result = publish ? await shared.finalize(request) : await shared.preview(request);
    return Object.freeze({
      status: publish ? result.commitResult.status : "preview",
      committed: publish ? result.commitResult.committed : false,
      assessmentId: result.assessment.id,
      currentPercentage: result.confidence.currentPercentage,
      previousPercentage: result.confidence.priorPercentage,
      movement: result.confidence.movement,
      artifact: publish ? result.commitResult.artifact : result.artifact,
      interpretation: result.strategicInterpretation,
      coachingState: result.coachingState,
      projection: result.confidence,
      narrative: result.narrativePlan,
      eligibility: result.evidenceEligibility,
      goalContract: result.goalContract,
      assessment: result.assessment,
      commitResult: publish ? result.commitResult : null,
    });
  }

  return Object.freeze({
    activate: (request) => execute(request, true),
    preview: (request) => execute(request, false),
  });
}

function activationIdentity(goalId, phaseId, cutoff) {
  return {
    occurrenceId: deterministicId("v3_activation", goalId, phaseId, cutoff),
    artifactId: deterministicId("v3_activation_artifact", goalId, phaseId, cutoff),
    evidenceWindowId: deterministicId("v3_activation_window", goalId, phaseId, cutoff),
    idempotencyKey: deterministicId("v3_activation", goalId, phaseId, cutoff),
  };
}

function deterministicId(kind, goalId, phaseId, cutoff) {
  const digest = createHash("sha256")
    .update(`${kind}|${goalId}|${phaseId}|${cutoff}`)
    .digest("hex").slice(0, 24);
  return `${kind}|${digest}`;
}
