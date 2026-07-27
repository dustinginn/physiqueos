import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";
import {
  createPICadenceGoalConfidencePreparationService,
} from "./PICadenceGoalConfidencePreparationService";
import {
  createBriefingGoalConfidenceBlockFromAssessment,
} from "./BriefingGoalConfidencePresentationService";
import {
  createPICadenceConfidenceReasoning,
} from "./PICadenceConfidenceReasoningService";

export function createPICadenceBriefingLifecycleService({
  publicationService,
  now = () => new Date(),
} = {}) {
  if (!publicationService) throw new Error("Cadence publication service is required.");
  return Object.freeze({
    async publish({
      cadence,
      operation,
      artifact,
      activeGoal,
      activePhase,
      operatingState,
      piEnvelope = null,
      reason,
      replacementAuthorized = false,
    } = {}) {
      if (!activeGoal?.id || !activePhase?.id || !artifact?.evidenceWindow?.id) {
        return {
          status: "unsupported_context",
          committed: false,
          error: {
            code: "unsupported_context",
            message: "Cadence confidence requires an active Goal, phase, and evidence window.",
          },
        };
      }
      const baseline = publicationService.captureBaseline();
      const readService = createPIGoalConfidenceReadService({
        store: baseline.store,
      });
      const preparationService =
        createPICadenceGoalConfidencePreparationService({ readService, now });
      const triggerType = cadence === "midweek"
        ? "midweek_assessment" : "weekly_assessment";
      const evidenceCutoff = cadence === "midweek"
        ? `${artifact.evidenceWindow.endDate}T23:59:59.999Z`
        : `${artifact.evidenceWindow.endDate}T23:59:59.999Z`;
      const preparedPIReasoning = createPICadenceConfidenceReasoning({
        cadence, artifact, authoritative: piEnvelope,
      });
      const confidence = await preparationService.prepare({
        triggerType,
        occurrenceId: artifact.id,
        goalContext: {
          goalId: activeGoal.id,
          semanticGoalType: activeGoal.type ?? "build_lean_mass",
        },
        phaseContext: {
          phaseId: activePhase.id,
          semanticPhaseType: activePhase.semanticType ??
            activePhase.name ?? "establish_maintenance",
        },
        operatingState,
        evidenceWindow: artifact.evidenceWindow,
        evidenceCutoff,
        assessmentContext: {
          cadence,
          evidenceWindowId: artifact.evidenceWindow.id,
        },
        preparedPIReasoning,
        piVersion: "pi_v3",
        generatedAt: now().toISOString(),
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        expectedCurrentSnapshot:
          readService.getGoalConfidenceSeries({
            goalId: activeGoal.id,
            phaseId: activePhase.id,
          }).currentSnapshot,
        publicationReason: reason,
      });
      if (!["prepared_successor", "matched"].includes(confidence.status)) {
        return {
          status: confidence.status,
          committed: false,
          confidence,
        };
      }
      const assessment = confidence.assessment;
      const block = createBriefingGoalConfidenceBlockFromAssessment(
        assessment, { capturedAt: now().toISOString() });
      const candidate = structuredClone(artifact);
      if (cadence === "midweek") candidate.briefing.goalConfidence = block;
      else candidate.briefing.weeklyNarrative.goalConfidence = block;
      return publicationService.publish({
        schemaVersion: "pi_cadence_briefing_publication_v1",
        cadence,
        operation,
        artifact: candidate,
        artifactConfidenceAssessmentId: assessment.id,
        confidencePublicationCommand: confidence.publicationCommand,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        expectedCurrentSnapshot: confidence.publicationCommand?.expectedCurrentSnapshot,
        replacementAuthorized,
        publicationReason: reason,
        triggerReceipt: confidence.receipt,
      });
    },
  });
}
