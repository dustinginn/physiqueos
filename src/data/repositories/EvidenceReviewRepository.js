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
