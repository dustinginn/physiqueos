import {
  FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT,
  getFounderAlphaPhotoSessionCompletion,
  getProgressPhotoCategoryId,
} from "./progressPhotoPoseVocabulary";

export const PhotoConditionValue = Object.freeze({
  FALSE: false,
  TRUE: true,
  UNKNOWN: "unknown",
});

export function normalizePhotoCondition(value, provenance = {}) {
  const normalized = value === true || value === false ? value : PhotoConditionValue.UNKNOWN;
  return {
    confidence: normalized === "unknown" ? "unknown" : provenance.confidence ?? "high",
    source: provenance.source ?? (normalized === "unknown" ? "not_provided" : "user"),
    userConfirmed: provenance.userConfirmed ?? false,
    value: normalized,
  };
}

export function createCanonicalPhotoSession({ photos = [], ...data } = {}) {
  const completion = getFounderAlphaPhotoSessionCompletion(photos);
  const activePhotoIdsByPose = {};
  const duplicateRetrySourceReferences = [];

  photos.forEach((photo) => {
    const poseId = getProgressPhotoCategoryId(photo);
    if (["duplicate", "superseded", "inactive"].includes(photo.status)) {
      duplicateRetrySourceReferences.push(...(photo.sourceIds ?? []));
      return;
    }
    if (poseId !== "unknown" && !activePhotoIdsByPose[poseId]) {
      activePhotoIdsByPose[poseId] = photo.canonicalPhotoId ?? photo.id;
    }
  });

  return {
    ...data,
    activePhotoIdsByPose,
    completionState: completion.complete ? "complete" : "incomplete",
    duplicateRetrySourceReferences: [...new Set(duplicateRetrySourceReferences)],
    expectedPoseContract: FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT,
    missingPoses: completion.missingPoseIds,
    photos,
    synthesisOutputReference: null,
    synthesisStatus: completion.complete ? "ready" : "awaiting_required_views",
  };
}
