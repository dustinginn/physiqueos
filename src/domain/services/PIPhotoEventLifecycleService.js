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
import { ConfidencePublisherRegistry } from
  "../confidence/ConfidencePublisherRegistry";

export function createPIPhotoEventLifecycleService({ publicationService,
  now = () => new Date() } = {}) {
  if (!publicationService) throw new Error("Photo Event publication service is required.");
  const finalizer = createBriefingForecastFinalizer({ publicationService, now });
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
      const cutoff = iso(session.capturedAt ?? session.captureDate ?? session.date);
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

function historicalAssessmentAtOrBefore({ store, goalId, phaseId, cutoff }) {
  const at = Date.parse(cutoff);
  return (store.goalConfidenceHistory ?? [])
    .filter((record) => record.goalId === goalId && record.phaseId === phaseId &&
      record.assessment?.schemaVersion === "canonical_confidence_assessment_v2" &&
      Date.parse(record.assessment.sourceCutoff) <= at)
    .sort((left, right) => Date.parse(right.assessment.sourceCutoff) -
      Date.parse(left.assessment.sourceCutoff))[0] ?? null;
}

function bindHistoricalConfidence({ artifact, assessment, cutoff, now }) {
  const candidate = structuredClone(artifact);
  candidate.briefing.photoEventNarrative.goalConfidence = {
    ...createBriefingGoalConfidenceBlockFromV2({ assessment,
      projection: { currentPercentage: assessment.currentPercentage },
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
function iso(value) {
  const raw = String(value ?? "");
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T23:59:59.999Z` : raw);
  if (!Number.isFinite(parsed)) throw new Error("Photo cutoff is invalid.");
  return new Date(parsed).toISOString();
}
function typed(status, message) { return { status, committed: false,
  error: message ? { code: status, message } : null }; }
