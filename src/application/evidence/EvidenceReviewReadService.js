export function createEvidenceReviewReadService({ store } = {}) {
  if (!store?.run) throw new Error("Evidence Review reads require a read store.");

  return Object.freeze({
    getReview(reviewId) {
      return store.run("evidence.review.detail", async () => {
        const review = await store.getReview(reviewId);
        if (!review) return null;
        const packageId = review.interpretedEvidence?.package_id ?? null;
        const nutritionDates = [...new Set(
          (review.interpretedEvidence?.evidence_objects ?? [])
            .filter((item) => item?.evidence_type === "nutrition")
            .map((item) => String(item.observed_at ?? item.date ?? "").slice(0, 10))
            .filter(Boolean),
        )];
        const [evidencePackage, canonicalObjects] = await Promise.all([
          store.getPackage(packageId),
          store.listRelevantCanonicalObjects({ packageId, nutritionDates }),
        ]);
        return Object.freeze({ review, evidencePackage, canonicalObjects });
      });
    },
  });
}
