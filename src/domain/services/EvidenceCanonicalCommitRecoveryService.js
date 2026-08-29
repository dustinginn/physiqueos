import {
  canonicalDefinitionsPendingCreation,
} from "./CanonicalExerciseLibraryService";
import {
  listCanonicalTrainingExerciseIdentities,
} from "../models/trainingExerciseIdentity";

export const CanonicalCommitRecoveryDisposition = Object.freeze({
  ZERO_SIDE_EFFECTS: "zero_side_effects",
  COMMITTED_WITHOUT_PROGRESS: "committed_without_progress",
  DURABLE_PROGRESS: "durable_progress",
  AMBIGUOUS: "ambiguous",
});

export function inspectEvidenceCanonicalCommitRecovery({
  review,
  canonicalEvidenceObjects = [],
  briefingReconciliationWorkItems = [],
  canonicalExerciseIdentities = listCanonicalTrainingExerciseIdentities(),
  now = new Date(),
} = {}) {
  const packageId = packageIdentity(review?.interpretedEvidence);
  const reviewId = String(review?.id ?? "").trim();
  const progress = review?.commitProgress ?? {};
  const canonicalProgress = progress.canonical_commit ?? null;
  if (!reviewId || !packageId || review?.status !== "committing" || review?.confirmation) {
    return ambiguous("COMMIT_RECOVERY_REVIEW_INVALID", { packageId, reviewId });
  }
  if (canonicalProgress?.status === "completed") {
    return proof(CanonicalCommitRecoveryDisposition.DURABLE_PROGRESS, {
      packageId,
      reviewId,
      priorClaim: claimIdentity(review.commitClaim),
    });
  }
  if (Object.keys(progress).some((key) => key !== "canonical_commit")) {
    return ambiguous("COMMIT_RECOVERY_PROGRESS_NONCONTIGUOUS", { packageId, reviewId });
  }
  if (canonicalProgress && !["started", "failed"].includes(canonicalProgress.status)) {
    return ambiguous("COMMIT_RECOVERY_PROGRESS_INVALID", { packageId, reviewId });
  }
  const claim = review.commitClaim ?? null;
  if (!claim || claim.status === "completed") {
    return ambiguous("COMMIT_RECOVERY_CLAIM_INVALID", { packageId, reviewId });
  }
  const expiresAt = Date.parse(claim.leaseExpiresAt ?? "");
  const observedAt = now instanceof Date ? now.getTime() : Date.parse(now);
  if (
    claim.status === "in_progress" &&
    (!Number.isFinite(expiresAt) || !Number.isFinite(observedAt) || expiresAt > observedAt)
  ) {
    return ambiguous("COMMIT_RECOVERY_CLAIM_ACTIVE", { packageId, reviewId });
  }

  const includedObjects = (review.interpretedEvidence?.evidence_objects ?? [])
    .filter((item) => item?.removed !== true);
  if (includedObjects.length === 0) {
    return ambiguous("COMMIT_RECOVERY_PACKAGE_EMPTY", { packageId, reviewId });
  }
  const packageLinked = canonicalEvidenceObjects.filter((record) =>
    (record?.provenance?.evidence_package_ids ?? []).includes(packageId)
  );
  const matches = includedObjects.map((object) => ({
    objectId: object.id,
    canonicalIds: packageLinked
      .filter((record) =>
        (record?.provenance?.contributing_evidence_object_ids ?? [])
          .includes(object.id)
      )
      .map((record) => record.canonicalId)
      .filter(Boolean),
  }));
  const sourceWork = briefingReconciliationWorkItems.filter((item) =>
    item?.sourceEvidencePackageId === packageId || item?.sourceReviewId === reviewId
  );
  const matchedCount = matches.filter((item) => item.canonicalIds.length > 0).length;
  const priorClaim = claimIdentity(claim);

  if (matchedCount === 0 && packageLinked.length === 0 && sourceWork.length === 0) {
    return proof(CanonicalCommitRecoveryDisposition.ZERO_SIDE_EFFECTS, {
      packageId,
      reviewId,
      priorClaim,
      expectedEvidenceObjectCount: includedObjects.length,
    });
  }
  if (matchedCount !== includedObjects.length || matches.some((item) => item.canonicalIds.length !== 1)) {
    return ambiguous("COMMIT_RECOVERY_SIDE_EFFECTS_PARTIAL", {
      packageId,
      reviewId,
      priorClaim,
    });
  }
  const pendingDefinitions = canonicalDefinitionsPendingCreation(
    review.interpretedEvidence
  );
  const canonicalExerciseIds = new Set(
    canonicalExerciseIdentities.map((item) => item.id)
  );
  if (pendingDefinitions.some((definition) => !canonicalExerciseIds.has(definition.id))) {
    return ambiguous("COMMIT_RECOVERY_EXERCISE_SIDE_EFFECT_MISSING", {
      packageId,
      reviewId,
      priorClaim,
    });
  }
  return proof(CanonicalCommitRecoveryDisposition.COMMITTED_WITHOUT_PROGRESS, {
    packageId,
    reviewId,
    priorClaim,
    canonicalEvidenceIds: [...new Set(matches.flatMap((item) => item.canonicalIds))],
  });
}

export function assertCanonicalCommitRecoveryProof(proofValue, review) {
  const packageId = packageIdentity(review?.interpretedEvidence);
  if (
    !proofValue ||
    proofValue.disposition === CanonicalCommitRecoveryDisposition.AMBIGUOUS ||
    proofValue.reviewId !== review?.id ||
    proofValue.packageId !== packageId ||
    proofValue.priorClaim?.operationId !== review?.commitClaim?.operationId ||
    proofValue.priorClaim?.leaseExpiresAt !== review?.commitClaim?.leaseExpiresAt
  ) {
    throw recoveryError(
      proofValue?.reason ?? "COMMIT_RECOVERY_PROOF_INVALID",
      "Interrupted evidence confirmation cannot be recovered safely."
    );
  }
  return true;
}

function proof(disposition, values) {
  return Object.freeze({ disposition, ...values });
}

function ambiguous(reason, values) {
  return proof(CanonicalCommitRecoveryDisposition.AMBIGUOUS, {
    ...values,
    reason,
  });
}

function claimIdentity(claim) {
  return Object.freeze({
    operationId: claim?.operationId ?? null,
    status: claim?.status ?? null,
    claimedAt: claim?.claimedAt ?? null,
    leaseExpiresAt: claim?.leaseExpiresAt ?? null,
  });
}

function packageIdentity(evidencePackage) {
  return String(evidencePackage?.package_id ?? evidencePackage?.id ?? "").trim();
}

function recoveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
