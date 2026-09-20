/**
 * The exact, single authorization for resuming the real Build 46 Progress
 * Photos Evidence Review whose analysis continuation was killed repeatedly by a
 * worker out-of-memory condition. Every value was established by read-only
 * inspection of production. Nothing in this file executes anything: applying it
 * requires a separate, explicit run of the recovery runner in `apply` mode.
 *
 * What recovery is: the review, its canonical PhotoSession, its five canonical
 * photos, its compatibility rows, and the completed Sep 19 priority are all
 * durable and correct. Only the continuation MESSAGE is spent (it was claimed
 * more times than a message may be, by a process that died each time). Recovery
 * gives that one message a fresh attempt budget so the corrected worker resumes
 * from the first incomplete step through the existing idempotent path.
 */
export const BUILD46_PHOTO_CONTINUATION_RECOVERY_AUTHORIZATION = Object.freeze({
  recoveryId: "progress-photos-build46-continuation-recovery-v1",
  ownerUserId: "user_founder_001",
  reviewId: "evidence_review_B5A63452E7B0469CA63438A08137716C",
  packageId: "evidence_submission_B5A63452E7B0469CA63438A08137716C_progress_photos",
  intakeReceiptId: "evidence_intake_B5A63452-E7B0-469C-A634-38A08137716C",
  messageId: "aedcb3bc-87fa-4878-a35b-fc9f61f5e839",
  sessionId: "photo_session_user_founder_001_2026-09-19",
  evidenceDate: "2026-09-19",
  expectedCompletedSteps: Object.freeze(["canonical_commit", "compatibility_writes", "scheduled_completion"]),
  expectedCanonicalPhotoCount: 5,
  authorizedBy: "founder",
  basis: "Founder instruction: recover the existing real review exactly once after the corrected Server is verified; do not ask the Founder to reconfirm.",
});

/**
 * The second, separately authorized recovery for the same review. The first recovery
 * resumed analysis, training events, goal evaluation, and event eligibility on the corrected
 * worker. The briefing step then failed on a distinct, since-corrected defect (the Photo
 * Event read store injected a numeric storage version onto the Goal, which the Goal Contract
 * V3 adapter rejected), exhausted its attempt budget, and left the review `partially_committed`.
 * Everything before the briefing step is durable and correct, so recovery again only gives the
 * one spent continuation message a fresh attempt budget.
 */
export const BUILD46_PHOTO_BRIEFING_RECOVERY_AUTHORIZATION = Object.freeze({
  ...BUILD46_PHOTO_CONTINUATION_RECOVERY_AUTHORIZATION,
  recoveryId: "progress-photos-build46-briefing-recovery-v1",
  messageId: "3d4a3a41-f347-4a08-89c6-f6aa7816bb83",
  expectedCompletedSteps: Object.freeze([
    "canonical_commit", "compatibility_writes", "scheduled_completion",
    "analysis", "training_performance_events", "goal_evaluation", "event_eligibility",
  ]),
  expectedPhotoAnalyses: 6,
  basis: "Founder instruction: recover the existing real review exactly once after the corrected Server is verified; do not ask the Founder to reconfirm.",
});
