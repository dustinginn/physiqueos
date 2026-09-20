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
