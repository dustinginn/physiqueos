const APPLIED_FIELDS = Object.freeze([
  "confirmation",
  "executedAt",
  "execution",
  "canonicalEvidenceId",
  "canonicalEvidenceIds",
]);

export function resolveEvidenceReviewReprocessEligibility({
  review,
  evidencePackage = review?.interpretedEvidence ?? null,
  canonicalObjects = [],
  now = Date.now(),
} = {}) {
  if (!review) return blocked("REVIEW_NOT_FOUND", "Evidence review was not found.");
  if (review.status !== "pending") {
    return blocked("REVIEW_NOT_PENDING", "Only pending evidence reviews can be reprocessed.");
  }
  if (
    APPLIED_FIELDS.some((field) => hasAppliedValue(review[field])) ||
    Object.keys(review.commitProgress ?? {}).length > 0
  ) {
    return blocked("REVIEW_ALREADY_APPLIED", "This evidence review has already been applied.");
  }
  if (review.reprocessing?.status === "in_progress") {
    return blocked("REPROCESS_IN_PROGRESS", "This evidence review is already being reprocessed.");
  }
  if (hasActiveCommitClaim(review.commitClaim, now)) {
    return blocked("ACTIVE_COMMIT_CLAIM", "This evidence review is currently being saved.");
  }
  if (isExplicitlyImmutable(review)) {
    return blocked("REVIEW_IMMUTABLE", "This evidence review is explicitly immutable.");
  }
  const packageId = review.interpretedEvidence?.package_id;
  if (!packageId) {
    return blocked("PACKAGE_LINK_MISSING", "The evidence review does not reference an evidence package.");
  }
  if (!evidencePackage) {
    return blocked("PACKAGE_NOT_FOUND", "The evidence package for this review was not found.");
  }
  if (evidencePackage.package_id !== packageId) {
    return blocked("PACKAGE_LINK_MISMATCH", "The review and evidence package linkage is inconsistent.");
  }
  const sources = evidencePackage.provenance?.source_artifacts;
  if (!Array.isArray(sources) || sources.length === 0) {
    return blocked("SOURCE_ARTIFACTS_MISSING", "Retained source artifacts are unavailable.");
  }
  const hasStoredArtifact = sources.some((item) => item?.storage_path);
  const hasTypedEvidence = sources.some(
    (item) => item?.kind === "typed_evidence" && item?.text
  );
  if (!hasStoredArtifact && !hasTypedEvidence) {
    return blocked(
      "SOURCE_ARTIFACTS_INSUFFICIENT",
      "Retained source artifacts cannot reproduce interpretation."
    );
  }
  if ((canonicalObjects ?? []).some((item) => referencesPackage(item, packageId))) {
    return blocked(
      "CANONICAL_LINK_EXISTS",
      "Canonical evidence has already been created from this review."
    );
  }
  return Object.freeze({ eligible: true, code: "ELIGIBLE", reason: null });
}

export function referencesEvidencePackage(value, packageId) {
  return referencesPackage(value, packageId);
}

function hasAppliedValue(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function isExplicitlyImmutable(review) {
  return review.immutable === true ||
    review.review_metadata?.immutable === true ||
    review.interpretedEvidence?.review_metadata?.immutable === true;
}

function hasActiveCommitClaim(claim, now) {
  if (claim?.status !== "in_progress") return false;
  const leaseExpiresAt = Date.parse(claim.leaseExpiresAt ?? "");
  return !Number.isFinite(leaseExpiresAt) || leaseExpiresAt > Number(now);
}

function referencesPackage(value, packageId) {
  return JSON.stringify(value?.provenance ?? value?.source ?? {}).includes(packageId);
}

function blocked(code, reason) {
  return Object.freeze({ eligible: false, code, reason });
}
