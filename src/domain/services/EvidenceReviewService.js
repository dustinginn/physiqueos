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
import {
  createTrainingExerciseRelationshipGroup,
  normalizeTrainingExerciseRelationshipGroups,
} from "../models/trainingExerciseRelationship";
import { normalizeReviewedPhotoSessionMetadata } from "./PhotoSessionMetadataService";
import { applyDexaReviewMeasurements } from "./DexaPdfIntakeService";
import { POST_CONFIRMATION_STEP_ORDER } from "./PostConfirmationOrchestrator";
import {
  assertCanonicalCommitRecoveryProof,
  inspectEvidenceCanonicalCommitRecovery,
} from "./EvidenceCanonicalCommitRecoveryService";

const COMMIT_LEASE_MS = 10 * 60 * 1000;

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
    async confirm(id, { evidencePackage, confirmedBy, operationId } = {}) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) throw new Error("This evidence review is no longer pending.");
      assertNoUnresolvedProvisionalExercises(evidencePackage ?? review.interpretedEvidence);
      assertNoTrainingStructureReviewIssues(evidencePackage ?? review.interpretedEvidence);
      const timestamp = now().toISOString();
      if (typeof repositories.evidenceReviews.completeEvidenceReviewCommit === "function") {
        assertCommitProgressComplete(review.commitProgress);
        return repositories.evidenceReviews.completeEvidenceReviewCommit(id, {
          operationId,
          interpretedEvidence: evidencePackage ?? review.interpretedEvidence,
          confirmation: { confirmedAt: timestamp, confirmedBy },
        });
      }
      return repositories.evidenceReviews.updateReview(id, {
        status: "confirmed",
        interpretedEvidence: evidencePackage ?? review.interpretedEvidence,
        confirmation: { confirmedAt: timestamp, confirmedBy },
      });
    },
    async inspectCommitRecovery(review, { canonicalEvidenceObjects = null,
      briefingReconciliationWorkItems = null } = {}) {
      return inspectEvidenceCanonicalCommitRecovery({
        review,
        canonicalEvidenceObjects: canonicalEvidenceObjects ??
          await repositories.canonicalEvidence.listCanonicalEvidenceObjects(review.userId),
        briefingReconciliationWorkItems: briefingReconciliationWorkItems ??
          await repositories.briefingReconciliationWorkItems.listWorkItems(review.userId),
        now: now(),
      });
    },
    async beginCommit(id, { evidencePackage, operationId, recoveryProof = null,
      reviewSnapshot = null } = {}) {
      const review = reviewSnapshot ??
        await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) throw new Error("This evidence review cannot be committed.");
      if (review.status === "committing") {
        const requiresFirstStepRecovery =
          review.commitProgress?.canonical_commit?.status !== "completed";
        if (requiresFirstStepRecovery) {
          assertCanonicalCommitRecoveryProof(recoveryProof, review);
        }
        assertResumableCommitProgress(review.commitProgress, {
          allowFirstStepRecovery: requiresFirstStepRecovery,
        });
      }
      assertNoUnresolvedProvisionalExercises(
        evidencePackage ?? review.interpretedEvidence
      );
      assertNoTrainingStructureReviewIssues(
        evidencePackage ?? review.interpretedEvidence
      );
      const claimedAt = now().toISOString();
      const resolvedOperationId = operationId || `evidence-confirmation:${id}:${claimedAt}`;
      if (typeof repositories.evidenceReviews.claimEvidenceReviewCommit === "function") {
        return repositories.evidenceReviews.claimEvidenceReviewCommit(id, {
          operationId: resolvedOperationId,
          claimedAt,
          leaseExpiresAt: new Date(Date.parse(claimedAt) + COMMIT_LEASE_MS).toISOString(),
          packageId: packageIdentity(evidencePackage ?? review.interpretedEvidence),
          evidencePackage: review.status === "committing" ? null : evidencePackage,
          recoveryProof,
        });
      }
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
    async updateTrainingExerciseRelationship(id, {
      evidenceObjectId,
      expectedUpdatedAt,
      memberExerciseIds = [],
      mode,
      relationshipGroupId = null,
      structuralIssueId = null,
      updatedBy,
    }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed"].includes(review.status)) {
        throw reviewError("EXERCISE_REVIEW_NOT_EDITABLE", "This exercise review cannot be edited.");
      }
      if (!expectedUpdatedAt || review.updatedAt !== expectedUpdatedAt) {
        throw reviewError("REVIEW_STALE", "This evidence review changed. Reload it before editing the Superset.");
      }
      let matched = 0;
      const interpretedEvidence = {
        ...review.interpretedEvidence,
        evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
          if (object.id !== evidenceObjectId || object.evidence_type !== "training") {
            return object;
          }
          matched += 1;
          const currentGroups = object.exerciseRelationshipGroups ?? [];
          const remainingGroups = currentGroups.filter(
            (group) => group.id !== relationshipGroupId
          );
          let nextGroups = remainingGroups;
          if (mode === "save") {
            const members = [...new Set(memberExerciseIds.map(String).filter(Boolean))];
            if (members.length !== 2) {
              throw reviewError(
                "SUPERSET_MEMBERS_INVALID",
                "Choose two distinct exercise occurrences for this Superset."
              );
            }
            const sourceRef = object.provenance?.source_artifact_refs?.[0] ?? "unknown";
            nextGroups = [
              ...remainingGroups,
              createTrainingExerciseRelationshipGroup({
                id: relationshipGroupId || null,
                relationshipType: "superset",
                memberExerciseIds: members,
                provenance_ref: sourceRef,
                provenance: { source_artifact_refs: [sourceRef] },
              }),
            ];
          } else if (!["remove", "dismiss_issue"].includes(mode)) {
            throw reviewError("SUPERSET_EDIT_INVALID", "Choose how to update this Superset.");
          }
          const normalizedGroups = normalizeTrainingExerciseRelationshipGroups(
            nextGroups,
            { exercises: object.exercises, strict: true }
          );
          const structuralReviewIssues = (object.structuralReviewIssues ?? []).filter(
            (issue) => issue.id !== structuralIssueId
          );
          return {
            ...object,
            exerciseRelationshipGroups: normalizedGroups,
            structuralReviewIssues,
          };
        }),
      };
      if (matched !== 1) {
        throw reviewError("TRAINING_SESSION_UNAVAILABLE", "The selected workout is no longer available.");
      }
      if (typeof repositories.evidenceReviews.updateReviewIfCurrent !== "function") {
        throw reviewError("REVIEW_STALE_PROTECTION_UNAVAILABLE", "Superset editing is temporarily unavailable.");
      }
      return repositories.evidenceReviews.updateReviewIfCurrent(id, expectedUpdatedAt, {
        interpretedEvidence,
        exerciseRelationshipEditing: {
          updatedAt: now().toISOString(),
          updatedBy,
        },
      });
    },
    async failCommit(id, error, { operationId } = {}) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      const completed = Object.values(review?.commitProgress ?? {}).some((item) => item?.status === "completed");
      if (typeof repositories.evidenceReviews.failEvidenceReviewCommit === "function") {
        return repositories.evidenceReviews.failEvidenceReviewCommit(id, {
          operationId,
          error: String(error?.message ?? error),
          failedAt: now().toISOString(),
        });
      }
      return repositories.evidenceReviews.updateReview(id, { status: completed ? "partially_committed" : "commit_failed", commitError: String(error?.message ?? error) });
    },
    async recordCommitProgress(id, key, value, { operationId } = {}) {
      if (!POST_CONFIRMATION_STEP_ORDER.includes(key)) {
        throw reviewError("COMMIT_PROGRESS_INVALID", `Unknown evidence confirmation step: ${key}.`);
      }
      if (typeof repositories.evidenceReviews.recordEvidenceReviewCommitProgress === "function") {
        return repositories.evidenceReviews.recordEvidenceReviewCommitProgress(id, {
          operationId,
          key,
          value,
          leaseExpiresAt: new Date(now().getTime() + COMMIT_LEASE_MS).toISOString(),
        });
      }
      const review = await repositories.evidenceReviews.getReviewById(id);
      return repositories.evidenceReviews.updateReview(id, { commitProgress: { ...(review?.commitProgress ?? {}), [key]: value } });
    },
    async pauseCommit(id, { operationId } = {}) {
      if (typeof repositories.evidenceReviews.releaseEvidenceReviewCommit !== "function") return null;
      return repositories.evidenceReviews.releaseEvidenceReviewCommit(id, {
        operationId,
        releasedAt: now().toISOString(),
      });
    },
    async setItemDecision(id, { itemId, included, decidedBy }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed", "partially_committed"].includes(review.status)) throw new Error("This evidence review cannot be edited.");
      if (!(review.interpretedEvidence?.evidence_objects ?? []).some((item) => item.id === itemId)) throw new Error("Evidence review item is unavailable.");
      return repositories.evidenceReviews.updateReview(id, {
        itemDecisions: { ...(review.itemDecisions ?? {}), [itemId]: { included: Boolean(included), decidedAt: now().toISOString(), decidedBy } },
      });
    },
    async setDexaMeasurements(id, {
      evidenceObjectId,
      expectedUpdatedAt,
      measurements,
      updatedBy,
    }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed"].includes(review.status)) {
        throw reviewError("DEXA_REVIEW_NOT_EDITABLE", "This DEXA review cannot be edited.");
      }
      if (!expectedUpdatedAt || review.updatedAt !== expectedUpdatedAt) {
        throw reviewError("REVIEW_STALE", "This evidence review changed. Reload it before saving DEXA corrections.");
      }
      let matched = 0;
      const interpretedEvidence = {
        ...review.interpretedEvidence,
        evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
          if (object.id !== evidenceObjectId || !["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type)) return object;
          matched += 1;
          return applyDexaReviewMeasurements(object, measurements);
        }),
      };
      if (matched !== 1) throw reviewError("DEXA_EVIDENCE_UNAVAILABLE", "The DEXA scan is no longer available in this review.");
      if (typeof repositories.evidenceReviews.updateReviewIfCurrent !== "function") {
        throw reviewError("REVIEW_STALE_PROTECTION_UNAVAILABLE", "DEXA correction is temporarily unavailable.");
      }
      return repositories.evidenceReviews.updateReviewIfCurrent(id, expectedUpdatedAt, {
        interpretedEvidence,
        dexaMeasurementEditing: { updatedAt: now().toISOString(), updatedBy },
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
    async setPhotoSessionMetadata(id, {
      evidenceObjectId,
      expectedUpdatedAt,
      goalId,
      timeOfDay,
      updatedBy,
    }) {
      const review = await repositories.evidenceReviews.getReviewById(id);
      if (!review || !["pending", "commit_failed"].includes(review.status)) {
        throw reviewError("PHOTO_REVIEW_NOT_EDITABLE", "This photo review cannot be edited.");
      }
      if (!expectedUpdatedAt || review.updatedAt !== expectedUpdatedAt) {
        throw reviewError("REVIEW_STALE", "This evidence review changed. Reload it before saving session details.");
      }
      let matched = 0;
      const interpretedEvidence = {
        ...review.interpretedEvidence,
        evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
          if (object.id !== evidenceObjectId || object.evidence_type !== "photo_session") return object;
          matched += 1;
          const normalized = normalizeReviewedPhotoSessionMetadata({
            goalId,
            goalOptions: object.goalRelationship?.options ?? [],
            timeOfDay,
          });
          return {
            ...object,
            captureMetadata: object.captureMetadata?.status === "inferred"
              ? { ...object.captureMetadata, reviewed: true }
              : normalized.captureMetadata,
            conditions: {
              ...(object.conditions ?? {}),
              timeOfDay: normalized.captureMetadata.timeOfDay,
            },
            goalRelationship: object.goalRelationship?.status === "resolved"
              ? { ...object.goalRelationship, reviewed: true }
              : normalized.goalRelationship,
          };
        }),
      };
      if (matched !== 1) throw reviewError("PHOTO_SESSION_UNAVAILABLE", "The photo session is no longer available.");
      if (typeof repositories.evidenceReviews.updateReviewIfCurrent !== "function") {
        throw reviewError("REVIEW_STALE_PROTECTION_UNAVAILABLE", "Photo session editing is temporarily unavailable.");
      }
      return repositories.evidenceReviews.updateReviewIfCurrent(id, expectedUpdatedAt, {
        interpretedEvidence,
        photoSessionMetadataEditing: { updatedAt: now().toISOString(), updatedBy },
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
function reviewError(code, message) { const error = new Error(message); error.code = code; return error; }

function packageIdentity(evidencePackage) {
  return String(evidencePackage?.package_id ?? evidencePackage?.id ?? "").trim();
}

export function assertResumableCommitProgress(progress, {
  allowFirstStepRecovery = false,
} = {}) {
  if (!progress || typeof progress !== "object") {
    throw reviewError("COMMIT_PROGRESS_INVALID", "Interrupted evidence confirmation has no durable progress.");
  }
  const keys = Object.keys(progress);
  if (
    (!allowFirstStepRecovery && keys.length === 0) ||
    keys.some((key) => !POST_CONFIRMATION_STEP_ORDER.includes(key))
  ) {
    throw reviewError("COMMIT_PROGRESS_INVALID", "Interrupted evidence confirmation progress is invalid.");
  }
  let incompleteSeen = false;
  for (const step of POST_CONFIRMATION_STEP_ORDER) {
    const status = progress[step]?.status;
    if (status === "completed") {
      if (incompleteSeen) {
        throw reviewError("COMMIT_PROGRESS_INVALID", "Interrupted evidence confirmation progress is not contiguous.");
      }
      continue;
    }
    incompleteSeen = true;
    if (status && !["failed", "started"].includes(status)) {
      throw reviewError("COMMIT_PROGRESS_INVALID", "Interrupted evidence confirmation progress has an unknown status.");
    }
  }
  if (
    progress.canonical_commit?.status !== "completed" &&
    !(
      allowFirstStepRecovery &&
      keys.every((key) => key === "canonical_commit") &&
      [undefined, "started", "failed"].includes(progress.canonical_commit?.status)
    )
  ) {
    throw reviewError("COMMIT_PROGRESS_INVALID", "Interrupted evidence confirmation has no durable canonical commit.");
  }
  return true;
}

function assertCommitProgressComplete(progress) {
  assertResumableCommitProgress(progress);
  if (!POST_CONFIRMATION_STEP_ORDER.every((step) => progress[step]?.status === "completed")) {
    throw reviewError("COMMIT_PROGRESS_INCOMPLETE", "Evidence confirmation still has unfinished steps.");
  }
}

function assertNoTrainingStructureReviewIssues(evidencePackage = {}) {
  const issueCount = (evidencePackage.evidence_objects ?? [])
    .filter((object) => object.evidence_type === "training" && !object.removed)
    .reduce(
      (count, object) => count + (object.structuralReviewIssues ?? []).length,
      0
    );
  if (issueCount > 0) {
    throw reviewError(
      "TRAINING_STRUCTURE_REVIEW_REQUIRED",
      "Resolve or remove the remaining Training structure review issues before saving."
    );
  }
}
