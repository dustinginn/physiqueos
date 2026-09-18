import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import {
  adaptCadenceEvidenceObservationsV3,
} from "../intelligence/ProductionConfidenceNarrativeV3Adapter";
import { applyNarrativeV3ToBriefingArtifact,
  createBriefingGoalConfidenceBlockFromV3 } from
  "./BriefingGoalConfidencePresentationService";
import { resolveIntelligenceEvidenceCutoff } from
  "./IntelligenceLifecycleIdentityService";
import { createStrategicInterpretationPublicationServiceV3 } from
  "./StrategicInterpretationPublicationServiceV3";

export function createPICadenceBriefingLifecycleService({
  publicationService,
  now = () => new Date(),
} = {}) {
  if (!publicationService) throw new Error("Cadence publication service is required.");
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    publicationService, now,
  });
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
      const cutoff = resolveIntelligenceEvidenceCutoff({
        value: artifact.evidenceCutoff ?? artifact.evidenceWindow.cutoff ??
          artifact.evidenceWindow.endDate,
        timeZone: artifact.evidenceWindow.timeZone ?? "America/Los_Angeles",
      });
      const result = await finalizer.finalize({
        publisherType: `${cadence}_briefing`,
        userId: artifact.userId,
        occurrenceId: artifact.id,
        artifactId: artifact.id,
        cadenceOrEventType: cadence,
        goal: activeGoal,
        phase: activePhase,
        store: baseline.store,
        evidenceWindowId: artifact.evidenceWindow.id,
        evidenceWindowClosed: artifact.evidenceWindow.closed !== false,
        buildAdditionalObservations: ({ goalContract }) =>
          adaptCadenceEvidenceObservationsV3({
            goalContract, phase: activePhase, artifact, piEnvelope,
            evidenceCutoff: cutoff,
          }),
        previousCanonicalAssessment: current.assessment,
        evidenceCutoff: cutoff,
        finalizedAt: now().toISOString(),
        idempotencyKey: operation === "regenerate"
          ? `confidence_v3|${cadence}|${artifact.id}|revision|${
            artifact.dependencyManifest?.fingerprint ?? artifact.generatedAt}`
          : `confidence_v3|${cadence}|${artifact.id}`,
        expectedPriorAssessmentId: current.assessment.id,
        expectedPriorArtifactId: current.assessment.briefingArtifactId,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        replacementAuthorized,
        replacesArtifactId: replacementTarget?.id ?? null,
        replacesAssessmentId:
          replacementTarget?.confidencePublication?.assessmentId ?? null,
        sourceLineage: createCadenceSourceLineage({ reason, artifact }),
        evaluationType: "closed_cadence_boundary",
        surface: `${cadence}_briefing`,
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
          const candidate = applyNarrativeV3ToBriefingArtifact({
            artifact, publicationType: cadence,
            narrativePlan: outputs.narrativePlan,
            strategicInterpretation: outputs.strategicInterpretation,
          });
          const block = createBriefingGoalConfidenceBlockFromV3({
            assessment: outputs.confidenceAssessment,
            narrativePlan: outputs.narrativePlan,
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

export function createCadenceSourceLineage({ reason, artifact } = {}) {
  return {
    reason,
    artifactVersion: artifact?.version ?? null,
    evidenceWindowId: artifact?.evidenceWindow?.id ?? null,
    dependencyManifestFingerprint:
      artifact?.dependencyManifest?.fingerprint ?? null,
  };
}

function typed(status, message) {
  return { status, committed: false,
    error: message ? { code: status, message } : null };
}
