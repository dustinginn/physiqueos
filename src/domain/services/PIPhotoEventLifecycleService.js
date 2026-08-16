import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import {
  adaptPhotoEventToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
  isQualifyingPhotoEventInterpretation,
} from "../confidence/ProductionConfidenceContextAdapter";
import { createBriefingGoalConfidenceBlockFromV2 } from
  "./BriefingGoalConfidencePresentationService";

export function createPIPhotoEventLifecycleService({ publicationService,
  now = () => new Date() } = {}) {
  if (!publicationService) throw new Error("Photo Event publication service is required.");
  const finalizer = createBriefingForecastFinalizer({ publicationService, now });
  return Object.freeze({
    async publish({ operation = "create", confidenceMode = "publish-successor",
      artifact, session, context, reason,
      replacementAuthorized = false } = {}) {
      if (confidenceMode === "matched-only") return typed("carried_forward",
        "Non-qualifying Photo Events carry the prior assessment without publication.");
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
      const cutoff = iso(session.capturedAt ?? session.captureDate ?? session.date);
      const goalContract = adaptProductionGoalToCanonicalContract(goal, {
        activePhase: phase, canonicalStore: baseline.store, asOf: cutoff,
      });
      const result = await finalizer.finalize({
        publisherType: "photo_event_briefing", userId: artifact.userId,
        occurrenceId: artifact.id, artifactId: artifact.id,
        cadenceOrEventType: "photo", goalContract, phaseId: phase.id,
        evidenceWindow: { id: `photo_event|${session.id}`, start: cutoff,
          cutoff, closed: true },
        strategyContext: goalContract.strategyHypothesis,
        executionContext: { adequacy: "unknown", elapsedTimeAdequacy: "unknown",
          refs: [] },
        evidenceDescriptors: adaptPhotoEventToEvidenceDescriptors({ session, narrative }),
        previousCanonicalAssessment: current.assessment,
        publicationCutoff: cutoff, finalizedAt: now().toISOString(),
        idempotencyKey: `confidence_v2|photo|${artifact.id}`,
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
        elapsedTimeAdequacy: "unknown",
        phaseReviewContext: {
          activeGoal: goal, activePhase: phase,
          reviewMilestone: phase.reviewMilestone ?? null,
          currentArtifact: { id: artifact.id, evidenceTypes: ["photo_event"],
            evidenceIdentities: [session.id] },
          artifactType: "photo_event", eventIdentity: artifact.id,
          evidenceIdentity: session.id, artifactTimestamp: cutoff,
          publicationTimestamp: now().toISOString(), currentDate: cutoff,
          reviewState: phase.reviewState,
          decisionHistory: baseline.store.phaseReviewDecisions ?? [],
          expectedStoreRevision: baseline.revision,
        },
        composeArtifact: (outputs) => {
          const candidate = structuredClone(artifact);
          candidate.briefing.photoEventNarrative.goalConfidence = {
            ...createBriefingGoalConfidenceBlockFromV2({
              assessment: outputs.confidenceAssessment,
              projection: outputs.numericConfidenceProjection,
              narrativeAssessment: outputs.narrativeAssessment,
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
function iso(value) {
  const raw = String(value ?? "");
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T23:59:59.999Z` : raw);
  if (!Number.isFinite(parsed)) throw new Error("Photo cutoff is invalid.");
  return new Date(parsed).toISOString();
}
function typed(status, message) { return { status, committed: false,
  error: message ? { code: status, message } : null }; }
