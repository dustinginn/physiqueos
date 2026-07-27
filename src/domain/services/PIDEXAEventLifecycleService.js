import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";
import {
  createPIDEXAGoalConfidencePreparationService,
} from "./PIDEXAGoalConfidencePreparationService";
import {
  createBriefingGoalConfidenceBlockFromAssessment,
} from "./BriefingGoalConfidencePresentationService";
import {
  createPIDEXAConfidenceReasoning,
} from "./PIDEXAConfidenceReasoningService";

export function createPIDEXAEventLifecycleService({
  publicationService,
  now = () => new Date(),
} = {}) {
  if (!publicationService) throw new Error("DEXA Event publication service is required.");
  return Object.freeze({
    async publish({
      operation = "create",
      confidenceMode = "publish-successor",
      artifact,
      scan,
      priorScan,
      context,
      reason,
      replacementAuthorized = false,
    } = {}) {
      const goal = context?.activeGoal;
      const phase = context?.activePhase;
      if (!goal?.id || !phase?.id || !scan?.id) {
        return typed("not_eligible",
          "DEXA confidence requires an active Goal, phase, and canonical scan.");
      }
      const baseline = publicationService.captureBaseline();
      const readService = createPIGoalConfidenceReadService({ store: baseline.store });
      const series = readService.getGoalConfidenceSeries({
        goalId: goal.id,
        phaseId: phase.id,
      });
      let assessment;
      let publicationCommand = null;
      let receipt = null;
      let reasoning = null;
      if (confidenceMode === "matched-only") {
        assessment = series.latestCanonicalAssessment;
        if (!assessment) return typed("not_eligible",
          "No canonical confidence assessment is available for matched-only DEXA publication.");
      } else {
        reasoning = createPIDEXAConfidenceReasoning({
          scan,
          priorScan,
          narrative: artifact.briefing.dexaEventNarrative,
          context,
        });
        const prepared = await createPIDEXAGoalConfidencePreparationService({
          readService,
          now,
        }).prepare({
          triggerType: "dexa_event",
          occurrenceId: artifact.id,
          goalContext: {
            goalId: goal.id,
            semanticGoalType: goal.type ?? context.semanticGoalType,
          },
          phaseContext: {
            phaseId: phase.id,
            semanticPhaseType: phase.semanticType ?? phase.name,
          },
          operatingState: context.operatingState?.value ??
            goal.openingApproach?.value,
          evidenceWindow: null,
          evidenceCutoff: `${dateKey(scan.measuredAt ?? scan.date)}T23:59:59.999Z`,
          assessmentContext: { eventId: artifact.id },
          preparedPIReasoning: reasoning,
          piVersion: "pi_v3",
          generatedAt: now().toISOString(),
          expectedRevision: baseline.revision,
          expectedSemanticDigest: baseline.semanticDigest,
          expectedCurrentSnapshot: series.currentSnapshot,
          publicationReason: reason,
        });
        if (prepared.status === "authoritative_evidence_already_consumed") {
          assessment = prepared.assessment;
          receipt = prepared.receipt;
        } else if (prepared.status === "prepared_successor") {
          assessment = prepared.assessment;
          publicationCommand = prepared.publicationCommand;
          receipt = prepared.receipt;
        } else {
          return { ...typed(prepared.status, prepared.reason), preparation: prepared };
        }
      }
      const role = reasoning?.role ??
        inferRoleFromAssessment(assessment, scan.id);
      const candidate = structuredClone(artifact);
      candidate.briefing.dexaEventNarrative.goalConfidence = {
        ...createBriefingGoalConfidenceBlockFromAssessment(
          assessment, {
            capturedAt: now().toISOString(),
            captureSemantics: "dexa_assessment_at_atomic_event_publication",
          }),
        canonicalDEXAId: scan.id,
        authoritativeEvidenceRole: role,
      };
      return publicationService.publish({
        schemaVersion: "pi_dexa_event_publication_v1",
        operation,
        confidenceMode,
        artifact: candidate,
        canonicalDEXAId: scan.id,
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

function inferRoleFromAssessment(assessment, scanId) {
  const contributor = assessment?.contributors?.find((item) =>
    item.domain === "dexa" &&
    item.canonicalEvidenceReferences?.some((ref) => ref.id.includes(scanId)));
  return contributor?.status === "recent_baseline" ? "baseline" :
    contributor?.status ?? "inconclusive";
}
function typed(status, message) {
  return {
    status,
    committed: false,
    error: message ? { code: status, message } : null,
  };
}
function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}
