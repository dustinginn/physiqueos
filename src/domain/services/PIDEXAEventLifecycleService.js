import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService";
import { adaptCanonicalDexaScans } from
  "../intelligence/ProductionConfidenceNarrativeV3Adapter";
import { applyNarrativeV3ToBriefingArtifact,
  createBriefingGoalConfidenceBlockFromV3 } from
  "./BriefingGoalConfidencePresentationService";
import { resolveIntelligenceEvidenceCutoff } from
  "./IntelligenceLifecycleIdentityService";
import { createStrategicInterpretationPublicationServiceV3 } from
  "./StrategicInterpretationPublicationServiceV3";

export function createPIDEXAEventLifecycleService({ publicationService,
  now = () => new Date() } = {}) {
  if (!publicationService) throw new Error("DEXA Event publication service is required.");
  const finalizer = createStrategicInterpretationPublicationServiceV3({
    publicationService, now,
  });
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
      const result = await finalizer.finalize({
        publisherType: "dexa_event_briefing", userId: artifact.userId,
        occurrenceId: artifact.id, artifactId: artifact.id,
        cadenceOrEventType: "dexa", goal, phase, store: baseline.store,
        evidenceWindowId: `dexa_event|${scan.id}`,
        evidenceWindowClosed: true,
        buildAdditionalObservations: ({ goalContract }) =>
          adaptCanonicalDexaScans({ goalContract, phase,
            scans: [priorScan, scan].filter(Boolean), cutoff }),
        previousCanonicalAssessment: current.assessment,
        evidenceCutoff: cutoff, finalizedAt: now().toISOString(),
        idempotencyKey: `confidence_v3|dexa|${artifact.id}`,
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
        evaluationType: "event_evidence_boundary",
        surface: "dexa_event_briefing",
        phaseReviewContext: {
          activeGoal: goal, activePhase: phase,
          reviewMilestone: phase.reviewMilestone ?? null,
          currentArtifact: { id: artifact.id, evidenceTypes: ["dexa_event"],
            evidenceIdentities: [scan.id] },
          currentEvidence: scan,
          artifactType: "dexa_event", eventIdentity: artifact.id,
          evidenceIdentity: scan.id, artifactTimestamp: cutoff,
          publicationTimestamp: now().toISOString(), currentDate: cutoff,
          reviewState: phase.reviewState,
          decisionHistory: baseline.store.phaseReviewDecisions ?? [],
          expectedStoreRevision: baseline.revision,
        },
        composeArtifact: (outputs) => {
          const candidate = applyNarrativeV3ToBriefingArtifact({
            artifact, publicationType: "dexa",
            narrativePlan: outputs.narrativePlan,
            strategicInterpretation: outputs.strategicInterpretation,
          });
          candidate.briefing.dexaEventNarrative.goalConfidence = {
            ...createBriefingGoalConfidenceBlockFromV3({
              assessment: outputs.confidenceAssessment,
              narrativePlan: outputs.narrativePlan,
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
