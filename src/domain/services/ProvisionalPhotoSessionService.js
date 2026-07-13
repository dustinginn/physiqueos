import {
  FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT,
  getProgressPhotoCategoryId,
  normalizeProgressPhotoCategory,
} from "../models/progressPhotoPoseVocabulary";

export function createProvisionalPhotoSession({ reviewId = null, captureDate, photos = [], conditions = {}, comparisonCandidates = [] } = {}) {
  const normalizedPhotos = photos.map((photo, index) => ({
    ...normalizeProgressPhotoCategory(photo),
    active: photo.active !== false,
    order: Number.isFinite(photo.order) ? photo.order : index,
  }));
  const validation = validateProvisionalPhotoSession(normalizedPhotos);
  return {
    id: reviewId ? `provisional_session_${reviewId}` : `provisional_session_${captureDate}`,
    evidence_type: "photo_session",
    provisional: true,
    review_id: reviewId,
    observed_at: captureDate,
    photos: normalizedPhotos,
    conditions,
    comparison_candidates: comparisonCandidates,
    required_pose_ids: FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.requiredPoseIds,
    ...validation,
  };
}

export function validateProvisionalPhotoSession(photos = []) {
  const active = photos.filter((photo) => photo.active !== false);
  const poseCounts = active.reduce((counts, photo) => {
    const id = getProgressPhotoCategoryId(photo);
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
  const duplicate_pose_ids = Object.entries(poseCounts).filter(([id, count]) => id !== "unknown" && count > 1).map(([id]) => id);
  const missing_required_pose_ids = FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.requiredPoseIds.filter((id) => !poseCounts[id]);
  return {
    duplicate_pose_ids,
    missing_required_pose_ids,
    completion_state: duplicate_pose_ids.length === 0 && missing_required_pose_ids.length === 0 ? "complete" : "incomplete",
  };
}
