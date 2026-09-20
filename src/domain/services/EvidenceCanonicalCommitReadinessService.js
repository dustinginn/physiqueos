export const EvidenceCanonicalCommitReadinessCode = Object.freeze({
  NUTRITION_DAILY_TOTALS_CONFLICT: "NUTRITION_DAILY_TOTALS_CONFLICT",
  PHOTO_POSE_UNRESOLVED: "PHOTO_POSE_UNRESOLVED",
  PHOTO_SESSION_DETAILS_UNRESOLVED: "PHOTO_SESSION_DETAILS_UNRESOLVED",
});

/**
 * Proves that a reviewed package is semantically ready before the durable
 * confirmation receipt is accepted. This is deliberately narrower than the
 * canonical commit itself: it only rejects a conflict already established by
 * interpretation and visible in the review. It never chooses one set of
 * Nutrition totals over another and never mutates the package.
 */
export function assertEvidenceCanonicalCommitReady(evidencePackage, { itemDecisions = {} } = {}) {
  assertPhotoSessionsCommitReady(evidencePackage, { itemDecisions });
  for (const object of evidencePackage?.evidence_objects ?? []) {
    if (object?.removed === true || object?.evidence_type !== "nutrition") continue;
    const reconciliation = resolveNutritionDayReconciliation(object);
    if (reconciliation?.status !== "needs_review") continue;
    const fields = [...new Set((reconciliation.conflicting_fields ?? [])
      .map((field) => String(field ?? "").trim())
      .filter(Boolean))];
    const suffix = fields.length > 0 ? ` for: ${fields.join(", ")}` : "";
    const error = new Error(
      `The supplied daily Nutrition summary conflicts with complete meal totals${suffix}. Correct the review before confirming.`
    );
    error.code = EvidenceCanonicalCommitReadinessCode.NUTRITION_DAILY_TOTALS_CONFLICT;
    error.fields = fields;
    throw error;
  }
  return true;
}
import { resolveNutritionDayReconciliation } from "../models/nutritionDayEvidence.js";
import { getCanonicalProgressPhotoCategory } from "../models/progressPhotoPoseVocabulary.js";

/**
 * A photo session can be confirmed only when every included photo has a
 * canonical pose and the shared session details (capture time and Goal
 * relationship) are decided. This is the one definition of that gate: the Web
 * confirmation action and the Native confirmation command both call it, and
 * the Native command calls it BEFORE recording a confirmation receipt, so a
 * review that cannot proceed is refused instead of being acknowledged and then
 * left pending. Objects the Founder excluded (`itemDecisions`) or removed are
 * not held to it.
 */
export function assertPhotoSessionsCommitReady(evidencePackage, { itemDecisions = {} } = {}) {
  for (const object of evidencePackage?.evidence_objects ?? []) {
    if (object?.removed || object?.evidence_type !== "photo_session") continue;
    if (itemDecisions?.[object.id]?.included === false) continue;
    const unresolved = (object.photos ?? []).filter((photo) =>
      photo.active !== false && !getCanonicalProgressPhotoCategory(photo)
    );
    if (unresolved.length) {
      const error = new Error(`Choose a pose for ${unresolved.length === 1 ? "the remaining photo" : `all ${unresolved.length} remaining photos`} before saving.`);
      error.code = EvidenceCanonicalCommitReadinessCode.PHOTO_POSE_UNRESOLVED;
      error.fields = [];
      throw error;
    }
    if (object.captureMetadata?.status === "needs_review" || object.goalRelationship?.status === "needs_review") {
      const error = new Error("Review the shared photo-session details before saving.");
      error.code = EvidenceCanonicalCommitReadinessCode.PHOTO_SESSION_DETAILS_UNRESOLVED;
      error.fields = [];
      throw error;
    }
  }
  return true;
}
