export const CanonicalProgressPhotoCategories = [
  {
    id: "front-relaxed",
    label: "Front Relaxed",
    pose: "relaxed",
    view: "front",
  },
  {
    id: "side-relaxed",
    label: "Side Relaxed",
    pose: "relaxed",
    view: "side",
  },
  {
    id: "back-relaxed",
    label: "Rear Relaxed",
    pose: "relaxed",
    view: "back",
  },
  {
    id: "back-flexed",
    label: "Rear Flexed",
    pose: "flexed",
    view: "back",
  },
];

export const FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT = Object.freeze({
  id: "founder-alpha-weekly-v1",
  requiredPoseIds: Object.freeze([
    "front-relaxed",
    "back-relaxed",
    "back-flexed",
  ]),
});

export function getCanonicalProgressPhotoCategory({ pose, view } = {}) {
  const canonicalView = normalizeProgressPhotoView(view);
  const canonicalPose = normalizeProgressPhotoPose(pose, canonicalView);

  return (
    CanonicalProgressPhotoCategories.find(
      (category) =>
        category.view === canonicalView && category.pose === canonicalPose
    ) ?? null
  );
}

export function getProgressPhotoCategoryId({ pose, view } = {}) {
  return getCanonicalProgressPhotoCategory({ pose, view })?.id ?? "unknown";
}

export function getProgressPhotoCategoryLabel({ pose, view } = {}) {
  return (
    getCanonicalProgressPhotoCategory({ pose, view })?.label ??
    "Progress Photo"
  );
}

export function normalizeProgressPhotoView(value) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();

  if (normalized === "back" || normalized === "rear") return "back";
  if (normalized === "front") return "front";
  if (normalized === "side") return "side";

  return "unknown";
}

export function normalizeProgressPhotoPose(value, view = "unknown") {
  const normalized = String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  const canonicalView = normalizeProgressPhotoView(view);

  if (
    normalized === "double_biceps" ||
    normalized === "rear_double_biceps" ||
    normalized === "back_double_biceps"
  ) return "flexed";
  if (normalized === "rear_flexed" || normalized === "back_flexed") return "flexed";
  if (normalized === "flexed") return canonicalView === "back" ? "flexed" : "relaxed";
  if (
    normalized === "front_relaxed" ||
    normalized === "rear_relaxed" ||
    normalized === "side_relaxed"
  ) {
    return "relaxed";
  }
  if (normalized === "relaxed") return "relaxed";

  return canonicalView === "unknown" ? "unknown" : "relaxed";
}

export function getFounderAlphaPhotoSessionCompletion(photos = []) {
  const activePoseIds = new Set(
    photos
      .filter((photo) => !["duplicate", "superseded", "inactive"].includes(photo.status))
      .map((photo) => getProgressPhotoCategoryId(photo))
  );
  const missingPoseIds = FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.requiredPoseIds.filter(
    (poseId) => !activePoseIds.has(poseId)
  );

  return {
    completedCount:
      FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.requiredPoseIds.length - missingPoseIds.length,
    complete: missingPoseIds.length === 0,
    missingPoseIds,
    requiredCount: FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.requiredPoseIds.length,
  };
}

export function normalizeProgressPhotoCategory(photo = {}) {
  const view = normalizeProgressPhotoView(photo.view);
  const pose = normalizeProgressPhotoPose(photo.pose, view);

  return {
    ...photo,
    categoryId: getProgressPhotoCategoryId({ pose, view }),
    categoryLabel: getProgressPhotoCategoryLabel({ pose, view }),
    pose,
    view,
  };
}
