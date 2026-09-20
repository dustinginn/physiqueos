import { getCanonicalProgressPhotoCategory, isCanonicalPoseIdentity, normalizePhotoViewIdentity } from "../models/progressPhotoPoseVocabulary.js";
import { resolvePhotoSessionGoalRelationship } from "./PhotoSessionMetadataService.js";

/**
 * A bounded, one-review, one-shot correction of a pending Progress Photos
 * Evidence Review whose stored identity contradicts the canonical pose
 * contract and whose session Goal relationship was left `needs_review` by the
 * earlier, ambiguous resolution.
 *
 * This is deliberately NOT a post-upload pose editor. It corrects exactly what
 * an explicit authorization names (one photo's contraction, and the session
 * Goal relationship as the deterministic resolver now decides it), refuses
 * anything else, and proves before writing that nothing outside the authorized
 * paths changed. It is pure: it plans the corrected review and reports the
 * exact paths it changes; a separate runner persists it under optimistic
 * concurrency.
 */
export class PhotoSessionReviewRepairError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PhotoSessionReviewRepairError";
    this.code = code;
  }
}

const refuse = (code, message) => { throw new PhotoSessionReviewRepairError(code, message); };

export function planPhotoSessionReviewRepair({
  review,
  authorization,
  goals = [],
  executionItems = [],
  now = () => new Date(),
} = {}) {
  assertAuthorization(authorization);
  const { reviewId, packageId, intakeReceiptId, objectId, expectedReviewVersion, poseCorrection, expectedGoalId, repairId } = authorization;

  if (!review || review.id !== reviewId) refuse("REPAIR_REVIEW_MISMATCH", "The review is not the exact review this repair was authorized for.");
  if (review.intakeReceiptId !== intakeReceiptId) refuse("REPAIR_INTAKE_MISMATCH", "The review does not belong to the authorized intake.");
  const evidence = review.interpretedEvidence;
  if (evidence?.package_id !== packageId) refuse("REPAIR_PACKAGE_MISMATCH", "The review does not carry the authorized evidence package.");
  const objects = (evidence.evidence_objects ?? []).filter((item) => item?.evidence_type === "photo_session");
  const objectIndex = (evidence.evidence_objects ?? []).findIndex((item) => item?.id === objectId);
  if (objects.length !== 1 || objectIndex < 0) refuse("REPAIR_OBJECT_MISMATCH", "The review must contain exactly the authorized photo session.");

  const corrections = evidence.review_metadata?.corrections ?? [];
  const alreadyRecorded = corrections.some((item) => item?.id === repairId);
  const target = poseCorrection.to;
  const photoIndex = poseCorrection.ordinal - 1;
  const object = evidence.evidence_objects[objectIndex];
  const photo = object.photos?.[photoIndex];
  if (!photo || photo.id !== `${objectId}_${poseCorrection.ordinal}`) refuse("REPAIR_PHOTO_MISMATCH", "The authorized photo is not at the authorized ordinal.");

  const matches = (identity, expected) => identity?.orientation === expected.orientation &&
    identity?.contractionState === expected.contractionState && identity?.poseVariant === expected.poseVariant;

  if (alreadyRecorded) {
    // Idempotent replay: only a fully repaired review is acceptable.
    if (matches(photo, target) && object.goalRelationship?.status === "resolved" && object.goalRelationship.goalIds?.[0] === expectedGoalId) {
      return Object.freeze({ outcome: "already_applied", review, updatedReview: review, changedPaths: Object.freeze([]) });
    }
    refuse("REPAIR_STATE_INCONSISTENT", "The review records this repair but does not have the repaired state.");
  }

  // Exact preconditions: pending, untouched, the version that was inspected.
  if (review.status !== "pending") refuse("REPAIR_REVIEW_NOT_PENDING", "Only a pending review can be repaired.");
  if (Number(review.version) !== Number(expectedReviewVersion)) refuse("REPAIR_VERSION_MISMATCH", "The review is not at the version that was inspected.");
  if (review.confirmation != null || review.commitClaim || Object.keys(review.itemDecisions ?? {}).length > 0 || Object.keys(review.commitProgress ?? {}).length > 0) {
    refuse("REPAIR_REVIEW_TOUCHED", "The review already carries a confirmation, claim, decision, or commit progress.");
  }
  if (!matches(photo, poseCorrection.from)) refuse("REPAIR_POSE_PRECONDITION", "The photo does not carry the exact identity the repair was authorized to correct.");
  if (!isCanonicalPoseIdentity(target)) refuse("REPAIR_TARGET_NOT_CANONICAL", "The authorized target identity is not a canonical pose.");
  // Every other photo must already be canonical; the repair never fixes what it was not authorized to fix.
  object.photos.forEach((other, index) => {
    if (index !== photoIndex && (!getCanonicalProgressPhotoCategory(other) || other.active === false)) {
      refuse("REPAIR_OTHER_PHOTO_UNRESOLVED", `Photo ${index + 1} is not canonical; only photo ${poseCorrection.ordinal} may be corrected.`);
    }
  });
  if (object.goalRelationship?.status !== "needs_review") refuse("REPAIR_GOAL_PRECONDITION", "The session Goal relationship is not the unresolved state the repair was authorized to resolve.");

  const resolved = resolvePhotoSessionGoalRelationship({ evidenceDate: object.observed_at, goals, executionItems });
  if (resolved.status !== "resolved" || resolved.goalIds?.length !== 1 || resolved.goalIds[0] !== expectedGoalId) {
    refuse("REPAIR_GOAL_NOT_DETERMINISTIC", "The corrected resolver does not deterministically select the authorized Goal.");
  }

  const corrected = normalizePhotoViewIdentity(target);
  const after = structuredClone(review);
  const afterObject = after.interpretedEvidence.evidence_objects[objectIndex];
  Object.assign(afterObject.photos[photoIndex], {
    contractionState: corrected.contractionState,
    pose: corrected.contractionState,
    poseId: corrected.poseId,
    label: corrected.label,
  });
  afterObject.goalRelationship = resolved;
  const recovery = after.interpretedEvidence.review_metadata?.recoveryContext?.photoIdentities;
  if (Array.isArray(recovery) && recovery[photoIndex]) {
    if (!matches(recovery[photoIndex], poseCorrection.from)) refuse("REPAIR_RECOVERY_CONTEXT_MISMATCH", "The review's copy of the submitted identity does not match the authorized precondition.");
    Object.assign(recovery[photoIndex], { contractionState: corrected.contractionState, poseId: corrected.poseId, label: corrected.label });
  }
  const appliedAt = now().toISOString();
  after.interpretedEvidence.review_metadata = {
    ...(after.interpretedEvidence.review_metadata ?? {}),
    corrections: [...corrections, Object.freeze({
      id: repairId,
      kind: "progress_photo_session_repair",
      authorizedBy: authorization.authorizedBy,
      basis: authorization.basis,
      appliedAt,
      reviewVersionBefore: Number(review.version),
      photo: { ordinal: poseCorrection.ordinal, from: poseCorrection.from, to: target },
      goalRelationship: { from: object.goalRelationship?.status ?? null, to: resolved.status, goalIds: resolved.goalIds, source: resolved.source },
    })],
  };
  after.updatedAt = appliedAt;

  const changedPaths = diffPaths(review, after);
  const outside = changedPaths.filter((path) => !isAuthorizedPath(path, { objectIndex, photoIndex }));
  if (outside.length) refuse("REPAIR_OUT_OF_BOUNDS", `The repair would change paths it is not authorized to change: ${outside.join(", ")}`);
  // Defence in depth: the repaired session must now pass the readiness gate's own definition.
  if (afterObject.photos.some((item) => item.active !== false && !getCanonicalProgressPhotoCategory(item))) refuse("REPAIR_INCOMPLETE", "The repaired session still has an unresolved pose.");

  return Object.freeze({ outcome: "planned", review, updatedReview: after, changedPaths: Object.freeze(changedPaths) });
}

function assertAuthorization(authorization) {
  const required = ["repairId", "reviewId", "packageId", "intakeReceiptId", "objectId", "ownerUserId", "expectedReviewVersion", "expectedGoalId", "authorizedBy", "basis"];
  for (const key of required) if (authorization?.[key] == null || authorization[key] === "") refuse("REPAIR_AUTHORIZATION_INCOMPLETE", `The repair authorization is missing ${key}.`);
  const correction = authorization.poseCorrection;
  if (!Number.isInteger(correction?.ordinal) || correction.ordinal < 1 || !correction.from || !correction.to) refuse("REPAIR_AUTHORIZATION_INCOMPLETE", "The repair authorization must name one photo ordinal with its exact from and to identities.");
  if (correction.from.orientation !== correction.to.orientation || correction.from.poseVariant !== correction.to.poseVariant) {
    refuse("REPAIR_AUTHORIZATION_TOO_BROAD", "A repair may change only the named photo's contraction.");
  }
}

/** Exactly what a repair may touch: one photo's contraction identity, the session Goal relationship, the review's copy of that identity, the audit entry, and the update time. */
function isAuthorizedPath(path, { objectIndex, photoIndex }) {
  const base = `interpretedEvidence.evidence_objects[${objectIndex}]`;
  if (path === "updatedAt") return true;
  if (path.startsWith(`${base}.goalRelationship`)) return true;
  if (["contractionState", "pose", "poseId", "label"].some((field) => path === `${base}.photos[${photoIndex}].${field}`)) return true;
  if (["contractionState", "poseId", "label"].some((field) => path === `interpretedEvidence.review_metadata.recoveryContext.photoIdentities[${photoIndex}].${field}`)) return true;
  return path.startsWith("interpretedEvidence.review_metadata.corrections");
}

/** Leaf-level structural diff; array and object growth is reported at the point of addition. */
export function diffPaths(before, after, path = "") {
  if (Object.is(before, after)) return [];
  const bothObjects = before && after && typeof before === "object" && typeof after === "object";
  if (!bothObjects || Array.isArray(before) !== Array.isArray(after)) return [path || "(root)"];
  const paths = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const child = Array.isArray(before) ? `${path}[${key}]` : (path ? `${path}.${key}` : key);
    if (!(key in before) || !(key in after)) { paths.push(child); continue; }
    paths.push(...diffPaths(before[key], after[key], child));
  }
  return paths;
}
