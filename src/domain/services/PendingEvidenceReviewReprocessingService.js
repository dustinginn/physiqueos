import { createHash } from "node:crypto";
import { recoverEvidenceIntakeSubmissionFromArtifacts } from "./EvidenceIntakeService";

export const PENDING_REVIEW_REPROCESS_VERSION = "typed-strength-reconciliation-v4-incline-bench";

export class PendingEvidenceReviewReprocessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PendingEvidenceReviewReprocessError";
    this.code = code;
  }
}

export function createPendingEvidenceReviewReprocessingService({
  repositories,
  now = () => new Date(),
  reinterpret = reinterpretRetainedPackage,
  version = PENDING_REVIEW_REPROCESS_VERSION,
} = {}) {
  return {
    async reprocessPendingReviewInPlace(reviewId) {
      const review = await repositories.evidenceReviews.getReviewById(reviewId);
      assertEligibleReview(review);
      const packageId = review.interpretedEvidence?.package_id;
      const evidencePackage = await repositories.evidencePackages.getEvidencePackageById(packageId);
      if (!evidencePackage) fail("PACKAGE_NOT_FOUND", "The evidence package for this review was not found.");
      if (evidencePackage.package_id !== packageId) fail("PACKAGE_LINK_MISMATCH", "The review and evidence package linkage is inconsistent.");
      assertRetainedSources(evidencePackage);
      await assertNoCanonicalLinkage({ repositories, review, packageId });

      const sourceArtifactFingerprint = fingerprint(evidencePackage.provenance?.source_artifacts);
      const operationId = `reprocess_pending_review_in_place:${review.id}`;
      if (review.reprocessing?.status === "complete" && review.reprocessing.sourceArtifactFingerprint === sourceArtifactFingerprint && review.reprocessing.version === version) {
        return { review, idempotent: true, changed: false };
      }

      const claimedAt = now().toISOString();
      const priorCandidateFingerprint = fingerprint(review.interpretedEvidence);
      await repositories.evidenceReviews.claimPendingReviewReprocess(review.id, {
        operation: "reprocessPendingReviewInPlace", operationId, status: "in_progress", claimedAt,
        sourcePackageId: packageId, sourceArtifactFingerprint, version, priorCandidateFingerprint,
      });

      try {
        const fresh = await reinterpret({ evidencePackage, review });
        assertReproducedCandidate(fresh);
        const interpretedEvidence = preserveCandidateImmutables(review.interpretedEvidence, evidencePackage, fresh);
        const completedAt = now().toISOString();
        const lifecycle = {
          operation: "reprocessPendingReviewInPlace", operationId, status: "complete", claimedAt, completedAt,
          sourcePackageId: packageId, sourceArtifactFingerprint, version, priorCandidateFingerprint,
          resultingCandidateFingerprint: fingerprint(interpretedEvidence),
        };
        const updated = await repositories.evidenceReviews.completePendingReviewReprocess(review.id, {
          interpretedEvidence,
          evidenceTypes: unique((interpretedEvidence.evidence_objects ?? []).map((item) => item.evidence_type)),
          lifecycle,
        });
        return { review: updated, idempotent: false, changed: true };
      } catch (error) {
        const failedAt = now().toISOString();
        await repositories.evidenceReviews.failPendingReviewReprocess(review.id, {
          operation: "reprocessPendingReviewInPlace", operationId, status: "failed", claimedAt, failedAt,
          sourcePackageId: packageId, sourceArtifactFingerprint, version, priorCandidateFingerprint,
          error: { code: error?.code ?? "REPROCESS_FAILED", message: String(error?.message ?? error).slice(0, 300) },
        });
        throw error;
      }
    },
  };
}

async function reinterpretRetainedPackage({ evidencePackage, review }) {
  const artifacts = evidencePackage.provenance?.source_artifacts ?? [];
  const artifactPaths = artifacts.map((item) => item.storage_path).filter(Boolean);
  const typedEvidence = artifacts.find((item) => item.id === "typed_evidence_0" || item.kind === "typed_evidence")?.text ?? null;
  const submissionId = evidencePackage.package_id.replace(/_(?:images|typed|progress_photos)$/, "");
  const result = await recoverEvidenceIntakeSubmissionFromArtifacts({
    artifactPaths,
    evidenceDate: evidencePackage.provenance?.evidence_date ?? evidencePackage.observed_date,
    expectedEvidenceType: evidencePackage.detected_evidence_type ?? "auto",
    submissionId,
    typedEvidence,
    userId: review.userId,
  });
  return result.evidencePackage;
}

function preserveCandidateImmutables(previous, evidencePackage, fresh) {
  return {
    ...fresh,
    package_id: evidencePackage.package_id,
    captured_at: previous?.captured_at ?? evidencePackage.captured_at,
    observed_date: previous?.observed_date ?? evidencePackage.observed_date,
    userId: previous?.userId ?? evidencePackage.userId,
    provenance: structuredClone(evidencePackage.provenance),
    evidence_objects: (fresh.evidence_objects ?? []).map((object) => preserveSourceDerivedObjectFields(object, previous?.evidence_objects)),
  };
}

function preserveSourceDerivedObjectFields(freshObject, previousObjects = []) {
  const prior = previousObjects.find((object) => sameEvidenceIdentity(object, freshObject));
  if (!prior) return freshObject;
  return {
    ...freshObject,
    captured_at: prior.captured_at ?? freshObject.captured_at,
    metadata: structuredClone(prior.metadata ?? freshObject.metadata),
  };
}

function sameEvidenceIdentity(left, right) {
  return left?.evidence_type === right?.evidence_type
    && left?.observed_at === right?.observed_at
    && normalizeIdentity(left?.metadata?.activity_type ?? left?.id) === normalizeIdentity(right?.metadata?.activity_type ?? right?.id);
}

function normalizeIdentity(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function assertEligibleReview(review) {
  if (!review) fail("REVIEW_NOT_FOUND", "Evidence review was not found.");
  if (review.status !== "pending") fail("REVIEW_NOT_PENDING", "Only pending evidence reviews can be reprocessed.");
  const commitStarted = Object.values(review.commitProgress ?? {}).some((step) => step?.status === "completed");
  if (review.confirmation || review.executedAt || review.execution || review.canonicalEvidenceId || review.canonicalEvidenceIds || commitStarted) fail("REVIEW_ALREADY_APPLIED", "This evidence review has already been applied.");
  if (review.reprocessing?.status === "in_progress") fail("REPROCESS_IN_PROGRESS", "This evidence review is already being reprocessed.");
  if (/historical|immutable/i.test(review.source ?? "")) fail("REVIEW_IMMUTABLE", "Historical or immutable evidence reviews cannot be reprocessed in place.");
  if (!review.interpretedEvidence?.package_id) fail("PACKAGE_LINK_MISSING", "The evidence review does not reference an evidence package.");
}

function assertRetainedSources(evidencePackage) {
  const sources = evidencePackage.provenance?.source_artifacts;
  if (!Array.isArray(sources) || sources.length === 0) fail("SOURCE_ARTIFACTS_MISSING", "Retained source artifacts are unavailable.");
  const hasStoredArtifact = sources.some((item) => item.storage_path);
  const hasTypedEvidence = sources.some((item) => item.kind === "typed_evidence" && item.text);
  if (!hasStoredArtifact && !hasTypedEvidence) fail("SOURCE_ARTIFACTS_INSUFFICIENT", "Retained source artifacts cannot reproduce interpretation.");
}

async function assertNoCanonicalLinkage({ repositories, review, packageId }) {
  if (!repositories.canonicalEvidence?.listCanonicalEvidenceObjects) return;
  const objects = await repositories.canonicalEvidence.listCanonicalEvidenceObjects(review.userId);
  if (objects.some((item) => referencesPackage(item, packageId))) fail("CANONICAL_LINK_EXISTS", "Canonical evidence has already been created from this review.");
}

function referencesPackage(value, packageId) {
  return JSON.stringify(value?.provenance ?? value?.source ?? {}).includes(packageId);
}

function assertReproducedCandidate(candidate) {
  if (!candidate || candidate.quality?.status === "failed" || !(candidate.evidence_objects ?? []).length) {
    fail("INTERPRETATION_INCOMPLETE", "The retained evidence could not reproduce a review candidate.");
  }
}

function fingerprint(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function fail(code, message) { throw new PendingEvidenceReviewReprocessError(code, message); }
