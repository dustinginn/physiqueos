export function createEvidenceReviewRepository(reviews = [], options = {}) {
  return {
    async createReview(review) {
      reviews.push(review);
      options.onChange?.();
      return review;
    },
    async getReviewById(id) {
      return reviews.find((review) => review.id === id) ?? null;
    },
    async listReviews(userId) {
      return reviews.filter((review) => !userId || review.userId === userId);
    },
    async updateReview(id, changes) {
      const index = reviews.findIndex((review) => review.id === id);
      if (index < 0) return null;
      reviews[index] = { ...reviews[index], ...changes, updatedAt: new Date().toISOString() };
      options.onChange?.();
      return reviews[index];
    },
    async updateReviewIfCurrent(id, expectedUpdatedAt, changes) {
      const index = reviews.findIndex((review) => review.id === id);
      if (index < 0) return null;
      if (reviews[index].updatedAt !== expectedUpdatedAt) {
        const error = repositoryError("REVIEW_STALE", "This evidence review changed. Reload it before saving pose selections.");
        throw error;
      }
      reviews[index] = { ...reviews[index], ...structuredClone(changes), updatedAt: new Date().toISOString() };
      options.onChange?.("evidenceReviews");
      return structuredClone(reviews[index]);
    },
    async claimEvidenceReviewCommit(id, lifecycle) {
      const review = reviews.find((item) => item.id === id);
      if (!review) return null;
      const claimTime = Date.parse(lifecycle?.claimedAt ?? "");
      const activeExpiry = Date.parse(review.commitClaim?.leaseExpiresAt ?? "");
      if (
        review.commitClaim?.status === "in_progress" &&
        review.commitClaim.operationId !== lifecycle?.operationId &&
        Number.isFinite(activeExpiry) &&
        activeExpiry > claimTime
      ) {
        throw repositoryError("COMMIT_IN_PROGRESS", "This evidence review confirmation is already running.");
      }
      if (!["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) {
        throw repositoryError("REVIEW_NOT_COMMITTABLE", "This evidence review cannot be committed.");
      }
      const currentPackageId = packageIdentity(review.interpretedEvidence);
      const requestedPackageId = packageIdentity(lifecycle?.evidencePackage) || lifecycle?.packageId;
      if (currentPackageId && requestedPackageId && currentPackageId !== requestedPackageId) {
        throw repositoryError("COMMIT_PACKAGE_MISMATCH", "The evidence review package changed before confirmation.");
      }
      const resuming = review.status === "committing";
      if (resuming) assertResumableProgress(review.commitProgress);
      review.status = "committing";
      review.commitError = null;
      if (!resuming && lifecycle?.evidencePackage) {
        review.interpretedEvidence = structuredClone(lifecycle.evidencePackage);
      } else if (lifecycle?.evidencePackage && !currentPackageId) {
        review.interpretedEvidence = structuredClone(lifecycle.evidencePackage);
      }
      review.commitClaim = structuredClone({
        operationId: lifecycle.operationId,
        status: "in_progress",
        claimedAt: lifecycle.claimedAt,
        leaseExpiresAt: lifecycle.leaseExpiresAt,
        packageId: requestedPackageId ?? currentPackageId ?? null,
      });
      review.updatedAt = lifecycle.claimedAt;
      options.onChange?.("evidenceReviews");
      return structuredClone(review);
    },
    async recordEvidenceReviewCommitProgress(id, { operationId, key, value, leaseExpiresAt }) {
      const review = reviews.find((item) => item.id === id);
      assertActiveCommit(review, operationId);
      review.commitProgress = {
        ...(review.commitProgress ?? {}),
        [key]: structuredClone(value),
      };
      review.commitClaim = { ...review.commitClaim, leaseExpiresAt };
      review.updatedAt = new Date().toISOString();
      options.onChange?.("evidenceReviews");
      return structuredClone(review);
    },
    async releaseEvidenceReviewCommit(id, { operationId, releasedAt }) {
      const review = reviews.find((item) => item.id === id);
      assertActiveCommit(review, operationId);
      review.commitClaim = {
        ...review.commitClaim,
        status: "available",
        releasedAt,
        leaseExpiresAt: releasedAt,
      };
      review.updatedAt = releasedAt;
      options.onChange?.("evidenceReviews");
      return structuredClone(review);
    },
    async completeEvidenceReviewCommit(id, { operationId, confirmation, interpretedEvidence }) {
      const review = reviews.find((item) => item.id === id);
      assertActiveCommit(review, operationId);
      assertCompleteProgress(review.commitProgress);
      review.status = "confirmed";
      review.interpretedEvidence = structuredClone(interpretedEvidence ?? review.interpretedEvidence);
      review.confirmation = structuredClone(confirmation);
      review.commitClaim = {
        ...review.commitClaim,
        status: "completed",
        completedAt: confirmation.confirmedAt,
        leaseExpiresAt: confirmation.confirmedAt,
      };
      review.updatedAt = confirmation.confirmedAt;
      options.onChange?.("evidenceReviews");
      return structuredClone(review);
    },
    async failEvidenceReviewCommit(id, { operationId, error, failedAt }) {
      const review = reviews.find((item) => item.id === id);
      assertActiveCommit(review, operationId);
      const completed = Object.values(review.commitProgress ?? {})
        .some((item) => item?.status === "completed");
      review.status = completed ? "partially_committed" : "commit_failed";
      review.commitError = String(error);
      review.commitClaim = {
        ...review.commitClaim,
        status: "failed",
        failedAt,
        leaseExpiresAt: failedAt,
      };
      review.updatedAt = failedAt;
      options.onChange?.("evidenceReviews");
      return structuredClone(review);
    },
    async claimPendingReviewReprocess(id, lifecycle) {
      const review = reviews.find((item) => item.id === id);
      if (!review) return null;
      if (review.status !== "pending") throw repositoryError("REVIEW_NOT_PENDING", "Only pending evidence reviews can be reprocessed.");
      if (review.reprocessing?.status === "in_progress") throw repositoryError("REPROCESS_IN_PROGRESS", "This evidence review is already being reprocessed.");
      review.reprocessing = structuredClone(lifecycle);
      review.updatedAt = new Date().toISOString();
      options.onChange?.("evidenceReviews");
      return review;
    },
    async completePendingReviewReprocess(id, { interpretedEvidence, evidenceTypes, lifecycle }) {
      const review = reviews.find((item) => item.id === id);
      assertActiveReprocess(review, lifecycle?.operationId);
      review.interpretedEvidence = structuredClone(interpretedEvidence);
      review.evidenceTypes = [...evidenceTypes];
      review.reprocessing = structuredClone(lifecycle);
      review.updatedAt = new Date().toISOString();
      options.onChange?.("evidenceReviews");
      return review;
    },
    async failPendingReviewReprocess(id, lifecycle) {
      const review = reviews.find((item) => item.id === id);
      assertActiveReprocess(review, lifecycle?.operationId);
      review.reprocessing = structuredClone(lifecycle);
      review.updatedAt = new Date().toISOString();
      options.onChange?.("evidenceReviews");
      return review;
    },
  };
}

function assertActiveCommit(review, operationId) {
  if (!review) throw repositoryError("REVIEW_NOT_FOUND", "Evidence review was not found.");
  if (review.status !== "committing") {
    throw repositoryError("REVIEW_NOT_COMMITTING", "Evidence review confirmation is not active.");
  }
  if (review.commitClaim?.status !== "in_progress" || review.commitClaim.operationId !== operationId) {
    throw repositoryError("COMMIT_CLAIM_LOST", "The evidence review confirmation claim is no longer active.");
  }
}

function assertResumableProgress(progress) {
  if (!progress || typeof progress !== "object" || Object.keys(progress).length === 0) {
    throw repositoryError("COMMIT_PROGRESS_INVALID", "Interrupted evidence confirmation has no durable progress.");
  }
}

function assertCompleteProgress(progress) {
  assertResumableProgress(progress);
  const required = [
    "canonical_commit", "compatibility_writes", "scheduled_completion", "analysis",
    "training_performance_events", "goal_evaluation", "event_eligibility", "briefing",
    "home_refresh",
  ];
  if (!required.every((step) => progress[step]?.status === "completed")) {
    throw repositoryError("COMMIT_PROGRESS_INCOMPLETE", "Evidence confirmation still has unfinished steps.");
  }
}

function packageIdentity(evidencePackage) {
  return String(evidencePackage?.package_id ?? evidencePackage?.id ?? "").trim();
}

function assertActiveReprocess(review, operationId) {
  if (!review) throw repositoryError("REVIEW_NOT_FOUND", "Evidence review was not found.");
  if (review.status !== "pending") throw repositoryError("REVIEW_NOT_PENDING", "Only pending evidence reviews can be reprocessed.");
  if (review.reprocessing?.status !== "in_progress" || review.reprocessing.operationId !== operationId) {
    throw repositoryError("REPROCESS_CLAIM_LOST", "The evidence review reprocessing claim is no longer active.");
  }
}

function repositoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
