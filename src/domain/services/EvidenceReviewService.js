export function createEvidenceReviewService({ repositories, now = () => new Date() }) {
  return {
    async stage({ userId, evidencePackage, source = "universal_intake" }) {
      const timestamp = now().toISOString();
      const id = `evidence_review_${timestamp.replace(/\D/g, "")}`;
      const review = {
        id, userId, source, status: "pending", createdAt: timestamp, updatedAt: timestamp,
        interpretedEvidence: evidencePackage,
        evidenceTypes: unique((evidencePackage?.evidence_objects ?? []).map((item) => item.evidence_type)),
        confirmation: null,
        commitProgress: {},
        itemDecisions: {},
      };
      return repositories.evidenceReviews.createReview(review);
    },
    async confirm(id, { evidencePackage, confirmedBy } = {}) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) throw new Error("This evidence review is no longer pending.");
      const timestamp = now().toISOString();
      return repositories.evidenceReviews.updateReview(id, {
        status: "confirmed",
        interpretedEvidence: evidencePackage ?? review.interpretedEvidence,
        confirmation: { confirmedAt: timestamp, confirmedBy },
      });
    },
    async beginCommit(id) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed"].includes(review.status)) throw new Error("This evidence review cannot be committed.");
      return repositories.evidenceReviews.updateReview(id, { status: "committing", commitError: null });
    },
    async failCommit(id, error) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      const completed = Object.values(review?.commitProgress ?? {}).some((item) => item?.status === "completed");
      return repositories.evidenceReviews.updateReview(id, { status: completed ? "partially_committed" : "commit_failed", commitError: String(error?.message ?? error) });
    },
    async recordCommitProgress(id, key, value) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      return repositories.evidenceReviews.updateReview(id, { commitProgress: { ...(review?.commitProgress ?? {}), [key]: value } });
    },
    async setItemDecision(id, { itemId, included, decidedBy }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed"].includes(review.status)) throw new Error("This evidence review cannot be edited.");
      if (!(review.interpretedEvidence?.evidence_objects ?? []).some((item) => item.id === itemId)) throw new Error("Evidence review item is unavailable.");
      return repositories.evidenceReviews.updateReview(id, {
        itemDecisions: { ...(review.itemDecisions ?? {}), [itemId]: { included: Boolean(included), decidedAt: now().toISOString(), decidedBy } },
      });
    },
    async discard(id, { confirmedBy } = {}) {
      const timestamp = now().toISOString();
      return repositories.evidenceReviews.updateReview(id, {
        status: "discarded", confirmation: { confirmedAt: timestamp, confirmedBy },
      });
    },
  };
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
