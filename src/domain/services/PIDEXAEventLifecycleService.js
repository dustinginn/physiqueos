import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import {
  adaptDEXAEventToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
} from "../confidence/ProductionConfidenceContextAdapter";
import { createBriefingGoalConfidenceBlockFromV2 } from
  "./BriefingGoalConfidencePresentationService";
import { resolveIntelligenceEvidenceCutoff } from
  "./IntelligenceLifecycleIdentityService";

export function createPIDEXAEventLifecycleService({ publicationService,
  now = () => new Date() } = {}) {
  if (!publicationService) throw new Error("DEXA Event publication service is required.");
  const finalizer = createBriefingForecastFinalizer({ publicationService, now });
  return Object.freeze({
    async publish({ operation = "create", artifact, scan, priorScan, context, reason,
      replacementAuthorized = false } = {}) {
      const goal = context?.activeGoal;
      const phase = context?.activePhase;
      if (!goal?.id || !phase?.id || !scan?.id) return typed("not_eligible",
        "DEXA Confidence requires an active Goal, phase, and canonical scan.");
      const baseline = publicationService.captureBaseline();
      const replacementTarget = operation === "regenerate"
        ? baseline.store.dailyBriefings?.find((item) => item.id === artifact.id) ?? null
        : null;
      const current = createCanonicalConfidenceReadService({ store: baseline.store })
        .getCurrent({ goalId: goal.id, phaseId: phase.id });
      if (!current.assessment) return typed("canonical_predecessor_required",
        "DEXA Confidence requires a canonical predecessor.");
      const cutoff = resolveIntelligenceEvidenceCutoff({
        value: scan.measuredAt ?? scan.date,
        timeZone: context?.timeZone ?? artifact?.timeZone ??
          "America/Los_Angeles",
      });
      const goalContract = adaptProductionGoalToCanonicalContract(goal, {
        activePhase: phase, canonicalStore: baseline.store, asOf: cutoff,
      });
      const result = await finalizer.finalize({
        publisherType: "dexa_event_briefing", userId: artifact.userId,
        occurrenceId: artifact.id, artifactId: artifact.id,
        cadenceOrEventType: "dexa", goalContract, phaseId: phase.id,
        evidenceWindow: { id: `dexa_event|${scan.id}`,
          start: priorScan?.measuredAt ?? priorScan?.date ?? cutoff,
          cutoff, closed: true },
        strategyContext: goalContract.strategyHypothesis,
        executionContext: { adequacy: "adequate",
          elapsedTimeAdequacy: priorScan ? "adequate" : "unknown", refs: [] },
        evidenceDescriptors: adaptDEXAEventToEvidenceDescriptors({ scan, priorScan }),
        previousCanonicalAssessment: current.assessment,
        publicationCutoff: cutoff, finalizedAt: now().toISOString(),
        idempotencyKey: `confidence_v2|dexa|${artifact.id}`,
        expectedPriorAssessmentId: current.assessment.id,
        expectedPriorArtifactId: current.assessment.briefingArtifactId,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        replacementAuthorized,
        replacesArtifactId: replacementTarget?.id ?? null,
        replacesAssessmentId:
          replacementTarget?.confidencePublication?.assessmentId ?? null,
        sourceLineage: { reason, canonicalDEXAId: scan.id,
          priorDEXAId: priorScan?.id ?? null },
        elapsedTimeAdequacy: priorScan ? "adequate" : "unknown",
        phaseReviewContext: {
          activeGoal: goal, activePhase: phase,
          reviewMilestone: phase.reviewMilestone ?? null,
          currentArtifact: { id: artifact.id, evidenceTypes: ["dexa_event"],
            evidenceIdentities: [scan.id] },
          artifactType: "dexa_event", eventIdentity: artifact.id,
          evidenceIdentity: scan.id, artifactTimestamp: cutoff,
          publicationTimestamp: now().toISOString(), currentDate: cutoff,
          reviewState: phase.reviewState,
          decisionHistory: baseline.store.phaseReviewDecisions ?? [],
          expectedStoreRevision: baseline.revision,
        },
        composeArtifact: (outputs) => {
          const candidate = structuredClone(artifact);
          candidate.briefing.dexaEventNarrative.goalConfidence = {
            ...createBriefingGoalConfidenceBlockFromV2({
              assessment: outputs.confidenceAssessment,
              projection: outputs.numericConfidenceProjection,
              narrativeAssessment: outputs.narrativeAssessment,
              capturedAt: now().toISOString(),
            }),
            canonicalDEXAId: scan.id,
            authoritativeEvidenceRole: priorScan ? "comparison" : "baseline",
          };
          return { artifact: candidate };
        },
      });
      return result.commitResult ?? typed(result.status, "DEXA finalization did not commit.");
    },
  });
}
function typed(status, message) { return { status, committed: false,
  error: message ? { code: status, message } : null }; }
