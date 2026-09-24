import { createEvidenceReviewPresentation } from "../../domain/services/EvidenceReviewPresentationService.js";
import {
  isHealthKitWorkoutReconciliationReview,
  projectHealthKitWorkoutReconciliationPresentation,
} from "../../domain/services/HealthKitWorkoutReconciliationService.js";

export function createEvidenceReviewReadService({ store } = {}) {
  if (!store?.run) throw new Error("Evidence Review reads require a read store.");

  return Object.freeze({
    getEditContext(reviewId) {
      return store.run("evidence.review.edit-context", async () => {
        const [review, ownerUserId] = await Promise.all([
          store.getReview(reviewId),
          store.getOwnerUserId(),
        ]);
        if (!review || !ownerUserId || review.userId !== ownerUserId) return null;
        return Object.freeze({ review, userId: ownerUserId });
      });
    },
    getReview(reviewId) {
      return store.run("evidence.review.detail", async () => {
        const review = await store.getReview(reviewId);
        if (!review) return null;
        if (isHealthKitWorkoutReconciliationReview(review)) {
          const ownerUserId = await store.getOwnerUserId();
          if (!ownerUserId || review.userId !== ownerUserId) return null;
          const presentation = projectHealthKitWorkoutReconciliationPresentation(review, {
            ownerUserId,
            canonicalWorkoutId: review.canonicalWorkoutId,
          });
          return Object.freeze({
            // Reconciliation records have their own deliberately narrow read
            // contract. Never place raw resolution/history state beside the
            // validated projection where a consumer could bypass it.
            review: Object.freeze({
              id: presentation.id,
              status: presentation.status,
              version: Number(review.version ?? 0),
              createdAt: review.createdAt ?? null,
            }),
            evidencePackage: null,
            canonicalObjects: Object.freeze([]),
            presentation,
          });
        }
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
        const presentation = createEvidenceReviewPresentation({
          evidencePackage: review.interpretedEvidence ?? evidencePackage ?? {},
          itemDecisions: review.itemDecisions ?? {},
        });
        return Object.freeze({ review, evidencePackage, canonicalObjects, presentation });
      });
    },
  });
}
