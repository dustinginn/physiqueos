import { createHash } from "node:crypto";
import { createStoredEvidenceArtifactDescriptor } from "../../domain/services/EvidenceIntakeService.js";
import { bytesMatchDeclaredImageType } from "../../domain/services/ImageContainerDetection.js";
import {
  isStagedEvidenceManifest,
  stagedArtifactMaximumBytes,
  stagedArtifactProgress,
} from "../../domain/services/StagedEvidenceArtifactManifest.js";

export function createAsyncEvidenceIntakeService({ store, uploads, now = () => new Date(), logger = null,
  performanceClock = () => performance.now() } = {}) {
  if (!store?.beginUpload || !uploads?.store) {
    throw new Error("Asynchronous Evidence intake requires receipt and provider upload storage.");
  }
  return Object.freeze({
    ownerUserId: store.ownerUserId,
    async getStatus(intakeId) {
      const receipt = await store.getReceipt(String(intakeId ?? "").trim());
      return receipt ? responseFor(receipt) : null;
    },

    /**
     * Staged media, step one: declare the intake and its expected artifacts.
     * Nothing is transferred here. Replaying the identical declaration is a
     * read of the existing receipt.
     */
    async stage({ submissionIdentity, effectiveDate, expectedEvidenceType = "auto", artifactManifest, recoveryContext = null }) {
      validateSubmissionIdentity(submissionIdentity);
      if (typeof store.stageIntake !== "function") throw intakeError("EVIDENCE_INTAKE_STAGING_UNAVAILABLE");
      const source = effectiveDate < founderDate(now()) ? "historical_universal_intake" : "universal_intake";
      const staged = await store.stageIntake({ submissionIdentity, effectiveDate, expectedEvidenceType, source, artifactManifest, recoveryContext });
      logger?.info?.("evidence.intake.staged", {
        intakeId: staged.receipt.id, created: staged.created, artifactCount: artifactManifest.files.length,
      });
      return responseFor(staged.receipt);
    },

    /**
     * Staged media, step two: transfer one declared artifact. The body is read
     * only after the manifest entry is known, under that entry's ceiling; the
     * bytes must equal the declaration in length, hash, and container. A
     * re-sent artifact that is already catalogued is acknowledged without a
     * second object. Two concurrent transfers of the same artifact converge
     * on one object through the catalog's content-hash uniqueness.
     */
    async storeStagedArtifact({ intakeId, artifactId, readBody }) {
      if (typeof store.loadStagedArtifactState !== "function") throw intakeError("EVIDENCE_INTAKE_STAGING_UNAVAILABLE");
      const artifactStartedAt = performanceClock();
      const state = await store.loadStagedArtifactState({ receiptId: intakeId, artifactId });
      if (!state) throw intakeError("EVIDENCE_INTAKE_NOT_FOUND");
      const { entry } = state;
      if (!entry) throw intakeError("EVIDENCE_INTAKE_ARTIFACT_UNKNOWN");
      const { bytes, contentType } = await readBody({ maximumBytes: stagedArtifactMaximumBytes(entry) });
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      if (contentType !== entry.type) throw intakeError("EVIDENCE_INTAKE_ARTIFACT_TYPE_MISMATCH");
      if (buffer.length !== entry.size) throw intakeError("EVIDENCE_INTAKE_ARTIFACT_SIZE_MISMATCH");
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (sha256 !== entry.sha256) throw intakeError("EVIDENCE_INTAKE_ARTIFACT_HASH_MISMATCH");
      if (!bytesMatchDeclaredImageType(buffer, entry.type)) throw intakeError("EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID");
      if (state.stored) {
        // Already catalogued (a lost acknowledgement, or a duplicate send).
        return responseFor(state.receipt, { artifactId, artifactOutcome: "already_stored" });
      }
      if (state.receipt.mediaState === "stored" || state.receipt.interpretationState === "completed") {
        throw intakeError("EVIDENCE_INTAKE_MEDIA_ALREADY_COMPLETE");
      }
      let stored = null;
      try {
        stored = await uploads.store({
          ownerUserId: store.ownerUserId,
          bytes: buffer,
          contentType: entry.type,
          originalFilename: entry.name,
          category: "evidenceIntakes",
          relationshipId: state.receipt.id,
          artifactId,
        });
      } catch (error) {
        // 23505: the catalog already holds these exact bytes for this intake —
        // a concurrent transfer of the same artifact won. Reconcile instead.
        if (error?.code !== "23505") throw error;
      }
      const recorded = stored
        ? await store.recordStagedArtifact({
          receiptId: state.receipt.id,
          artifact: {
            ordinal: entry.ordinal, id: artifactId, role: entry.role, derivativeOf: entry.derivativeOf,
            objectId: stored.objectId, storagePath: stored.reference, fileName: entry.name,
            mimeType: stored.contentType, byteLength: stored.byteLength, sha256: stored.sha256,
            uploadedAt: now().toISOString(),
          },
        })
        : await store.loadStagedArtifactState({ receiptId: intakeId, artifactId });
      if (!recorded?.receipt) throw intakeError("EVIDENCE_INTAKE_NOT_FOUND");
      const outcome = stored ? (recorded.alreadyStored ? "already_stored" : "stored") : "already_stored";
      logger?.info?.("evidence.intake.artifact_stored", {
        intakeId: state.receipt.id, ordinal: entry.ordinal, role: entry.role, outcome,
        mediaComplete: recorded.receipt.mediaState === "stored",
        durationMs: elapsed(performanceClock, artifactStartedAt),
      });
      return responseFor(recorded.receipt, { artifactId, artifactOutcome: outcome });
    },
    async accept({ submissionIdentity, effectiveDate, expectedEvidenceType = "auto", files = [],
      artifactManifest, typedEvidence = null, clientExtractedText = null, recoveryContext = null }) {
      const intakeStartedAt = performanceClock();
      validateSubmissionIdentity(submissionIdentity);
      const source = effectiveDate < founderDate(now()) ? "historical_universal_intake" : "universal_intake";
      const begun = await store.beginUpload({ submissionIdentity, effectiveDate, expectedEvidenceType,
        source, artifactManifest, typedEvidence, clientExtractedText, recoveryContext });
      if (begun.receipt.interpretationState === "completed") return responseFor(begun.receipt);
      if (begun.receipt.mediaState === "stored" || !begun.claimed) return responseFor(begun.receipt);

      try {
        let receipt = begun.receipt;
        const existing = new Map(receipt.storedArtifacts.map((artifact) => [artifact.ordinal, artifact]));
        const stores = files.map(async (file, index) => {
          const artifactStartedAt = performanceClock();
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
          const recorded = await store.recordStoredArtifact({
            receiptId: receipt.id,
            claimToken: begun.claimToken,
            artifact: {
              ordinal, id: artifactId, objectId: stored.objectId,
              storagePath: stored.reference, fileName: file.name || `upload-${ordinal}.bin`,
              mimeType: stored.contentType, byteLength: stored.byteLength, sha256: stored.sha256,
              uploadedAt: now().toISOString(),
            },
          });
          logger?.info?.("evidence.intake.artifact_stored", {
            intakeId: receipt.id, ordinal, durationMs: elapsed(performanceClock, artifactStartedAt),
          });
          return recorded;
        });
        const outcomes = await Promise.allSettled(stores);
        const failed = outcomes.find((outcome) => outcome.status === "rejected");
        if (failed) throw failed.reason;
        receipt = await store.completeUpload({ receiptId: receipt.id, claimToken: begun.claimToken });
        logger?.info?.("evidence.intake.accepted", {
          intakeId: receipt.id,
          artifactCount: files.length,
          durationMs: elapsed(performanceClock, intakeStartedAt),
        });
        return responseFor(receipt);
      } catch (error) {
        await store.failUpload({ receiptId: begun.receipt.id, claimToken: begun.claimToken, errorCode: error?.code }).catch(() => undefined);
        throw error;
      }
    },
  });
}

function elapsed(clock, startedAt) {
  return Math.max(0, Math.round((clock() - startedAt) * 100) / 100);
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
      // A linked analysis derivative is referenced, never loaded here: the
      // original is what interpretation hashes and the canonical photo keeps.
      analysisRelativePath: artifact.analysisArtifact?.storagePath ?? null,
      analysisMimeType: artifact.analysisArtifact?.mimeType ?? null,
    });
  };
}

function responseFor(receipt, extra = {}) {
  const staged = isStagedEvidenceManifest(receipt.artifactManifest);
  const progress = staged ? stagedArtifactProgress(receipt.artifactManifest, receipt.storedArtifacts) : null;
  return Object.freeze({
    intakeId: receipt.id,
    // `status` keeps its historical three values so existing clients are
    // unaffected: incomplete media reads as "processing" (interpretation is
    // simply waiting), never as anything that could be mistaken for complete.
    status: receipt.interpretationState === "completed" ? "ready" :
      receipt.interpretationState === "failed" ? "processing_failed" : "processing",
    reviewId: receipt.reviewId ?? null,
    reviewUrl: receipt.reviewId ? `/evidence/review/${receipt.reviewId}` : null,
    processingUrl: `/log?intake=${encodeURIComponent(receipt.id)}&upload=received`,
    // Safe lifecycle timestamps let Native and operations calculate T1/T2
    // without exposing evidence content or storage identity.
    acceptedAt: receipt.createdAt ?? null,
    interpretationStartedAt: receipt.interpretationStartedAt ?? null,
    reviewReadyAt: receipt.interpretationCompletedAt ?? null,
    // Staged media progress. Absent for aggregate intakes.
    ...(staged ? {
      mediaState: receipt.mediaState,
      mediaComplete: receipt.mediaState === "stored",
      expectedArtifactCount: progress.length,
      storedArtifactCount: progress.filter((item) => item.state === "stored").length,
      artifacts: progress,
      ...(receipt.mediaState === "failed" && receipt.lastErrorCode ? { lastErrorCode: receipt.lastErrorCode } : {}),
    } : {}),
    ...(extra.artifactId ? { artifactId: extra.artifactId, artifactOutcome: extra.artifactOutcome } : {}),
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
