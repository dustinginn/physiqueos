import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";
import {
  createPIPhotoGoalConfidencePreparationService,
} from "./PIPhotoGoalConfidencePreparationService";
import {
  createBriefingGoalConfidenceBlockFromAssessment,
} from "./BriefingGoalConfidencePresentationService";
import {
  createPIPhotoConfidenceReasoning,
} from "./PIPhotoConfidenceReasoningService";

export function createPIPhotoEventLifecycleService({
  publicationService,
  now = () => new Date(),
} = {}) {
  if (!publicationService) throw new Error("Photo Event publication service is required.");
  return Object.freeze({
    async publish({
      operation = "create",
      confidenceMode = "publish-successor",
      artifact,
      session,
      context,
      reason,
      replacementAuthorized = false,
    } = {}) {
      const goal = context?.activeGoal;
      const phase = context?.activePhase;
      if (!goal?.id || !phase?.id || !session?.id) {
        return typed("not_eligible",
          "Photo confidence requires an active Goal, phase, and canonical session.");
      }
      const baseline = publicationService.captureBaseline();
      const readService = createPIGoalConfidenceReadService({
        store: baseline.store,
      });
      const series = readService.getGoalConfidenceSeries({
        goalId: goal.id, phaseId: phase.id,
      });
      let assessment;
      let publicationCommand = null;
      let receipt = null;
      let reasoning = null;
      if (confidenceMode === "matched-only") {
        assessment = series.latestCanonicalAssessment;
        if (!assessment) return typed("not_eligible",
          "Canonical confidence is unavailable for matched-only Photo publication.");
      } else {
        reasoning = createPIPhotoConfidenceReasoning({
          session,
          narrative: artifact.briefing.photoEventNarrative,
          context,
        });
        if (!reasoning.publicationEligible ||
            ["inconclusive", "neutral", "limiting"].includes(reasoning.role)) {
          assessment = series.latestCanonicalAssessment;
          if (!assessment) return typed("incomplete_pi_input",
            "Photo comparison is insufficient and no canonical confidence assessment exists.");
        } else {
          const prepared = await createPIPhotoGoalConfidencePreparationService({
          readService, now,
          }).prepare({
          triggerType: "photo_event",
          occurrenceId: artifact.id,
          goalContext: {
            goalId: goal.id,
            semanticGoalType: /lean mass/i.test(goal.title ?? "")
              ? "build_lean_mass" : goal.type,
          },
          phaseContext: {
            phaseId: phase.id,
            semanticPhaseType: phase.semanticType ?? phase.name,
          },
          operatingState: context.operatingState?.value,
          evidenceCutoff: `${dateKey(session.captureDate)}T23:59:59.999Z`,
          assessmentContext: { eventId: artifact.id },
          preparedPIReasoning: reasoning,
          piVersion: "pi_v3",
          generatedAt: now().toISOString(),
          expectedRevision: baseline.revision,
          expectedSemanticDigest: baseline.semanticDigest,
          expectedCurrentSnapshot: series.currentSnapshot,
          publicationReason: reason,
          });
          if (prepared.status === "visual_evidence_already_consumed") {
            assessment = prepared.assessment;
            receipt = prepared.receipt;
          } else if (prepared.status === "prepared_successor") {
            assessment = prepared.assessment;
            publicationCommand = prepared.publicationCommand;
            receipt = prepared.receipt;
          } else {
            return { ...typed(prepared.status, prepared.reason),
              preparation: prepared };
          }
        }
      }
      const role = reasoning?.role ?? "neutral";
      const candidate = structuredClone(artifact);
      candidate.briefing.photoEventNarrative.goalConfidence = {
        ...createBriefingGoalConfidenceBlockFromAssessment(assessment, {
          capturedAt: now().toISOString(),
          captureSemantics: "photo_assessment_at_atomic_event_publication",
        }),
        canonicalPhotoSessionId: session.id,
        visualEvidenceRole: role,
      };
      return publicationService.publish({
        schemaVersion: "pi_photo_event_publication_v1",
        operation,
        confidenceMode,
        artifact: candidate,
        photoSessionId: session.id,
        comparisonIds: reasoning?.comparison?.comparisonIds ?? [],
        occurrenceId: artifact.id,
        artifactConfidenceAssessmentId: assessment.id,
        confidencePublicationCommand: publicationCommand,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        expectedCurrentSnapshot: series.currentSnapshot,
        replacementAuthorized,
        publicationReason: reason,
        triggerReceipt: receipt,
      });
    },
  });
}
function typed(status, message) {
  return {
    status, committed: false,
    error: message ? { code: status, message } : null,
  };
}
function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}
