export const PhotoOrientations = Object.freeze([
  "front", "rear", "left_side", "right_side", "side_unspecified",
]);
export const PhotoContractionStates = Object.freeze(["relaxed", "flexed"]);
export const PhotoPoseVariants = Object.freeze([
  "standard", "double_biceps", "lat_spread", "side_chest", "other", "unspecified",
]);

export const CanonicalProgressPhotoCategories = Object.freeze([
  identity("front-relaxed", "Front Relaxed", "front", "relaxed", "standard"),
  identity("back-relaxed", "Rear Relaxed", "rear", "relaxed", "standard"),
  identity("back-flexed", "Rear Flexed — Double Biceps", "rear", "flexed", "double_biceps"),
  identity("side-relaxed", "Side Relaxed", "side_unspecified", "relaxed", "standard"),
  identity("left-side-relaxed", "Left Side Relaxed", "left_side", "relaxed", "standard"),
  identity("right-side-relaxed", "Right Side Relaxed", "right_side", "relaxed", "standard"),
  identity("front-flexed", "Front Flexed", "front", "flexed", "standard"),
]);

export const FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT = Object.freeze({
  id: "founder-alpha-weekly-v2",
  requiredPoseIds: Object.freeze([]),
  minimumConfirmedUsableViews: 1,
});

export const VISIBLE_ABS_PHOTO_CONTRACT = Object.freeze({
  id: "visible-abs-photo-completion-v2",
  requiredPoseId: "front-relaxed",
  supportingPoseIds: Object.freeze([
    "back-relaxed", "back-flexed", "side-relaxed",
    "left-side-relaxed", "right-side-relaxed", "front-flexed",
  ]),
});

export function normalizePhotoViewIdentity(input = {}) {
  const legacy = legacyIdentity(input);
  const orientation = normalizeProgressPhotoView(input.orientation ?? input.view ?? legacy.orientation);
  const contractionState = normalizeProgressPhotoPose(
    input.contractionState ?? input.contraction_state ?? input.pose ?? legacy.contractionState,
    orientation,
  );
  const poseVariant = normalizePoseVariant(
    input.poseVariant ?? input.pose_variant ?? legacy.poseVariant,
    contractionState,
  );
  const customLabel = clean(input.customLabel ?? input.custom_label);
  const poseId = getStructuredPoseId({ orientation, contractionState, poseVariant, customLabel });
  return {
    orientation,
    contractionState,
    poseVariant,
    customLabel,
    poseId,
    label: getPhotoViewIdentityLabel({ orientation, contractionState, poseVariant, customLabel }),
  };
}

export function getStructuredPoseId(input = {}) {
  const { orientation, contractionState, poseVariant, customLabel } = input;
  const known = CanonicalProgressPhotoCategories.find((item) =>
    item.orientation === orientation &&
    item.contractionState === contractionState &&
    item.poseVariant === poseVariant
  );
  if (known) return known.id;
  if (poseVariant === "other" && customLabel) return `custom-${slug(customLabel)}`;
  return [orientation, contractionState, poseVariant].filter(Boolean).join("-") || "unknown";
}

export function getPhotoViewIdentityLabel(input = {}) {
  if (input.poseVariant === "other" && clean(input.customLabel)) return clean(input.customLabel);
  const known = CanonicalProgressPhotoCategories.find((item) =>
    item.orientation === input.orientation &&
    item.contractionState === input.contractionState &&
    item.poseVariant === input.poseVariant
  );
  if (known) return known.label;
  return [orientationLabel(input.orientation), title(input.contractionState),
    !["standard", "unspecified"].includes(input.poseVariant) ? title(input.poseVariant) : null]
    .filter(Boolean).join(" ") || "Progress Photo";
}

export function arePhotoPoseIdentitiesCompatible(left, right) {
  const a = normalizePhotoViewIdentity(left);
  const b = normalizePhotoViewIdentity(right);
  if (a.orientation !== b.orientation) return false;
  if (a.contractionState !== b.contractionState) return false;
  if (a.poseVariant !== b.poseVariant) return false;
  if (a.poseVariant === "other") return Boolean(a.customLabel) && slug(a.customLabel) === slug(b.customLabel);
  return true;
}

export function getCanonicalProgressPhotoCategory(input = {}) {
  const normalized = normalizePhotoViewIdentity(input);
  return CanonicalProgressPhotoCategories.find((item) => item.id === normalized.poseId) ?? null;
}
export function getProgressPhotoCategoryId(input = {}) { return normalizePhotoViewIdentity(input).poseId; }
export function getProgressPhotoCategoryLabel(input = {}) { return normalizePhotoViewIdentity(input).label; }
export function getProgressPhotoDisplayLabel(input = {}) {
  const explicitPoseId = typeof input === "string" ? input : clean(input.poseId ?? input.categoryId ?? input.category_id);
  const label = CanonicalProgressPhotoCategories.find((item) => item.id === explicitPoseId)?.label
    ?? getProgressPhotoCategoryLabel(input);
  return label ? `${label.charAt(0)}${label.slice(1).toLowerCase()}` : "Progress photo";
}
export function getProgressPhotoProseLabel(input = {}) {
  const poseId = typeof input === "string" ? input : getProgressPhotoCategoryId(input);
  return ({
    "front-relaxed": "front relaxed",
    "back-relaxed": "rear relaxed",
    "back-flexed": "rear double biceps",
    "side-relaxed": "side relaxed",
    "left-side-relaxed": "left-side relaxed",
    "right-side-relaxed": "right-side relaxed",
    "front-flexed": "front flexed",
  })[poseId] ?? getProgressPhotoCategoryLabel(input).toLowerCase();
}

export function normalizeProgressPhotoView(value) {
  const normalized = clean(value)?.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["back", "rear"].includes(normalized)) return "rear";
  if (normalized === "front") return "front";
  if (["left", "left_side", "side_left"].includes(normalized)) return "left_side";
  if (["right", "right_side", "side_right"].includes(normalized)) return "right_side";
  if (["side", "side_unspecified"].includes(normalized)) return "side_unspecified";
  return "unknown";
}

export function normalizeProgressPhotoPose(value, orientation = "unknown") {
  const normalized = clean(value)?.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized?.includes("flex") || normalized?.includes("biceps") || normalized === "side_chest") return "flexed";
  if (normalized?.includes("relax")) return "relaxed";
  return ["front", "rear", "left_side", "right_side", "side_unspecified"].includes(orientation) ? "relaxed" : "unknown";
}

export function normalizePoseVariant(value, contractionState = "relaxed") {
  const normalized = clean(value)?.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["double_biceps", "rear_double_biceps", "front_double_biceps"].includes(normalized)) return "double_biceps";
  if (["lat_spread", "side_chest", "other", "unspecified", "standard"].includes(normalized)) return normalized;
  return contractionState === "unknown" ? "unspecified" : "standard";
}

export function getFounderAlphaPhotoSessionCompletion(photos = []) {
  const active = photos.filter(isConfirmedUsablePhoto);
  return {
    completedCount: active.length,
    complete: active.length >= FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.minimumConfirmedUsableViews,
    missingPoseIds: [],
    requiredCount: FOUNDER_ALPHA_PHOTO_SESSION_CONTRACT.minimumConfirmedUsableViews,
  };
}

export function isConfirmedUsablePhoto(photo = {}) {
  return photo.active !== false &&
    !["duplicate", "superseded", "inactive", "hidden"].includes(photo.status) &&
    photo.identityStatus !== "suggested" &&
    photo.identityStatus !== "needs_identity" &&
    photo.userConfirmedIdentity !== false &&
    getProgressPhotoCategoryId(photo) !== "unknown";
}

export function normalizeProgressPhotoCategory(photo = {}) {
  const identity = normalizePhotoViewIdentity(photo);
  return {
    ...photo,
    ...identity,
    categoryId: identity.poseId,
    categoryLabel: identity.label,
    view: identity.orientation === "rear" ? "back" :
      identity.orientation.includes("side") ? "side" : identity.orientation,
    pose: identity.contractionState,
  };
}

function legacyIdentity(input) {
  const text = clean(input.categoryId ?? input.category_id ?? input.poseId ?? input.rawPoseLabel)?.toLowerCase()
    .replaceAll("_", "-").replace("back-", "rear-");
  if (text === "front-relaxed") return fields("front", "relaxed", "standard");
  if (["rear-relaxed", "back-relaxed"].includes(text)) return fields("rear", "relaxed", "standard");
  if (["rear-flexed", "back-flexed", "rear-double-biceps", "rear-flexed-double-biceps"].includes(text)) return fields("rear", "flexed", "double_biceps");
  if (text === "front-flexed") return fields("front", "flexed", "standard");
  if (text === "side-relaxed") return fields("side_unspecified", "relaxed", "standard");
  if (text === "left-side-relaxed") return fields("left_side", "relaxed", "standard");
  if (text === "right-side-relaxed") return fields("right_side", "relaxed", "standard");
  const view = normalizeProgressPhotoView(input.view);
  const pose = normalizeProgressPhotoPose(input.pose, view);
  return fields(view, pose, pose === "flexed" && view === "rear" ? "double_biceps" : "standard");
}
function identity(id, label, orientation, contractionState, poseVariant) {
  return Object.freeze({ id, label, orientation, contractionState, poseVariant,
    view: orientation === "rear" ? "back" : orientation.includes("side") ? "side" : orientation,
    pose: contractionState });
}
function fields(orientation, contractionState, poseVariant) { return { orientation, contractionState, poseVariant }; }
function orientationLabel(value) {
  return ({ front: "Front", rear: "Rear", left_side: "Left Side", right_side: "Right Side",
    side_unspecified: "Side" })[value] ?? "";
}
function title(value) { return clean(value)?.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? ""; }
function clean(value) { const text = String(value ?? "").trim(); return text || null; }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
