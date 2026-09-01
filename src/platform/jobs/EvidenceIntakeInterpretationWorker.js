import { EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION } from "../../domain/services/EvidenceIntakeBackgroundWork.js";
import { interpretEvidenceIntakeStoredArtifacts } from "../../domain/services/EvidenceIntakeService.js";
import { createEvidenceReviewService } from "../../domain/services/EvidenceReviewService.js";
import { resolvePhotoSessionGoalRelationship } from "../../domain/services/PhotoSessionMetadataService.js";
import { WorkerMessageError } from "./DurableOutboxWorker.js";

export function createEvidenceIntakeInterpretationWorkerHandler({ store, loadArtifact, now = () => new Date() } = {}) {
  if (!store?.claimInterpretation || typeof loadArtifact !== "function") {
    throw new Error("Evidence intake worker requires receipt and provider media storage.");
  }
  return async ({ messageId, workerId, payloadVersion, payload, assertLease }) => {
    if (payloadVersion !== EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION) {
      throw new WorkerMessageError("EVIDENCE_INTAKE_VERSION_UNSUPPORTED", "Evidence intake payload version is unsupported.");
    }
    const receiptId = String(payload?.intakeReceiptId ?? "").trim();
    if (!receiptId) throw new WorkerMessageError("EVIDENCE_INTAKE_INVALID", "Evidence intake payload is incomplete.");
    const claimOwner = `${workerId ?? "worker"}:${messageId}`;
    const claimed = await store.claimInterpretation({ receiptId, workerId: claimOwner });
    if (!claimed || claimed.outcome === "completed" || claimed.outcome === "claimed_elsewhere") return claimed;
    const receipt = claimed.receipt;
    try {
      const context = await store.loadPhotoSessionContext(receipt.effectiveDate);
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
      });
      const evidencePackage = {
        ...result.evidencePackage,
        provenance: { ...(result.evidencePackage.provenance ?? {}), intake_receipt_id: receipt.id },
        review_metadata: { ...(result.evidencePackage.review_metadata ?? {}), recoveryContext: receipt.recoveryContext, intakeReceiptId: receipt.id },
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
      return store.completeInterpretation({ receiptId, workerId: claimOwner, evidencePackage, review, assertLease });
    } catch (error) {
      await store.failInterpretation({ receiptId, workerId: claimOwner, errorCode: error?.code }).catch(() => undefined);
      throw error;
    }
  };
}
