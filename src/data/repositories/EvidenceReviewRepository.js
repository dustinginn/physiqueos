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
  };
}
