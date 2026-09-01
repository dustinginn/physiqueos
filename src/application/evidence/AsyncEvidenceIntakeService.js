import { createHash } from "node:crypto";
import { createStoredEvidenceArtifactDescriptor } from "../../domain/services/EvidenceIntakeService.js";

export function createAsyncEvidenceIntakeService({ store, uploads, now = () => new Date() } = {}) {
  if (!store?.beginUpload || !uploads?.store) {
    throw new Error("Asynchronous Evidence intake requires receipt and provider upload storage.");
  }
  return Object.freeze({
    ownerUserId: store.ownerUserId,
    async getStatus(intakeId) {
      const receipt = await store.getReceipt(String(intakeId ?? "").trim());
      return receipt ? responseFor(receipt) : null;
    },
    async accept({ submissionIdentity, effectiveDate, expectedEvidenceType = "auto", files = [],
      artifactManifest, typedEvidence = null, recoveryContext = null }) {
      validateSubmissionIdentity(submissionIdentity);
      const source = effectiveDate < founderDate(now()) ? "historical_universal_intake" : "universal_intake";
      const begun = await store.beginUpload({ submissionIdentity, effectiveDate, expectedEvidenceType,
        source, artifactManifest, typedEvidence, recoveryContext });
      if (begun.receipt.interpretationState === "completed") return responseFor(begun.receipt);
      if (begun.receipt.mediaState === "stored" || !begun.claimed) return responseFor(begun.receipt);

      try {
        let receipt = begun.receipt;
        const existing = new Map(receipt.storedArtifacts.map((artifact) => [artifact.ordinal, artifact]));
        const stores = files.map(async (file, index) => {
          const ordinal = index + 1;
          if (existing.has(ordinal)) return existing.get(ordinal);
          const bytes = Buffer.from(await file.arrayBuffer());
          const artifactId = `artifact_${submissionIdentity.replaceAll("-", "")}_${ordinal}`;
          const stored = await uploads.store({
            ownerUserId: store.ownerUserId,
            bytes,
            contentType: file.type || "application/octet-stream",
            originalFilename: file.name || `upload-${ordinal}.bin`,
            category: "evidenceIntakes",
            relationshipId: receipt.id,
            artifactId,
            provenance: { ordinal },
          });
          return store.recordStoredArtifact({
            receiptId: receipt.id,
            claimToken: begun.claimToken,
            artifact: {
              ordinal, id: artifactId, objectId: stored.objectId,
              storagePath: stored.reference, fileName: file.name || `upload-${ordinal}.bin`,
              mimeType: stored.contentType, byteLength: stored.byteLength, sha256: stored.sha256,
              uploadedAt: now().toISOString(),
            },
          });
        });
        const outcomes = await Promise.allSettled(stores);
        const failed = outcomes.find((outcome) => outcome.status === "rejected");
        if (failed) throw failed.reason;
        receipt = await store.completeUpload({ receiptId: receipt.id, claimToken: begun.claimToken });
        return responseFor(receipt);
      } catch (error) {
        await store.failUpload({ receiptId: begun.receipt.id, claimToken: begun.claimToken, errorCode: error?.code }).catch(() => undefined);
        throw error;
      }
    },
  });
}

export function createProviderEvidenceIntakeArtifactLoader({ pool, objectProvider, fetchImpl = globalThis.fetch } = {}) {
  if (!pool?.query || !objectProvider?.authorizeRead || typeof fetchImpl !== "function") {
    throw new Error("Provider Evidence interpretation requires owner-scoped media loading.");
  }
  return async ({ receipt, artifact }) => {
    const row = (await pool.query(
      `SELECT id,owner_user_id,content_type,byte_length,sha256,storage_key,provider_version
         FROM physiqueos.canonical_media_objects
        WHERE id=$1 AND owner_user_id=$2 AND evidence_collection='evidenceIntakes'
          AND evidence_record_id=$3 AND state='verified'`,
      [artifact.objectId, receipt.ownerUserId, receipt.id],
    )).rows[0];
    if (!row) throw intakeError("EVIDENCE_INTAKE_MEDIA_NOT_FOUND");
    const signed = await objectProvider.authorizeRead({ objectKey: row.storage_key, providerVersion: row.provider_version });
    const response = await fetchImpl(signed.url, { cache: "no-store", redirect: "error" });
    if (!response.ok) throw intakeError("EVIDENCE_INTAKE_MEDIA_READ_FAILED");
    const buffer = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (buffer.length !== Number(row.byte_length) || sha256 !== row.sha256 || row.content_type !== artifact.mimeType) {
      throw intakeError("EVIDENCE_INTAKE_MEDIA_INTEGRITY_FAILED");
    }
    return createStoredEvidenceArtifactDescriptor({
      buffer,
      capturedAt: artifact.uploadedAt ?? receipt.createdAt,
      file: { name: artifact.fileName, type: artifact.mimeType },
      id: artifact.id,
      mimeType: artifact.mimeType,
      observedDate: receipt.effectiveDate,
      relativePath: artifact.storagePath,
      safeName: artifact.fileName,
    });
  };
}

function responseFor(receipt) {
  return Object.freeze({
    intakeId: receipt.id,
    status: receipt.interpretationState === "completed" ? "ready" :
      receipt.interpretationState === "failed" ? "processing_failed" : "processing",
    reviewId: receipt.reviewId ?? null,
    reviewUrl: receipt.reviewId ? `/evidence/review/${receipt.reviewId}` : null,
    processingUrl: `/log?intake=${encodeURIComponent(receipt.id)}&upload=received`,
  });
}

function validateSubmissionIdentity(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""))) {
    throw intakeError("EVIDENCE_INTAKE_SUBMISSION_ID_INVALID");
  }
}

function founderDate(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
}
function intakeError(code) { return Object.assign(new Error(code), { code }); }
