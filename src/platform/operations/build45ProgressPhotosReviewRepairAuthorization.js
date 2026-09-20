/**
 * The exact, single authorization for repairing the real Build 45 Progress
 * Photos Evidence Review. Every value below was established by read-only
 * inspection of the pending review and by the Founder's explicit decisions:
 *
 *  - "Rear Double Biceps = Flexed"; the stored rear + relaxed + double biceps
 *    identity is contradictory and came from a Native control defect. Ordinal 3
 *    is corrected to rear + flexed + double biceps. No other identity changes.
 *  - The session belongs to the active Build Lean Mass Goal, resolved by the
 *    deterministic resolver, not chosen by hand here.
 *
 * Nothing in this file executes anything. Applying it requires a separate,
 * explicit authorization to run the runner in `apply` mode.
 */
export const BUILD45_PROGRESS_PHOTOS_REVIEW_REPAIR_AUTHORIZATION = Object.freeze({
  repairId: "progress-photos-build45-pose-and-goal-repair-v1",
  ownerUserId: "user_founder_001",
  reviewId: "evidence_review_B5A63452E7B0469CA63438A08137716C",
  packageId: "evidence_submission_B5A63452E7B0469CA63438A08137716C_progress_photos",
  intakeReceiptId: "evidence_intake_B5A63452-E7B0-469C-A634-38A08137716C",
  objectId: "evidence_submission_B5A63452E7B0469CA63438A08137716C_progress_photos",
  expectedReviewVersion: 1,
  poseCorrection: Object.freeze({
    ordinal: 3,
    from: Object.freeze({ orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps" }),
    to: Object.freeze({ orientation: "rear", contractionState: "flexed", poseVariant: "double_biceps" }),
  }),
  expectedGoalId: "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
  authorizedBy: "founder",
  basis: "Founder decision: Rear Double Biceps is Flexed; the Sep 19 Progress Photos evidence belongs to the active Build Lean Mass goal.",
});
