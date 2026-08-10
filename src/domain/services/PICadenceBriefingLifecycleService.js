import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import {
  adaptBriefingArtifactToExecutionContext,
  adaptBriefingArtifactToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
} from "../confidence/ProductionConfidenceContextAdapter";
import { createCadenceEvidenceDurabilityContext } from
  "../confidence/CadenceEvidenceDurabilityContextService";
import { createBriefingGoalConfidenceBlockFromV2 } from
  "./BriefingGoalConfidencePresentationService";

export function createPICadenceBriefingLifecycleService({
  publicationService,
  now = () => new Date(),
} = {}) {
  if (!publicationService) throw new Error("Cadence publication service is required.");
  const finalizer = createBriefingForecastFinalizer({ publicationService, now });
  return Object.freeze({
    async publish({ cadence, operation, artifact, activeGoal, activePhase,
      operatingState, piEnvelope = null, reason,
      replacementAuthorized = false } = {}) {
      if (!activeGoal?.id || !activePhase?.id || !artifact?.evidenceWindow?.id) {
        return typed("unsupported_context",
          "Cadence Confidence requires an active Goal, phase, and evidence window.");
      }
      const baseline = publicationService.captureBaseline();
      const replacementTarget = operation === "regenerate"
        ? baseline.store.dailyBriefings?.find((item) => item.id === artifact.id) ?? null
        : null;
      const current = createCanonicalConfidenceReadService({ store: baseline.store })
        .getCurrent({ goalId: activeGoal.id, phaseId: activePhase.id });
      if (!current.assessment) return typed("canonical_predecessor_required",
        "Cadence Confidence requires a canonical predecessor.");
      const goalContract = adaptProductionGoalToCanonicalContract(activeGoal, {
        activePhase,
      });
      const cutoff = artifact.evidenceCutoff ??
        `${artifact.evidenceWindow.endDate}T23:59:59.999Z`;
      const evidenceDescriptors = adaptBriefingArtifactToEvidenceDescriptors({
        artifact, piEnvelope,
      });
      const durabilityContext = createCadenceEvidenceDurabilityContext({
        store: baseline.store,
        artifact,
        cadence,
        goalContract,
        previousCanonicalAssessment: current.assessment,
      });
      const result = await finalizer.finalize({
        publisherType: `${cadence}_briefing`,
        userId: artifact.userId,
        occurrenceId: artifact.id,
        artifactId: artifact.id,
        cadenceOrEventType: cadence,
        goalContract,
        phaseId: activePhase.id,
        evidenceWindow: { id: artifact.evidenceWindow.id,
          start: artifact.evidenceWindow.startDate ?? null,
          cutoff, closed: artifact.evidenceWindow.closed !== false },
        strategyContext: goalContract.strategyHypothesis,
        executionContext: adaptBriefingArtifactToExecutionContext({
          artifact, piEnvelope, cadence, operatingState,
        }),
        evidenceDescriptors,
        durabilityContext,
        previousCanonicalAssessment: current.assessment,
        publicationCutoff: cutoff,
        finalizedAt: now().toISOString(),
        idempotencyKey: operation === "regenerate"
          ? `confidence_v2|${cadence}|${artifact.id}|revision|${
            artifact.dependencyManifest?.fingerprint ?? artifact.generatedAt}`
          : `confidence_v2|${cadence}|${artifact.id}`,
        expectedPriorAssessmentId: current.assessment.id,
        expectedPriorArtifactId: current.assessment.briefingArtifactId,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        replacementAuthorized,
        replacesArtifactId: replacementTarget?.id ?? null,
        replacesAssessmentId:
          replacementTarget?.confidencePublication?.assessmentId ?? null,
        sourceLineage: { reason, artifactVersion: artifact.version,
          evidenceWindowId: artifact.evidenceWindow.id,
          dependencyManifestFingerprint:
            artifact.dependencyManifest?.fingerprint ?? null },
        elapsedTimeAdequacy: cadence === "midweek" ? "partial" : "adequate",
        phaseReviewContext: {
          activeGoal, activePhase,
          reviewMilestone: activePhase.reviewMilestone ?? null,
          currentArtifact: { id: artifact.id, evidenceTypes: [cadence],
            evidenceIdentities: [artifact.evidenceWindow.id] },
          artifactType: cadence, eventIdentity: artifact.id,
          evidenceIdentity: artifact.evidenceWindow.id,
          artifactTimestamp: cutoff, publicationTimestamp: now().toISOString(),
          currentDate: cutoff, reviewState: activePhase.reviewState,
          decisionHistory: baseline.store.phaseReviewDecisions ?? [],
          expectedStoreRevision: baseline.revision,
        },
        composeArtifact: (outputs) => {
          const candidate = structuredClone(artifact);
          const block = createBriefingGoalConfidenceBlockFromV2({
            assessment: outputs.confidenceAssessment,
            projection: outputs.numericConfidenceProjection,
            narrativeAssessment: outputs.narrativeAssessment,
            capturedAt: now().toISOString(),
          });
          if (cadence === "midweek") candidate.briefing.goalConfidence = block;
          else candidate.briefing.weeklyNarrative.goalConfidence = block;
          return { artifact: candidate };
        },
      });
      return result.commitResult ?? typed(result.status, "Cadence finalization did not commit.");
    },
  });
}

function typed(status, message) {
  return { status, committed: false,
    error: message ? { code: status, message } : null };
}
