import { InterpretationEngine } from "../interpretation/InterpretationEngine";
import { createForecastEngine } from "../forecast/ForecastEngine";
import { adaptForecastAssessmentToPreviousContext } from
  "../forecast/PIV1ForecastCompatibilityAdapter";
import { createNarrativeEngine } from "../narrative/NarrativeEngine";
import {
  ConfidencePublisherRegistry,
} from "./ConfidencePublisherRegistry";
import { projectNumericConfidence } from "./NumericConfidenceProjectionService";
import { createStartingForecastContext } from "./StartingForecastService";
import {
  createCanonicalConfidenceAssessment,
} from "./CanonicalConfidenceAssessmentModel";
import { createPhaseReviewArtifactPackage } from
  "../services/PhaseReviewArtifactService";

export const BRIEFING_FORECAST_FINALIZER_VERSION =
  "briefing_forecast_finalizer_v2";

export function createBriefingForecastFinalizer({
  registry = ConfidencePublisherRegistry,
  interpretationEngine = InterpretationEngine,
  forecastEngine = createForecastEngine({ runtimeMode: "production" }),
  narrativeEngine = createNarrativeEngine({ runtimeMode: "production" }),
  projectionService = projectNumericConfidence,
  publicationService = null,
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    async finalize(request = {}) {
      const normalized = normalizeRequest(request, now);
      const authorization = registry.authorize({
        publisherType: normalized.publisherType,
        userId: normalized.userId,
        goalId: normalized.goalContract.goal.goalId,
        occurrenceId: normalized.occurrenceId,
        artifactId: normalized.artifactId,
        cadenceOrEventType: normalized.cadenceOrEventType,
        idempotencyKey: normalized.idempotencyKey,
        qualifyingPhotoEvent: normalized.qualifyingPhotoEvent,
        hasPriorAssessment: Boolean(normalized.previousCanonicalAssessment),
        evidenceWindowClosed: normalized.evidenceWindow.closed,
      });
      const structuredInterpretation = interpretationEngine.interpret({
        goalContract: normalized.goalContract,
        strategyHypothesis: normalized.strategyContext,
        executionState: normalized.executionContext,
        evidenceDescriptors: normalized.evidenceDescriptors,
        durabilityContext: normalized.durabilityContext,
        evaluationContext: {
          type: normalized.publisherType,
          windowStart: normalized.evidenceWindow.start,
          evidenceCutoff: normalized.publicationCutoff,
          interpretedAt: normalized.finalizedAt,
          priorInterpretationId:
            normalized.previousCanonicalAssessment?.structuredInterpretationId ?? null,
          trajectorySegmentId: normalized.trajectorySegmentId,
          elapsedTimeAdequacy: normalized.elapsedTimeAdequacy,
        },
        compatibility: normalized.compatibility,
      });
      const previousForecastContext = previousContext(
        normalized.previousCanonicalAssessment);
      const forecastAssessment = forecastEngine.forecast({
        goalContract: normalized.goalContract,
        structuredInterpretation,
        previousForecastContext,
      });
      const projection = projectionService({
        forecastAssessment,
        previousCanonicalAssessment: normalized.previousCanonicalAssessment,
        publisherType: normalized.publisherType,
        boundedWindowContext: {
          evidenceWindowId: normalized.evidenceWindow.id,
          cutoff: normalized.publicationCutoff,
        },
        startingForecastContext: normalized.publisherType === "goal_initialization"
          ? createStartingForecastContext(normalized.startingForecastContext)
          : null,
      });
      const narrativeAssessment = narrativeEngine.explain({
        goalContract: normalized.goalContract,
        forecastAssessment,
        numericMovementContext: {
          movement: projection.movement,
          rationale: projection.rationale,
          movementAudit: projection.movementAudit,
        },
      });
      const assessment = createCanonicalConfidenceAssessment({
        goalId: normalized.goalContract.goal.goalId,
        phaseId: normalized.phaseId,
        goalContractId: normalized.goalContract.contractId,
        goalContractVersion: normalized.goalContract.contractVersion,
        publisherType: normalized.publisherType,
        originatingBriefingId: normalized.occurrenceId,
        briefingArtifactId: normalized.artifactId,
        evidenceWindowId: normalized.evidenceWindow.id,
        priorAssessmentId: normalized.previousCanonicalAssessment?.id ?? null,
        projection,
        structuredInterpretation,
        forecastAssessment,
        narrativeAssessment,
        publicationTimestamp: normalized.finalizedAt,
        sourceCutoff: normalized.publicationCutoff,
        expectedPriorArtifactId: normalized.expectedPriorArtifactId,
        replacesArtifactId: normalized.replacesArtifactId,
        replacesAssessmentId: normalized.replacesAssessmentId,
        idempotencyKey: normalized.idempotencyKey,
        sourceLineage: {
          ...normalized.sourceLineage,
          confidenceExplanationDrivers: confidenceExplanationDrivers({
            forecastAssessment,
            narrativeAssessment,
            projection,
          }),
        },
      });
      const phaseReview = normalized.phaseReviewContext
        ? createPhaseReviewArtifactPackage({ context: normalized.phaseReviewContext,
          forecastAssessment, narrativeAssessment, confidenceAssessment: assessment })
        : null;
      const composed = await normalized.composeArtifact({
        structuredInterpretation,
        forecastAssessment,
        narrativeAssessment,
        numericConfidenceProjection: projection,
        confidenceAssessment: assessment,
        phaseReview: phaseReview?.presentation ?? null,
      });
      const artifact = bindArtifact(composed, normalized, assessment, phaseReview,
        Boolean(normalized.phaseReviewContext));
      const diagnostics = boundedDiagnostics({
        structuredInterpretation, forecastAssessment, narrativeAssessment,
        projection, assessment, authorization,
      });
      if (!publicationService) {
        return freeze({
          status: "prepared",
          noOp: false,
          reaffirmation: projection.movement === "no_meaningful_change",
          structuredInterpretation,
          forecastAssessment,
          narrativeAssessment,
          numericConfidenceProjection: projection,
          confidenceAssessment: assessment,
          briefingArtifact: artifact,
          publicationLineage: publicationLineage(assessment),
          commitResult: null,
          diagnostics,
        });
      }
      const commitResult = await publicationService.publish({
        authorization,
        artifact,
        assessment,
        expectedRevision: normalized.expectedRevision,
        expectedSemanticDigest: normalized.expectedSemanticDigest,
        expectedPriorAssessmentId: normalized.expectedPriorAssessmentId,
        expectedPriorArtifactId: normalized.expectedPriorArtifactId,
        replacementAuthorized: normalized.replacementAuthorized,
        replacementSemantics: normalized.replacementSemantics,
      });
      return freeze({
        status: commitResult.status,
        noOp: commitResult.status === "matched",
        reaffirmation: projection.movement === "no_meaningful_change",
        structuredInterpretation,
        forecastAssessment,
        narrativeAssessment,
        numericConfidenceProjection: projection,
        confidenceAssessment: assessment,
        briefingArtifact: commitResult.artifact ?? artifact,
        publicationLineage: publicationLineage(assessment),
        commitResult,
        diagnostics,
      });
    },
  });
}

function normalizeRequest(request, now) {
  const goalContract = structuredClone(request.goalContract ?? {});
  if (!goalContract.contractVersion || !goalContract.goal?.goalId ||
      !Array.isArray(goalContract.objectives) ||
      !Array.isArray(goalContract.guardrails) ||
      !Array.isArray(goalContract.relevantEvidence?.entries)) {
    throw new Error("Finalization requires a complete canonical Goal Contract.");
  }
  if (typeof request.composeArtifact !== "function") {
    throw new Error("Finalization requires an artifact composition callback.");
  }
  const publicationCutoff = iso(request.publicationCutoff);
  if (request.evidenceWindow?.cutoff != null &&
      iso(request.evidenceWindow.cutoff) !== publicationCutoff) {
    throw new Error("Evidence-window cutoff must equal the publication cutoff.");
  }
  const finalizedAt = iso(request.finalizedAt ?? now().toISOString());
  return {
    publisherType: text(request.publisherType, "publisherType"),
    userId: text(request.userId, "userId"),
    occurrenceId: text(request.occurrenceId, "occurrenceId"),
    artifactId: text(request.artifactId, "artifactId"),
    cadenceOrEventType: text(request.cadenceOrEventType, "cadenceOrEventType"),
    goalContract,
    phaseId: request.phaseId ?? goalContract.timeline?.currentPhase?.phaseId ?? null,
    evidenceWindow: {
      id: text(request.evidenceWindow?.id, "evidenceWindow.id"),
      start: request.evidenceWindow?.start ?? null,
      cutoff: publicationCutoff,
      closed: request.evidenceWindow?.closed === true,
    },
    strategyContext: structuredClone(request.strategyContext ??
      goalContract.strategyHypothesis ?? {}),
    executionContext: structuredClone(request.executionContext ?? {}),
    evidenceDescriptors: structuredClone(request.evidenceDescriptors ?? []),
    durabilityContext: structuredClone(request.durabilityContext ?? {}),
    previousCanonicalAssessment:
      request.previousCanonicalAssessment
        ? structuredClone(request.previousCanonicalAssessment) : null,
    composeArtifact: request.composeArtifact,
    publicationCutoff,
    finalizedAt,
    idempotencyKey: text(request.idempotencyKey, "idempotencyKey"),
    expectedPriorAssessmentId: request.expectedPriorAssessmentId ?? null,
    expectedPriorArtifactId: request.expectedPriorArtifactId ?? null,
    replacesArtifactId: request.replacesArtifactId ?? null,
    replacesAssessmentId: request.replacesAssessmentId ?? null,
    replacementAuthorized: request.replacementAuthorized === true,
    replacementSemantics: request.replacementSemantics ?? null,
    qualifyingPhotoEvent: request.qualifyingPhotoEvent === true,
    startingForecastContext: structuredClone(request.startingForecastContext ?? {}),
    sourceLineage: structuredClone(request.sourceLineage ?? {}),
    trajectorySegmentId: request.trajectorySegmentId ?? null,
    elapsedTimeAdequacy: request.elapsedTimeAdequacy ?? "unknown",
    compatibility: structuredClone(request.compatibility ?? { missingMetadata: [] }),
    phaseReviewContext: request.phaseReviewContext
      ? structuredClone(request.phaseReviewContext) : null,
    expectedRevision: request.expectedRevision,
    expectedSemanticDigest: request.expectedSemanticDigest,
  };
}

function previousContext(value) {
  if (!value) return null;
  if (value.forecastAssessment) {
    return adaptForecastAssessmentToPreviousContext(value.forecastAssessment);
  }
  return {
    contextVersion: "previous_forecast_context_v2_published_v1",
    sourceType: value.schemaVersion === "canonical_confidence_assessment_v2"
      ? "canonical_confidence_assessment_v2" : "v1_compatibility",
    priorForecastRef: value.forecastAssessmentId ?? value.id ?? null,
    goalId: value.goalId ?? null,
    strategyRevision: value.strategyRevision ?? null,
    assessedAt: value.publicationTimestamp ?? value.provenance?.generatedAt ?? null,
    goalForecastStatus: value.forecastStatus ?? "unknown",
    confidenceBand: value.confidenceBand ?? "unknown",
    forecastDirection: value.forecastDirection ?? "indeterminate",
    movementDirection: value.movement ?? "no_meaningful_change",
    interpretationSemanticFingerprint: value.semanticContinuityFingerprint ?? null,
    compatibility: value.schemaVersion === "canonical_confidence_assessment_v2"
      ? { adapterVersion: null, missingSemantics: [], inferredSemantics: [],
        ignoredLegacyFields: [] }
      : { adapterVersion: "v1_published_context_adapter_v1",
        missingSemantics: ["v2_goal_forecast_status", "v2_confidence_band"],
        inferredSemantics: [], ignoredLegacyFields: ["score"] },
  };
}

function bindArtifact(composed, request, assessment, phaseReview = null,
  phaseReviewEvaluated = false) {
  const artifact = structuredClone(composed?.artifact ?? composed);
  if (!artifact || typeof artifact !== "object" || artifact.id !== request.artifactId) {
    throw new Error("Composed artifact identity is invalid.");
  }
  artifact.confidencePublication = {
    schemaVersion: "briefing_confidence_binding_v2",
    assessmentId: assessment.id,
    publisherType: request.publisherType,
    originatingBriefingId: request.occurrenceId,
    publicationCutoff: request.publicationCutoff,
  };
  if (phaseReview?.presentation) {
    artifact.briefing ??= {};
    artifact.briefing.phaseReview = structuredClone(phaseReview.presentation);
    artifact.phaseReviewEligibilityBinding = structuredClone(phaseReview.binding);
    if (phaseReview.authorization) {
      artifact.phaseReviewAuthorization = structuredClone(phaseReview.authorization);
    }
  } else if (phaseReviewEvaluated) {
    if (artifact.briefing) delete artifact.briefing.phaseReview;
    delete artifact.phaseReviewAuthorization;
    delete artifact.phaseReviewEligibilityBinding;
  }
  return artifact;
}
function publicationLineage(assessment) {
  return {
    assessmentId: assessment.id,
    priorAssessmentId: assessment.priorAssessmentId,
    artifactId: assessment.briefingArtifactId,
    expectedPriorArtifactId: assessment.replacementLineage.expectedPriorArtifactId,
    sourceCutoff: assessment.sourceCutoff,
  };
}
function boundedDiagnostics(value) {
  return freeze({
    schemaVersion: BRIEFING_FORECAST_FINALIZER_VERSION,
    interpretationId: value.structuredInterpretation.id,
    forecastId: value.forecastAssessment.id,
    narrativeId: value.narrativeAssessment.id,
    projectionId: value.projection.id,
    assessmentId: value.assessment.id,
    publisherType: value.authorization.publisherType,
    movement: value.projection.movement,
    percentage: value.projection.currentPercentage,
  });
}
function confidenceExplanationDrivers({
  forecastAssessment,
  narrativeAssessment,
  projection,
}) {
  return {
    schemaVersion: "confidence_explanation_drivers_v1",
    strengthenedBy: (narrativeAssessment?.primarySupportingFactors ?? [])
      .map(driver).filter(Boolean),
    limitedBy: (narrativeAssessment?.primaryLimitingFactors ?? [])
      .map(driver).filter(Boolean),
    materiallyChanged: {
      movement: projection?.movement ?? null,
      magnitude: projection?.movementMagnitude ?? null,
      rationale: projection?.rationale ?? null,
    },
    needsNext: forecastAssessment?.nextDecisiveEvidence
      ? [{
          key: forecastAssessment.nextDecisiveEvidence.evidenceCapability ??
            forecastAssessment.nextDecisiveEvidence.status ?? null,
          text: narrativeAssessment?.nextDecisiveEvidenceExplanation?.text ?? null,
          decisionBoundary:
            forecastAssessment.nextDecisiveEvidence.decisionBoundary ?? null,
        }]
      : [],
  };
}
function driver(item) {
  if (!item || typeof item !== "object") return null;
  return {
    key: item.key ?? item.code ?? item.id ?? item.factorRef ?? null,
    text: item.text ?? item.description ?? null,
    sourceRefs: [...new Set((item.sourceRefs ?? item.evidenceRefs ?? [])
      .filter(Boolean).map(String))].sort(),
  };
}
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}
function iso(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Finalization timestamp is invalid.");
  return new Date(parsed).toISOString();
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

export const BriefingForecastFinalizer = createBriefingForecastFinalizer();
