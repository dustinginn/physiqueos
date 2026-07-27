import {
  CanonicalProgressPhotoCategories,
  normalizeProgressPhotoCategory,
} from "../models/progressPhotoPoseVocabulary";

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
    async setPhotoPose(id, {
      expectedUpdatedAt,
      photoId,
      poseId,
      sourceArtifactRef,
      updatedBy,
    }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed"].includes(review.status)) {
        throw reviewError("PHOTO_REVIEW_NOT_EDITABLE", "This photo review cannot be edited.");
      }
      if (!expectedUpdatedAt || review.updatedAt !== expectedUpdatedAt) {
        throw reviewError("REVIEW_STALE", "This evidence review changed. Reload it before saving pose selections.");
      }
      const category = CanonicalProgressPhotoCategories.find((item) => item.id === poseId);
      if (!category) throw reviewError("PHOTO_POSE_INVALID", "Choose a valid photo pose.");
      let matched = 0;
      const interpretedEvidence = {
        ...review.interpretedEvidence,
        evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
          if (object.evidence_type !== "photo_session") return object;
          return {
            ...object,
            photos: (object.photos ?? []).map((photo) => {
              const samePhoto = photo.id === photoId &&
                (!sourceArtifactRef || photo.source_artifact_ref === sourceArtifactRef);
              if (!samePhoto) return photo;
              matched += 1;
              return {
                ...photo,
                ...normalizeProgressPhotoCategory({ ...photo, ...category, poseId: category.id }),
                source_artifact_ref: photo.source_artifact_ref,
                identityStatus: "confirmed",
                userConfirmedIdentity: true,
              };
            }),
          };
        }),
      };
      if (matched !== 1) {
        throw reviewError("PHOTO_ARTIFACT_UNAVAILABLE", "The selected photo is no longer available in this review.");
      }
      const update = {
        interpretedEvidence,
        photoPoseEditing: {
          updatedAt: now().toISOString(),
          updatedBy,
        },
      };
      if (typeof repositories.evidenceReviews.updateReviewIfCurrent !== "function") {
        throw reviewError("REVIEW_STALE_PROTECTION_UNAVAILABLE", "Photo pose editing is temporarily unavailable.");
      }
      return repositories.evidenceReviews.updateReviewIfCurrent(id, expectedUpdatedAt, update);
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
function reviewError(code, message) { const error = new Error(message); error.code = code; return error; }
