import { EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION } from "../../domain/services/EvidenceIntakeBackgroundWork.js";
import { interpretEvidenceIntakeStoredArtifacts } from "../../domain/services/EvidenceIntakeService.js";
import { createEvidenceReviewService } from "../../domain/services/EvidenceReviewService.js";
import { resolvePhotoSessionGoalRelationship } from "../../domain/services/PhotoSessionMetadataService.js";
import { WorkerMessageError } from "./DurableOutboxWorker.js";

export function createEvidenceIntakeInterpretationWorkerHandler({
  store,
  loadArtifact,
  now = () => new Date(),
  readCanonicalExerciseRegistry = null,
  logger = null,
  performanceClock = () => performance.now(),
} = {}) {
  if (!store?.claimInterpretation || typeof loadArtifact !== "function") {
    throw new Error("Evidence intake worker requires receipt and provider media storage.");
  }
  return async ({ messageId, workerId, payloadVersion, payload, assertLease }) => {
    const workerStartedAt = performanceClock();
    if (payloadVersion !== EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION) {
      throw new WorkerMessageError("EVIDENCE_INTAKE_VERSION_UNSUPPORTED", "Evidence intake payload version is unsupported.");
    }
    const receiptId = String(payload?.intakeReceiptId ?? "").trim();
    if (!receiptId) throw new WorkerMessageError("EVIDENCE_INTAKE_INVALID", "Evidence intake payload is incomplete.");
    const claimOwner = `${workerId ?? "worker"}:${messageId}`;
    const claimed = await store.claimInterpretation({ receiptId, workerId: claimOwner });
    if (!claimed || claimed.outcome === "completed" || claimed.outcome === "claimed_elsewhere") return claimed;
    const receipt = claimed.receipt;
    logger?.info?.("evidence.intake.interpretation_started", {
      intakeId: receipt.id,
      queueWaitMs: millisecondsBetween(claimed.queuedAt ?? receipt.createdAt, receipt.interpretationStartedAt),
      artifactCount: receipt.storedArtifacts.length,
    });
    try {
      // Interpretation uses synchronous identity resolution. Refresh the bounded provider
      // registry before the first interpretation in a fresh worker process so an exact
      // Founder-created exercise cannot be misclassified as provisional.
      const registryStartedAt = performanceClock();
      await readCanonicalExerciseRegistry?.();
      const registryDurationMs = elapsed(performanceClock, registryStartedAt);
      const contextStartedAt = performanceClock();
      const context = await store.loadPhotoSessionContext(receipt.effectiveDate);
      const contextDurationMs = elapsed(performanceClock, contextStartedAt);
      const interpretationStartedAt = performanceClock();
      const result = await interpretEvidenceIntakeStoredArtifacts({
        capturedAt: receipt.createdAt,
        evidenceDate: receipt.effectiveDate,
        expectedEvidenceType: receipt.expectedEvidenceType,
        loadArtifact: (input) => loadArtifact({ ...input, receipt }),
        sourceArtifacts: receipt.storedArtifacts,
        submissionId: `evidence_submission_${receipt.submissionIdentity.replaceAll("-", "")}`,
        typedEvidence: receipt.typedEvidence,
        userId: receipt.ownerUserId,
        photoSessionContext: {
          goalRelationship: resolvePhotoSessionGoalRelationship({
            evidenceDate: receipt.effectiveDate,
            goals: context.goals,
            executionItems: context.executionItems,
          }),
        },
        onStage: (stage) => logger?.info?.("evidence.intake.interpretation_stage", {
          intakeId: receipt.id,
          ...stage,
        }),
      });
      const interpretationDurationMs = elapsed(performanceClock, interpretationStartedAt);
      const evidencePackage = {
        ...result.evidencePackage,
        provenance: { ...(result.evidencePackage.provenance ?? {}), intake_receipt_id: receipt.id },
        review_metadata: {
          ...(result.evidencePackage.review_metadata ?? {}),
          recoveryContext: receipt.recoveryContext,
          intakeReceiptId: receipt.id,
          ...(receipt.recoveryContext?.kind === "training_logger_support" ? {
            targetTrainingDraftId: receipt.recoveryContext.targetTrainingDraftId,
            targetTrainingSessionCanonicalId:
              receipt.recoveryContext.targetTrainingSessionCanonicalId,
          } : {}),
        },
      };
      let review;
      const repositories = { evidenceReviews: { async createReview(value) { review = value; return value; } } };
      await createEvidenceReviewService({ repositories, now }).stage({
        userId: receipt.ownerUserId,
        evidencePackage,
        source: receipt.source,
        reviewId: `evidence_review_${receipt.submissionIdentity.replaceAll("-", "")}`,
        intakeReceiptId: receipt.id,
        createdAt: receipt.createdAt,
      });
      assertLease?.();
      const persistenceStartedAt = performanceClock();
      const completed = await store.completeInterpretation({ receiptId, workerId: claimOwner, evidencePackage, review, assertLease });
      logger?.info?.("evidence.intake.review_ready", {
        intakeId: receipt.id,
        registryDurationMs,
        contextDurationMs,
        interpretationDurationMs,
        persistenceDurationMs: elapsed(performanceClock, persistenceStartedAt),
        totalWorkerDurationMs: elapsed(performanceClock, workerStartedAt),
      });
      return completed;
    } catch (error) {
      await store.failInterpretation({ receiptId, workerId: claimOwner, errorCode: error?.code }).catch(() => undefined);
      throw error;
    }
  };
}

function elapsed(clock, startedAt) {
  return Math.max(0, Math.round((clock() - startedAt) * 100) / 100);
}

function millisecondsBetween(start, end) {
  const value = Date.parse(end ?? "") - Date.parse(start ?? "");
  return Number.isFinite(value) && value >= 0 ? value : null;
}
