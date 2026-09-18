import { ConfidencePublisherRegistry } from "../confidence/ConfidencePublisherRegistry";
import { createCanonicalConfidenceAssessmentV3 } from
  "../confidence/CanonicalConfidenceAssessmentModel";
import { buildProductionConfidenceNarrativeV3Input } from
  "../intelligence/ProductionConfidenceNarrativeV3Adapter";
import { runConfidenceNarrativeV3 } from
  "../intelligence/v3/ConfidenceNarrativeV3Pipeline";
import { createPhaseReviewArtifactPackage } from
  "./PhaseReviewArtifactService";

export const STRATEGIC_INTERPRETATION_PUBLICATION_V3_VERSION =
  "strategic_interpretation_publication_v3";

export function createStrategicInterpretationPublicationServiceV3({
  publicationService = null,
  registry = ConfidencePublisherRegistry,
  buildInput = buildProductionConfidenceNarrativeV3Input,
  now = () => new Date(),
} = {}) {
  async function prepare(request = {}) {
    const normalized = normalize(request, now);
    const production = await buildInput({
      goal: normalized.goal,
      phase: normalized.phase,
      store: normalized.store,
      evidenceCutoff: normalized.evidenceCutoff,
    });
    const additional = typeof normalized.buildAdditionalObservations === "function"
      ? await normalized.buildAdditionalObservations({
        goalContract: production.goalContract,
        evidenceCutoff: normalized.evidenceCutoff,
      }) : normalized.additionalObservations;
    const observations = mergeObservations(production.observations, additional);
    const prior = priorV3Context(normalized.previousCanonicalAssessment);
    const outputs = runConfidenceNarrativeV3({
      goalContract: production.goalContract,
      observations,
      priorInterpretation: prior.interpretation,
      priorCoachingState: prior.coachingState,
      priorConfidence: prior.confidence,
      priorNarrativePlan: prior.narrativePlan,
      evaluationContext: {
        type: normalized.evaluationType,
        evidenceCutoff: normalized.evidenceCutoff,
        evaluatedAt: normalized.finalizedAt,
        materialSemanticChange: normalized.materialSemanticChange,
      },
      surface: normalized.surface,
    });
    const assessment = createCanonicalConfidenceAssessmentV3({
      goalId: normalized.goal.id,
      phaseId: normalized.phase.id,
      goalContractId: production.goalContract.id,
      goalContractVersion: production.goalContract.contractVersion,
      goalContractFingerprint: production.goalContract.semanticFingerprint,
      publisherType: normalized.publisherType,
      originatingBriefingId: normalized.occurrenceId,
      briefingArtifactId: normalized.artifactId,
      evidenceWindowId: normalized.evidenceWindowId,
      priorAssessmentId: normalized.previousCanonicalAssessment?.id ?? null,
      interpretation: outputs.strategicInterpretation,
      coachingState: outputs.coachingState,
      projection: outputs.confidence,
      narrative: outputs.narrativePlan,
      eligibility: outputs.evidenceEligibility,
      publicationTimestamp: normalized.finalizedAt,
      sourceCutoff: normalized.evidenceCutoff,
      expectedPriorArtifactId: normalized.expectedPriorArtifactId,
      replacesArtifactId: normalized.replacesArtifactId,
      replacesAssessmentId: normalized.replacesAssessmentId,
      idempotencyKey: normalized.idempotencyKey,
      sourceLineage: {
        ...normalized.sourceLineage,
        strategicPublicationVersion:
          STRATEGIC_INTERPRETATION_PUBLICATION_V3_VERSION,
      },
    });
    const phaseReview = normalized.phaseReviewContext
      ? createPhaseReviewArtifactPackage({
        context: normalized.phaseReviewContext,
        forecastAssessment: phaseReviewForecast(outputs),
        narrativeAssessment: phaseReviewNarrative(outputs),
        confidenceAssessment: assessment,
      }) : null;
    const composed = normalized.composeArtifact({
      confidenceAssessment: assessment,
      strategicInterpretation: outputs.strategicInterpretation,
      coachingState: outputs.coachingState,
      confidenceProjection: outputs.confidence,
      narrativePlan: outputs.narrativePlan,
      evidenceEligibility: outputs.evidenceEligibility,
      goalContract: production.goalContract,
      phaseReview: phaseReview?.presentation ?? null,
    });
    const artifact = withPublicationBinding(
      composed?.artifact ?? composed,
      assessment,
      normalized,
      phaseReview,
    );
    const authorization = registry.authorize({
      publisherType: normalized.publisherType,
      userId: normalized.userId,
      goalId: normalized.goal.id,
      occurrenceId: normalized.occurrenceId,
      artifactId: normalized.artifactId,
      cadenceOrEventType: normalized.cadenceOrEventType,
      idempotencyKey: normalized.idempotencyKey,
      qualifyingPhotoEvent: normalized.qualifyingPhotoEvent,
      hasPriorAssessment: Boolean(normalized.previousCanonicalAssessment),
      evidenceWindowClosed: normalized.evidenceWindowClosed,
    });
    return Object.freeze({ normalized, authorization, assessment, artifact,
      goalContract: production.goalContract, observations, ...outputs });
  }

  return Object.freeze({
    prepare,
    preview: prepare,
    async finalize(request = {}) {
      if (typeof publicationService?.publish !== "function") {
        throw new Error("V3 publication requires a canonical publication service.");
      }
      const prepared = await prepare(request);
      const result = await publicationService.publish({
        authorization: prepared.authorization,
        artifact: prepared.artifact,
        assessment: prepared.assessment,
        expectedPriorAssessmentId:
          prepared.normalized.expectedPriorAssessmentId,
        expectedRevision: prepared.normalized.expectedRevision,
        expectedSemanticDigest: prepared.normalized.expectedSemanticDigest,
        replacementAuthorized: prepared.normalized.replacementAuthorized,
        replacementSemantics: prepared.normalized.replacementSemantics,
      });
      return Object.freeze({ ...prepared, commitResult: result,
        status: result.status, committed: result.committed });
    },
  });
}

function normalize(request, now) {
  if (!request.goal?.id || !request.phase?.id) {
    throw new Error("V3 publication requires a resolved Goal and Phase.");
  }
  for (const field of ["publisherType", "userId", "occurrenceId", "artifactId",
    "evidenceWindowId", "idempotencyKey"]) {
    if (typeof request[field] !== "string" || !request[field].trim()) {
      throw new Error(`${field} is required.`);
    }
  }
  if (typeof request.composeArtifact !== "function") {
    throw new Error("composeArtifact is required.");
  }
  const evidenceCutoff = iso(request.evidenceCutoff, "evidenceCutoff");
  const finalizedAt = iso(request.finalizedAt ?? now().toISOString(), "finalizedAt");
  return {
    ...request,
    store: request.store ?? {},
    evidenceCutoff,
    finalizedAt,
    additionalObservations: request.additionalObservations ?? [],
    evaluationType: request.evaluationType ??
      (request.cadenceOrEventType === "dexa" ||
       request.cadenceOrEventType === "photo"
        ? "event_evidence_boundary" : "recurring_briefing"),
    surface: request.surface ?? request.cadenceOrEventType ?? "current",
    materialSemanticChange: request.materialSemanticChange === true,
    qualifyingPhotoEvent: request.qualifyingPhotoEvent === true,
    evidenceWindowClosed: request.evidenceWindowClosed !== false,
    expectedPriorAssessmentId: request.expectedPriorAssessmentId ??
      request.previousCanonicalAssessment?.id ?? null,
    expectedPriorArtifactId: request.expectedPriorArtifactId ??
      request.previousCanonicalAssessment?.briefingArtifactId ?? null,
    replacementAuthorized: request.replacementAuthorized === true,
  };
}

function priorV3Context(assessment) {
  if (assessment?.schemaVersion === "canonical_confidence_assessment_v3") {
    return {
      interpretation: assessment.strategicInterpretation ?? null,
      coachingState: assessment.coachingState ?? null,
      confidence: assessment.confidenceProjection ?? {
        id: assessment.id,
        currentPercentage: assessment.currentPercentage,
        percentage: assessment.currentPercentage,
        evidenceCutoff: assessment.sourceCutoff,
      },
      narrativePlan: assessment.narrativePlan ?? null,
    };
  }
  return {
    interpretation: null,
    coachingState: null,
    confidence: assessment ? {
      id: assessment.id,
      currentPercentage: assessment.currentPercentage,
      percentage: assessment.currentPercentage,
      evidenceCutoff: assessment.sourceCutoff,
    } : null,
    narrativePlan: null,
  };
}

function mergeObservations(base = [], additional = []) {
  const byId = new Map();
  for (const item of [...base, ...additional]) {
    if (!item?.observationId) throw new Error("Additional V3 evidence must be canonical observations.");
    byId.set(item.observationId, item);
  }
  return [...byId.values()].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) ||
    left.observationId.localeCompare(right.observationId));
}

function withPublicationBinding(artifact, assessment, request, phaseReview) {
  if (!artifact || artifact.id !== request.artifactId) {
    throw new Error("Composed artifact identity changed during V3 finalization.");
  }
  const candidate = structuredClone(artifact);
  candidate.confidencePublication = {
    schemaVersion: "briefing_confidence_binding_v3",
    assessmentId: assessment.id,
    publisherType: assessment.publisherType,
    originatingBriefingId: request.occurrenceId,
    publicationCutoff: request.evidenceCutoff,
    intelligenceRunId: request.idempotencyKey,
  };
  if (phaseReview?.presentation) {
    candidate.briefing ??= {};
    candidate.briefing.phaseReview = structuredClone(phaseReview.presentation);
    candidate.phaseReviewEligibilityBinding = structuredClone(phaseReview.binding);
    if (phaseReview.authorization) {
      candidate.phaseReviewAuthorization = structuredClone(phaseReview.authorization);
    }
  } else if (request.phaseReviewContext) {
    if (candidate.briefing) delete candidate.briefing.phaseReview;
    delete candidate.phaseReviewEligibilityBinding;
    delete candidate.phaseReviewAuthorization;
  }
  return Object.freeze(candidate);
}

function phaseReviewForecast(outputs) {
  const interpretation = outputs.strategicInterpretation;
  const goalForecastStatus = ["achieved", "exceeded"].includes(
    interpretation.goalAchievement) ? "goal_achieved" :
    ["challenged", "refuted"].includes(
      interpretation.strategyEffectiveness.feasibility) ? "at_risk" :
      "on_forecast";
  return {
    id: outputs.confidence.id,
    structuredInterpretationId: interpretation.id,
    goalForecastStatus,
  };
}

function phaseReviewNarrative(outputs) {
  const action = outputs.strategicInterpretation.recommendation.action;
  return {
    id: outputs.narrativePlan.id,
    recommendedCoachingDirection: {
      state: action === "continue_current_strategy" ? "stay_the_course" :
        action === "review_strategy" ? "strategy_review_recommended" : action,
    },
    phaseReadinessConclusion: ["transition_phase", "transition_goal"].includes(action)
      ? "sufficiently_resolved_to_proceed" : "unresolved",
  };
}

function iso(value, field) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} is invalid.`);
  return new Date(value).toISOString();
}
