import {
  CanonicalProgressPhotoCategories,
  normalizeProgressPhotoCategory,
} from "../models/progressPhotoPoseVocabulary";
import {
  assertNoUnresolvedProvisionalExercises,
  createCanonicalExerciseDefinition,
  findCanonicalExerciseConflict,
  resolveProvisionalExerciseInPackage,
} from "./CanonicalExerciseLibraryService";
import { listCanonicalTrainingExerciseIdentities } from "../models/trainingExerciseIdentity";
import { normalizeTrainingExecutionVariant } from "../models/trainingExecutionVariant";

export function createEvidenceReviewService({ repositories, now = () => new Date() }) {
  return {
    async stage({ userId, evidencePackage, source = "universal_intake" }) {
      const timestamp = now().toISOString();
      const id = `evidence_review_${timestamp.replace(/\D/g, "")}`;
      const evidenceObjects = evidencePackage?.evidence_objects ?? [];
      const evidenceTypes = unique(evidenceObjects.map((item) => item.evidence_type));
      const interpretedEvidence = {
        ...evidencePackage,
        diagnostics: {
          ...(evidencePackage?.diagnostics ?? {}),
          stages: [
            ...(evidencePackage?.diagnostics?.stages ?? []),
            {
              id: `${id}_review_composition`,
              label: "Evidence Review composition",
              preparedSaveCommandCount: evidenceObjects.length,
              reviewCandidateCount: evidenceObjects.length,
              reviewCategoryList: evidenceTypes,
            },
          ],
          warnings: evidencePackage?.diagnostics?.warnings ?? [],
        },
      };
      const review = {
        id, userId, source, status: "pending", createdAt: timestamp, updatedAt: timestamp,
        interpretedEvidence,
        evidenceTypes,
        confirmation: null,
        commitProgress: {},
        itemDecisions: {},
      };
      return repositories.evidenceReviews.createReview(review);
    },
    async confirm(id, { evidencePackage, confirmedBy } = {}) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) throw new Error("This evidence review is no longer pending.");
      assertNoUnresolvedProvisionalExercises(evidencePackage ?? review.interpretedEvidence);
      const timestamp = now().toISOString();
      return repositories.evidenceReviews.updateReview(id, {
        status: "confirmed",
        interpretedEvidence: evidencePackage ?? review.interpretedEvidence,
        confirmation: { confirmedAt: timestamp, confirmedBy },
      });
    },
    async beginCommit(id, { evidencePackage } = {}) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed"].includes(review.status)) throw new Error("This evidence review cannot be committed.");
      assertNoUnresolvedProvisionalExercises(
        evidencePackage ?? review.interpretedEvidence
      );
      return repositories.evidenceReviews.updateReview(id, {
        status: "committing",
        commitError: null,
        interpretedEvidence: evidencePackage ?? review.interpretedEvidence,
      });
    },
    async resolveProvisionalExercise(id, {
      expectedUpdatedAt,
      provisionalExerciseId,
      mode,
      canonicalExerciseId,
      definition,
      updatedBy,
    }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed"].includes(review.status)) {
        throw reviewError("EXERCISE_REVIEW_NOT_EDITABLE", "This exercise review cannot be edited.");
      }
      if (!expectedUpdatedAt || review.updatedAt !== expectedUpdatedAt) {
        throw reviewError("REVIEW_STALE", "This evidence review changed. Reload it before resolving the exercise.");
      }
      let canonical;
      if (mode === "existing") {
        canonical = listCanonicalTrainingExerciseIdentities().find(
          (candidate) => candidate.id === canonicalExerciseId
        );
        if (!canonical) {
          throw reviewError("CANONICAL_EXERCISE_UNAVAILABLE", "Choose an existing exercise.");
        }
      } else if (mode === "new") {
        canonical = createCanonicalExerciseDefinition({
          ...definition,
          createdAt: now().toISOString(),
        });
        const conflict = findCanonicalExerciseConflict(canonical);
        if (conflict) {
          throw reviewError(
            "CANONICAL_EXERCISE_DUPLICATE",
            `"${canonical.name}" matches "${conflict.name}". Map to the existing exercise instead.`
          );
        }
      } else if (mode !== "remove") {
        throw reviewError("EXERCISE_RESOLUTION_INVALID", "Choose how to resolve this exercise.");
      }
      const interpretedEvidence = resolveProvisionalExerciseInPackage(
        review.interpretedEvidence,
        provisionalExerciseId,
        { mode, canonical }
      );
      if (typeof repositories.evidenceReviews.updateReviewIfCurrent !== "function") {
        throw reviewError("REVIEW_STALE_PROTECTION_UNAVAILABLE", "Exercise editing is temporarily unavailable.");
      }
      return repositories.evidenceReviews.updateReviewIfCurrent(id, expectedUpdatedAt, {
        interpretedEvidence,
        exerciseResolutionEditing: {
          updatedAt: now().toISOString(),
          updatedBy,
        },
      });
    },
    async updateTrainingExecutionVariant(id, {
      evidenceObjectId,
      exerciseIndex,
      expectedUpdatedAt,
      mode,
      rawLabel,
      updatedBy,
    }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed"].includes(review.status)) {
        throw reviewError("EXERCISE_REVIEW_NOT_EDITABLE", "This exercise review cannot be edited.");
      }
      if (!expectedUpdatedAt || review.updatedAt !== expectedUpdatedAt) {
        throw reviewError("REVIEW_STALE", "This evidence review changed. Reload it before editing the variant.");
      }
      const normalizedIndex = Number(exerciseIndex);
      const executionVariant = mode === "remove"
        ? null
        : normalizeTrainingExecutionVariant(rawLabel);
      if (mode !== "remove" && !executionVariant) {
        throw reviewError("EXECUTION_VARIANT_INVALID", "Enter a valid execution variant.");
      }
      let matched = 0;
      const interpretedEvidence = {
        ...review.interpretedEvidence,
        evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
          if (object.id !== evidenceObjectId || object.evidence_type !== "training") return object;
          return {
            ...object,
            exercises: (object.exercises ?? []).map((exercise, index) => {
              if (index !== normalizedIndex) return exercise;
              if (!exercise.canonicalExerciseId) {
                throw reviewError("CANONICAL_EXERCISE_UNAVAILABLE", "Resolve the base exercise before editing its variant.");
              }
              matched += 1;
              if (executionVariant) return { ...exercise, executionVariant };
              const { executionVariant: _removed, ...ordinaryExercise } = exercise;
              return ordinaryExercise;
            }),
          };
        }),
      };
      if (matched !== 1) {
        throw reviewError("EXERCISE_OCCURRENCE_UNAVAILABLE", "The selected exercise occurrence is no longer available.");
      }
      if (typeof repositories.evidenceReviews.updateReviewIfCurrent !== "function") {
        throw reviewError("REVIEW_STALE_PROTECTION_UNAVAILABLE", "Exercise editing is temporarily unavailable.");
      }
      return repositories.evidenceReviews.updateReviewIfCurrent(id, expectedUpdatedAt, {
        interpretedEvidence,
        exerciseVariantEditing: { updatedAt: now().toISOString(), updatedBy },
      });
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
