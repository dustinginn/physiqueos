import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import {
  isQualifyingPhotoEventInterpretation,
} from "../confidence/ProductionConfidenceContextAdapter";
import { adaptCanonicalPhotoObservations } from
  "../intelligence/ProductionConfidenceNarrativeV3Adapter";
import { applyNarrativeV3ToBriefingArtifact,
  createMonthlyBriefingGoalConfidenceBlockFromAssessment,
  createBriefingGoalConfidenceBlockFromV3 } from
  "./BriefingGoalConfidencePresentationService";
import { ConfidencePublisherRegistry } from
  "../confidence/ConfidencePublisherRegistry";
import { resolveIntelligenceEvidenceCutoff } from
  "./IntelligenceLifecycleIdentityService";
import { createStrategicInterpretationPublicationServiceV3 } from
  "./StrategicInterpretationPublicationServiceV3";

export function createPIPhotoEventLifecycleService({ publicationService,
  now = () => new Date() } = {}) {
  if (!publicationService) throw new Error("Photo Event publication service is required.");
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    publicationService, now,
  });
  return Object.freeze({
    async publish({ operation = "create", confidenceMode = "publish-successor",
      artifact, session, context, reason,
      replacementAuthorized = false } = {}) {
      const goal = context?.activeGoal;
      const phase = context?.activePhase;
      const narrative = artifact?.briefing?.photoEventNarrative;
      const meaningful = isQualifyingPhotoEventInterpretation({
        narrative, goalId: goal?.id,
      });
      if (!goal?.id || !phase?.id || !session?.id || !meaningful) {
        return typed("photo_event_not_qualifying",
          "Photo publication requires meaningful Goal-relevant visual interpretation.");
      }
      const baseline = publicationService.captureBaseline();
      const replacementTarget = operation === "regenerate"
        ? baseline.store.dailyBriefings?.find((item) => item.id === artifact.id) ?? null
        : null;
      const current = createCanonicalConfidenceReadService({ store: baseline.store })
        .getCurrent({ goalId: goal.id, phaseId: phase.id });
      if (!current.assessment) return typed("canonical_predecessor_required",
        "Photo Confidence requires a canonical predecessor.");
      const cutoff = resolveIntelligenceEvidenceCutoff({
        value: session.capturedAt ?? session.captureDate ?? session.date,
        timeZone: context?.timeZone ?? artifact?.timeZone ??
          "America/Los_Angeles",
      });
      if (confidenceMode === "matched-only" ||
          Date.parse(cutoff) < Date.parse(current.assessment.sourceCutoff)) {
        const historical = historicalAssessmentAtOrBefore({
          store: baseline.store, goalId: goal.id, phaseId: phase.id, cutoff,
        });
        if (!historical) return typed("historical_confidence_unavailable",
          "Historical Photo publication requires canonical Confidence at its cutoff.");
        const carriedArtifact = bindHistoricalConfidence({
          artifact, assessment: historical.assessment, cutoff, now,
        });
        const authorization = ConfidencePublisherRegistry.authorize({
          publisherType: "photo_event_briefing", userId: artifact.userId,
          goalId: goal.id, occurrenceId: artifact.id, artifactId: artifact.id,
          cadenceOrEventType: "photo",
          idempotencyKey: `confidence_v2|photo|${artifact.id}|matched|${historical.assessment.id}`,
          qualifyingPhotoEvent: true, hasPriorAssessment: true,
          evidenceWindowClosed: true,
        });
        return publicationService.publish({ confidenceMode: "matched-only",
          authorization, artifact: carriedArtifact,
          matchedAssessmentId: historical.assessment.id });
      }
      const result = await finalizer.finalize({
        publisherType: "photo_event_briefing", userId: artifact.userId,
        occurrenceId: artifact.id, artifactId: artifact.id,
        cadenceOrEventType: "photo", goal, phase, store: baseline.store,
        evidenceWindowId: `photo_event|${session.id}`,
        evidenceWindowClosed: true,
        buildAdditionalObservations: ({ goalContract }) =>
          adaptCanonicalPhotoObservations({ goalContract, phase,
            store: { photoAnalyses: [{ ...session, interpretation: narrative }] },
            cutoff }),
        previousCanonicalAssessment: current.assessment,
        evidenceCutoff: cutoff, finalizedAt: now().toISOString(),
        idempotencyKey: `confidence_v3|photo|${artifact.id}`,
        expectedPriorAssessmentId: current.assessment.id,
        expectedPriorArtifactId: current.assessment.briefingArtifactId,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        replacementAuthorized,
        replacesArtifactId: replacementTarget?.id ?? null,
        replacesAssessmentId:
          replacementTarget?.confidencePublication?.assessmentId ?? null,
        qualifyingPhotoEvent: true,
        sourceLineage: { reason, canonicalPhotoSessionId: session.id },
        evaluationType: "event_evidence_boundary",
        surface: "photo_event_briefing",
        phaseReviewContext: {
          activeGoal: goal, activePhase: phase,
          reviewMilestone: phase.reviewMilestone ?? null,
          currentArtifact: { id: artifact.id, evidenceTypes: ["photo_event"],
            evidenceIdentities: [session.id] },
          currentEvidence: session,
          artifactType: "photo_event", eventIdentity: artifact.id,
          evidenceIdentity: session.id, artifactTimestamp: cutoff,
          publicationTimestamp: now().toISOString(), currentDate: cutoff,
          reviewState: phase.reviewState,
          decisionHistory: baseline.store.phaseReviewDecisions ?? [],
          expectedStoreRevision: baseline.revision,
        },
        composeArtifact: (outputs) => {
          const candidate = applyNarrativeV3ToBriefingArtifact({
            artifact, publicationType: "photo",
            narrativePlan: outputs.narrativePlan,
            strategicInterpretation: outputs.strategicInterpretation,
          });
          candidate.briefing.photoEventNarrative.goalConfidence = {
            ...createBriefingGoalConfidenceBlockFromV3({
              assessment: outputs.confidenceAssessment,
              narrativePlan: outputs.narrativePlan,
              capturedAt: now().toISOString(),
            }),
            canonicalPhotoSessionId: session.id,
          };
          return { artifact: candidate };
        },
      });
      return result.commitResult ?? typed(result.status, "Photo finalization did not commit.");
    },
  });
}

function historicalAssessmentAtOrBefore({ store, goalId, phaseId, cutoff }) {
  return createCanonicalConfidenceReadService({ store })
    .getAssessmentForEvidenceCutoff({ goalId, phaseId, cutoff });
}

function bindHistoricalConfidence({ artifact, assessment, cutoff, now }) {
  const candidate = structuredClone(artifact);
  candidate.briefing.photoEventNarrative.goalConfidence = {
    ...createMonthlyBriefingGoalConfidenceBlockFromAssessment(assessment, {
      capturedAt: now().toISOString(),
      captureSemantics: "historical_matched_assessment_at_event_publication" }),
    canonicalPhotoSessionId: artifact.trigger.evidenceId,
  };
  candidate.confidencePublication = {
    schemaVersion: "briefing_confidence_binding_v2",
    assessmentId: assessment.id,
    publisherType: "photo_event_briefing",
    originatingBriefingId: artifact.id,
    publicationCutoff: cutoff,
    confidenceMode: "matched-only",
    authoritativeSnapshotChanged: false,
    matchedAssessmentPublisherType: assessment.publisherType,
  };
  return candidate;
}
function typed(status, message) { return { status, committed: false,
  error: message ? { code: status, message } : null }; }
